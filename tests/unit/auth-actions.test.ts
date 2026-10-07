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
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    getClaims: vi.fn(),
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
// session.ts is server-only; the real module runs here against the mocked client.
vi.mock("server-only", () => ({}));

import {
  confirmEmail,
  login,
  requestPasswordReset,
  resendConfirmation,
  signup,
  updatePassword,
  verifyRecovery,
} from "@/app/(auth)/actions";

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

  it("keeps the button and logs only code and status when Supabase fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { code: "unexpected_failure", status: 500, message: "db down" },
    });

    const state = await confirmEmail({}, form({ token_hash: HASH, next: "/boards" }));

    expect(state.retryable).toBe(true);
    expect(log).toHaveBeenCalledWith("auth.confirm_failed", {
      code: "unexpected_failure",
      status: 500,
    });
    log.mockRestore();
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

  it.each(["user_already_exists", "email_exists"])(
    "answers a taken email (%s) exactly like a new one",
    async (code) => {
      mocks.auth.signUp.mockResolvedValue({
        data: { session: null, user: null },
        error: { code, status: 422 },
      });

      const state = await signup({}, form({ ...CREDENTIALS, next: "/boards" }));

      expect(state).toEqual({ confirmationSentTo: CREDENTIALS.email, email: CREDENTIALS.email });
    },
  );

  it("still reports other sign-up errors", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "weak_password", status: 422 },
    });

    const state = await signup({}, form({ ...CREDENTIALS, next: "/boards" }));

    expect(state.fieldErrors?.password).toBeDefined();
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

  it("reports an outage and logs it without the email", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.resend.mockResolvedValue({
      data: {},
      error: { code: "unexpected_failure", status: 500 },
    });

    const state = await resendConfirmation({}, form({ email: "a@example.com" }));

    expect(state.error).toMatch(/couldn't send the email right now/);
    expect(log).toHaveBeenCalledWith("auth.resend_failed", {
      code: "unexpected_failure",
      status: 500,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("a@example.com");
    log.mockRestore();
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

describe("requestPasswordReset", () => {
  it("emails a link back to the reset page on this origin, keeping next", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const state = await requestPasswordReset({}, form({ email: "a@example.com", next: "/x" }));

    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@example.com", {
      redirectTo: "https://kanban.example/auth/reset?next=%2Fx",
    });
    expect(state.notice).toMatch(/if an account exists/i);
  });

  it("answers the same when Supabase refuses for an account-specific reason", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const ok = await requestPasswordReset({}, form({ email: "a@example.com" }));
    mocks.auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: { code: "user_not_found", status: 400 },
    });
    const refused = await requestPasswordReset({}, form({ email: "a@example.com" }));

    expect(refused).toEqual(ok);
  });

  it("rejects an invalid email without calling Supabase", async () => {
    const state = await requestPasswordReset({}, form({ email: "nope" }));

    expect(state).toEqual({ fieldError: "Enter a valid email address.", email: "nope" });
    expect(mocks.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("verifyRecovery", () => {
  it("spends the recovery token and asks for the new password, keeping next", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });

    const path = await redirectOf(verifyRecovery({}, form({ token_hash: HASH, next: "/x" })));

    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: HASH });
    expect(path).toBe("/reset-password?next=%2Fx");
  });

  it("explains a used link and offers no retry", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { code: "otp_expired", status: 403 },
    });

    const state = await verifyRecovery({}, form({ token_hash: HASH }));

    expect(state).toEqual({
      error: "This link has expired or was already used. Request a new one.",
      retryable: false,
    });
  });
});

describe("updatePassword", () => {
  const now = () => Math.floor(Date.now() / 1000);
  const claims = (method: string, secondsAgo = 0) => ({
    data: {
      claims: {
        sub: "u1",
        email: "a@example.com",
        amr: [{ method, timestamp: now() - secondsAgo }],
      },
    },
    error: null,
  });

  it("sets the password for a fresh recovery session and signs out other sessions", async () => {
    mocks.auth.getClaims.mockResolvedValue(claims("otp", 30));
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: null });
    mocks.auth.signOut.mockResolvedValue({ error: null });

    const path = await redirectOf(
      updatePassword({}, form({ password: "new-long-pass-1", next: "/x" })),
    );

    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: "new-long-pass-1" });
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(path).toBe("/x");
  });

  it.each([
    ["a password sign-in", claims("password")],
    ["a GitHub sign-in", claims("oauth")],
    ["an expired recovery", claims("otp", 16 * 60)],
    ["no session", { data: null, error: { code: "no_session" } }],
  ])("refuses %s without touching the password", async (_label, result) => {
    mocks.auth.getClaims.mockResolvedValue(result);

    const state = await updatePassword({}, form({ password: "new-long-pass-1" }));

    expect(state.error).toMatch(/expired/);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("validates the new password before anything else", async () => {
    const state = await updatePassword({}, form({ password: "short" }));

    expect(state).toEqual({ fieldError: "Use at least 8 characters." });
    expect(mocks.auth.getClaims).not.toHaveBeenCalled();
  });

  it("maps a reused password to the field", async () => {
    mocks.auth.getClaims.mockResolvedValue(claims("otp"));
    mocks.auth.updateUser.mockResolvedValue({
      data: {},
      error: { code: "same_password", status: 422 },
    });

    const state = await updatePassword({}, form({ password: "new-long-pass-1" }));

    expect(state.fieldError).toMatch(/different/);
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
});
