import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new RedirectSignal(path);
  }),
  auth: {
    verifyOtp: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resend: vi.fn(),
  },
}));

/** Stands in for Next's redirect(), which throws to end the action. */
class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`redirect ${path}`);
  }
}

vi.mock("@/lib/db/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { confirmEmail } from "@/app/(auth)/actions";

const HASH = "f".repeat(56);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof RedirectSignal)) throw new Error("expected a redirect");
  return error.path;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ auth: mocks.auth });
  mocks.headers.mockResolvedValue(new Headers({ origin: "https://kanban.example" }));
});

describe("confirmEmail", () => {
  it("verifies the token hash and redirects to the sanitised next", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });

    const path = await redirectOf(confirmEmail({}, form({ token_hash: HASH, next: "/invite/x" })));

    expect(path).toBe("/invite/x");
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: HASH });
  });

  it("never redirects off-site", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });

    const path = await redirectOf(
      confirmEmail({}, form({ token_hash: HASH, next: "https://evil.example" })),
    );

    expect(path).toBe("/boards");
  });

  it("explains an expired or used link", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { code: "otp_expired", status: 403, message: "Token has expired or is invalid" },
    });

    const state = await confirmEmail({}, form({ token_hash: HASH, next: "/boards" }));

    expect(state.error).toMatch(/expired or was already used/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects a malformed token without calling Supabase", async () => {
    const state = await confirmEmail({}, form({ token_hash: "<x>", next: "/boards" }));

    expect(state.error).toBeDefined();
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
  });
});
