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

import { confirmEmail, login, resendConfirmation, signup } from "@/app/(auth)/actions";

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

const CREDENTIALS = { email: "new@example.com", password: "long-enough-1" };

describe("signup", () => {
  it("asks Supabase to link back to the confirm page on this origin, keeping next", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });

    await signup({}, form({ ...CREDENTIALS, next: "/invite/abc" }));

    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      ...CREDENTIALS,
      options: {
        emailRedirectTo: "https://kanban.example/auth/confirm?next=%2Finvite%2Fabc",
      },
    });
  });

  it("returns 'check your email' when confirmation is required", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });

    const state = await signup({}, form({ ...CREDENTIALS, next: "/boards" }));

    expect(state).toEqual({ confirmationSentTo: CREDENTIALS.email, email: CREDENTIALS.email });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still signs in directly when the project doesn't require confirmation", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: {}, user: {} }, error: null });

    expect(await redirectOf(signup({}, form({ ...CREDENTIALS, next: "/invite/abc" })))).toBe(
      "/invite/abc",
    );
  });

  it("lets Supabase fall back to the Site URL when the origin is unknown", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });

    await signup({}, form({ ...CREDENTIALS, next: "/boards" }));

    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      ...CREDENTIALS,
      options: { emailRedirectTo: undefined },
    });
  });

  it("does not call Supabase for invalid input", async () => {
    const state = await signup({}, form({ email: "nope", password: "short" }));

    expect(state.fieldErrors?.email).toBeDefined();
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("flags an unconfirmed email so the form can offer a resend", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "email_not_confirmed", status: 400 },
    });

    const state = await login({}, form({ ...CREDENTIALS, next: "/boards" }));

    expect(state).toEqual({
      formError: "Confirm your email address before signing in.",
      email: CREDENTIALS.email,
      unconfirmed: true,
    });
  });

  it("does not offer a resend for wrong credentials", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "invalid_credentials", status: 400 },
    });

    const state = await login({}, form({ ...CREDENTIALS, next: "/boards" }));

    expect(state.unconfirmed).toBeUndefined();
  });
});

describe("resendConfirmation", () => {
  it("resends the sign-up email with a link back to this origin", async () => {
    mocks.auth.resend.mockResolvedValue({ data: {}, error: null });

    const state = await resendConfirmation({}, form({ email: " New@Example.com ", next: "/x" }));

    expect(mocks.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "New@Example.com",
      options: { emailRedirectTo: "https://kanban.example/auth/confirm?next=%2Fx" },
    });
    expect(state.notice).toBeDefined();
  });

  it("gives the same answer when Supabase refuses for any other reason", async () => {
    mocks.auth.resend.mockResolvedValueOnce({ data: {}, error: null });
    const ok = await resendConfirmation({}, form({ email: "a@example.com" }));
    mocks.auth.resend.mockResolvedValueOnce({
      data: {},
      error: { code: "validation_failed", status: 400 },
    });
    const refused = await resendConfirmation({}, form({ email: "a@example.com" }));

    expect(refused).toEqual(ok);
  });

  it("reports rate limits", async () => {
    mocks.auth.resend.mockResolvedValue({
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429 },
    });

    const state = await resendConfirmation({}, form({ email: "a@example.com" }));

    expect(state.error).toMatch(/too many emails/i);
  });

  it("rejects an invalid email without calling Supabase", async () => {
    const state = await resendConfirmation({}, form({ email: "nope" }));

    expect(state.error).toBeDefined();
    expect(mocks.auth.resend).not.toHaveBeenCalled();
  });
});
