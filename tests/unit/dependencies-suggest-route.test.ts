import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decodeCandidateIds } from "@/lib/ai/dependency-proposals";
import type { BoardView, CardSummary, ColumnView } from "@/lib/boards/view-model";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  getBoardView: vi.fn(),
  getDecompositionModel: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/boards/queries", () => ({ getBoardView: mocks.getBoardView }));
vi.mock("@/lib/ai/decompose", () => ({ getDecompositionModel: mocks.getDecompositionModel }));

import { POST } from "@/app/api/cards/[cardId]/dependencies/suggest/route";

const BOARD_ID = "00000000-0000-4000-8000-00000000b0a0";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TARGET = uuid(1);

function card(id: string, columnId = "col-1"): CardSummary {
  return {
    id,
    columnId,
    title: `Card ${id.slice(-4)}`,
    description: null,
    position: id,
    dueOn: null,
    completedAt: null,
    labels: [],
    assignees: [],
    subtasks: [],
  };
}

function column(id: string, cards: CardSummary[], isDone = false): ColumnView {
  return { id, title: id, position: id, isDone, cards };
}

function view(columns: ColumnView[], dependencies: BoardView["dependencies"] = []): BoardView {
  return {
    board: { id: BOARD_ID, title: "Board" },
    columns,
    archivedCards: [],
    labels: [],
    members: [],
    dependencies,
  };
}

const edge = (blockerId: string, blockedId: string) => ({
  blockerId,
  blockedId,
  source: "manual" as const,
});

type Fake = {
  card: { board_id: string } | null;
  cardError: unknown;
  canEdit: boolean;
  reserve: { data: { remaining: number } | null; error: { code: string } | null };
};

let calls: { table?: string; rpc?: string; args?: unknown }[];
let fake: Fake;

function setup(overrides: Partial<Fake> = {}) {
  calls = [];
  fake = {
    card: { board_id: BOARD_ID },
    cardError: null,
    canEdit: true,
    reserve: { data: { remaining: 7 }, error: null },
    ...overrides,
  };
  mocks.createClient.mockResolvedValue({
    from(table: string) {
      calls.push({ table });
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: fake.card, error: fake.cardError }),
      };
      return chain;
    },
    rpc(name: string, args?: unknown) {
      calls.push({ rpc: name, args });
      if (name === "has_board_role") return Promise.resolve({ data: fake.canEdit, error: null });
      return { single: async () => fake.reserve };
    },
  });
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const MODEL_TEXT = JSON.stringify({ dependencies: [] });

function mockModel(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage,
          },
        ],
      }),
    }),
  });
}

function call(cardId: string = TARGET) {
  return POST(
    new Request(`http://localhost/api/cards/${cardId}/dependencies/suggest`, { method: "POST" }),
    {
      params: Promise.resolve({ cardId }),
    },
  );
}

const reserveCalled = () => calls.some((c) => c.rpc === "reserve_ai_decomposition");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getServerEnv.mockReturnValue({ AI_DECOMPOSITION_ENABLED: true });
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.getBoardView.mockResolvedValue(view([column("col-1", [card(TARGET), card(uuid(2))])]));
  mocks.getDecompositionModel.mockReturnValue(mockModel(MODEL_TEXT));
  setup();
});

describe("POST /api/cards/[cardId]/dependencies/suggest", () => {
  it("returns 404 without touching the database when the flag is off", async () => {
    mocks.getServerEnv.mockReturnValue({ AI_DECOMPOSITION_ENABLED: false });
    const response = await call();
    expect(response.status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid card id", async () => {
    expect((await call("not-a-uuid")).status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 404 when the card is not visible", async () => {
    setup({ card: null });
    expect((await call()).status).toBe(404);
    expect(reserveCalled()).toBe(false);
  });

  it("returns 500 when the card lookup fails", async () => {
    setup({ cardError: { message: "boom" } });
    expect((await call()).status).toBe(500);
    expect(reserveCalled()).toBe(false);
  });

  it("returns 403 for users who cannot edit the board", async () => {
    setup({ canEdit: false });
    const response = await call();
    expect(response.status).toBe(403);
    expect(calls).toContainEqual({
      rpc: "has_board_role",
      args: { p_board_id: BOARD_ID, p_roles: ["owner", "editor"] },
    });
    expect(reserveCalled()).toBe(false);
    expect(mocks.getBoardView).not.toHaveBeenCalled();
  });

  it("returns 409 without reserving quota for an archived card", async () => {
    mocks.getBoardView.mockResolvedValue(view([column("col-1", [card(uuid(2))])]));
    expect((await call()).status).toBe(409);
    expect(reserveCalled()).toBe(false);
  });

  it("returns 409 without reserving quota when there are no candidates", async () => {
    mocks.getBoardView.mockResolvedValue(view([column("col-1", [card(TARGET)])]));
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/no other cards/i);
    expect(reserveCalled()).toBe(false);
  });

  it("returns 409 without reserving quota when the card already has 20 blockers", async () => {
    const blockers = Array.from({ length: 20 }, (_, i) => uuid(10 + i));
    mocks.getBoardView.mockResolvedValue(
      view(
        [column("col-1", [card(TARGET), ...blockers.map((id) => card(id)), card(uuid(99))])],
        blockers.map((id) => edge(id, TARGET)),
      ),
    );
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/maximum number of blockers/i);
    expect(reserveCalled()).toBe(false);
  });

  it.each([
    ["AIQ01", /used all your AI suggestions/i],
    ["AIQ02", /paused for everyone/i],
  ])("returns 429 with Retry-After for quota code %s", async (code, message) => {
    setup({ reserve: { data: null, error: { code } } });
    const response = await call();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect((await response.json()).error).toMatch(message);
    expect(mocks.getDecompositionModel).not.toHaveBeenCalled();
  });

  it("returns 500 for any other reservation error", async () => {
    setup({ reserve: { data: null, error: { code: "XX000" } } });
    expect((await call()).status).toBe(500);
    expect(mocks.getDecompositionModel).not.toHaveBeenCalled();
  });

  it("streams the model text with quota and candidate headers", async () => {
    const a = uuid(2);
    const b = uuid(3);
    const done = uuid(4);
    const blocker = uuid(5);
    const downstream = uuid(6);
    const other = uuid(7);
    mocks.getBoardView.mockResolvedValue(
      view(
        [
          column("col-1", [card(a), card(TARGET), card(blocker), card(b), card(downstream)]),
          column("col-2", [card(done), card(other)], true),
        ],
        [edge(blocker, TARGET), edge(TARGET, downstream)],
      ),
    );
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Quota-Remaining")).toBe("7");
    expect(decodeCandidateIds(response.headers.get("X-Candidate-Ids"))).toEqual([
      a,
      b,
      done,
      other,
    ]);
    expect(await response.text()).toBe(MODEL_TEXT);
    expect(calls.filter((c) => c.rpc === "reserve_ai_decomposition")).toHaveLength(1);
  });

  it("sends only the first 100 candidates in board order", async () => {
    const ids = Array.from({ length: 130 }, (_, i) => uuid(1000 + i));
    mocks.getBoardView.mockResolvedValue(
      view([column("col-1", [card(TARGET), ...ids.map((id) => card(id))])]),
    );
    const response = await call();
    expect(response.status).toBe(200);
    expect(decodeCandidateIds(response.headers.get("X-Candidate-Ids"))).toEqual(ids.slice(0, 100));
    await response.text();
  });
});
