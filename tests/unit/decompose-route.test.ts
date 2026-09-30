import { beforeEach, describe, expect, it, vi } from "vitest";

import { textModel } from "../helpers/mock-models";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  getDecompositionModel: vi.fn(),
  afterTasks: [] as (() => unknown)[],
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/server", () => ({ createClient: mocks.createClient }));
// after() only works inside a request scope: collect its tasks and run them by hand.
vi.mock("next/server", () => ({ after: (task: () => unknown) => mocks.afterTasks.push(task) }));
// Keep the real streamDecomposition; only the model is replaced.
vi.mock("@/lib/ai/decompose", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/decompose")>()),
  getDecompositionModel: mocks.getDecompositionModel,
}));

import { POST } from "@/app/api/cards/[cardId]/decompose/route";

const BOARD_ID = "00000000-0000-4000-8000-00000000b0a0";
const CARD_ID = "00000000-0000-4000-8000-000000000001";
const USAGE_ID = "00000000-0000-4000-8000-000000000099";

type Fake = {
  card: { board_id: string; title: string; description: string | null } | null;
  cardError: unknown;
  canEdit: boolean;
  subtasks: { data: { title: string }[] | null; error: unknown };
  reserve: { data: { remaining: number; usage_id: string } | null; error: { code: string } | null };
};

let calls: { table?: string; rpc?: string; args?: unknown }[];
let fake: Fake;

function setup(overrides: Partial<Fake> = {}) {
  calls = [];
  mocks.afterTasks.length = 0;
  fake = {
    card: { board_id: BOARD_ID, title: "Add search", description: null },
    cardError: null,
    canEdit: true,
    subtasks: { data: [{ title: "Existing" }], error: null },
    reserve: { data: { remaining: 4, usage_id: USAGE_ID }, error: null },
    ...overrides,
  };
  mocks.createClient.mockResolvedValue({
    from(table: string) {
      calls.push({ table });
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: async () => fake.subtasks,
        maybeSingle: async () => ({ data: fake.card, error: fake.cardError }),
      };
      return chain;
    },
    rpc(name: string, args?: unknown) {
      calls.push({ rpc: name, args });
      if (name === "has_board_role") return Promise.resolve({ data: fake.canEdit, error: null });
      if (name === "record_ai_usage") return Promise.resolve({ error: null });
      return { single: async () => fake.reserve };
    },
  });
}

const MODEL_TEXT = JSON.stringify({ subtasks: [{ title: "Write the migration", estimate: 3 }] });

function call(cardId: string = CARD_ID) {
  return POST(new Request(`http://localhost/api/cards/${cardId}/decompose`, { method: "POST" }), {
    params: Promise.resolve({ cardId }),
  });
}

const reserveCalls = () => calls.filter((c) => c.rpc === "reserve_ai_decomposition");
const recordCalls = () => calls.filter((c) => c.rpc === "record_ai_usage");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getServerEnv.mockReturnValue({ AI_DECOMPOSITION_ENABLED: true });
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.getDecompositionModel.mockReturnValue(textModel(MODEL_TEXT));
  setup();
});

describe("POST /api/cards/[cardId]/decompose", () => {
  it("returns 404 without touching the database when the flag is off", async () => {
    mocks.getServerEnv.mockReturnValue({ AI_DECOMPOSITION_ENABLED: false });
    expect((await call()).status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 403 for viewers without reserving quota", async () => {
    setup({ canEdit: false });
    expect((await call()).status).toBe(403);
    expect(reserveCalls()).toHaveLength(0);
    expect(mocks.afterTasks).toHaveLength(0);
  });

  it.each([
    ["AIQ01", /used all your AI suggestions/i],
    ["AIQ02", /paused for everyone/i],
  ])("returns 429 with Retry-After for quota code %s and schedules nothing", async (code, msg) => {
    setup({ reserve: { data: null, error: { code } } });
    const response = await call();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect((await response.json()).error).toMatch(msg);
    expect(mocks.getDecompositionModel).not.toHaveBeenCalled();
    expect(mocks.afterTasks).toHaveLength(0);
  });

  it("streams the proposal, hides the usage id and records the outcome in after()", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Quota-Remaining")).toBe("4");
    expect(reserveCalls()).toHaveLength(1);
    expect(reserveCalls()[0]!.args).toEqual({ p_feature: "decompose" });
    expect([...response.headers.values()].join(" ")).not.toContain(USAGE_ID);
    const body = await response.text();
    expect(body).toBe(MODEL_TEXT);
    expect(body).not.toContain(USAGE_ID);

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(mocks.afterTasks).toHaveLength(1);
    await mocks.afterTasks[0]!();
    expect(recordCalls()).toHaveLength(1);
    expect(recordCalls()[0]!.args).toMatchObject({ p_usage_id: USAGE_ID, p_outcome: "ok" });
    info.mockRestore();
  });

  it("returns 500 and records an error with zero cost when the subtasks fetch fails", async () => {
    setup({ subtasks: { data: null, error: { message: "boom" } } });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await call();
    expect(response.status).toBe(500);
    expect(mocks.getDecompositionModel).not.toHaveBeenCalled();
    expect(mocks.afterTasks).toHaveLength(1);
    await mocks.afterTasks[0]!();
    expect(recordCalls()).toHaveLength(1);
    expect(recordCalls()[0]!.args).toMatchObject({
      p_usage_id: USAGE_ID,
      p_outcome: "error",
      p_actual_cost_usd: 0,
    });
    info.mockRestore();
  });
});
