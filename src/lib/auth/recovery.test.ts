import { describe, expect, it } from "vitest";

import {
  canSetNewPassword,
  forgotPasswordSchema,
  newPasswordFailure,
  newPasswordSchema,
  parseRecoveryLink,
  RECOVERY_WINDOW_SECONDS,
  recoveryFailure,
  RESET_REQUEST_NOTICE,
  resetRequestOutcome,
} from "./recovery";

const HASH = `pkce_${"a".repeat(56)}`;
const NOW = 1_800_000_000;

describe("parseRecoveryLink", () => {
  it("accepts a recovery link and sanitises next", () => {
    expect(parseRecoveryLink({ token_hash: HASH, type: "recovery", next: "//evil" })).toEqual({
      tokenHash: HASH,
      next: "/boards",
    });
  });

  it.each(["email", "signup", undefined])("rejects type %j", (type) => {
    expect(parseRecoveryLink({ token_hash: HASH, type })).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(parseRecoveryLink({ token_hash: "<x>", type: "recovery" })).toBeNull();
  });
});

describe("forgotPasswordSchema", () => {
  it("trims the email and sanitises next", () => {
    expect(forgotPasswordSchema.safeParse({ email: " a@example.com ", next: "/x" }).data).toEqual({
      email: "a@example.com",
      next: "/x",
    });
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it.each([
    ["short", "Use at least 8 characters."],
    ["a".repeat(73), "Use at most 72 characters."],
  ])("rejects %j", (password, message) => {
    const result = newPasswordSchema.safeParse({ password });
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("accepts a valid password", () => {
    expect(newPasswordSchema.safeParse({ password: "long-enough-1" }).success).toBe(true);
  });
});

describe("resetRequestOutcome", () => {
  it.each([[null], [{ code: "user_not_found", status: 400 }]])(
    "answers with the same notice (%j)",
    (error) => {
      expect(resetRequestOutcome(error)).toEqual({ notice: RESET_REQUEST_NOTICE });
    },
  );

  it.each([[{ code: "over_email_send_rate_limit", status: 429 }], [{ status: 429 }]])(
    "hides rate limits (%j): Supabase only applies them to existing accounts",
    (error) => {
      expect(resetRequestOutcome(error)).toEqual({ notice: RESET_REQUEST_NOTICE });
    },
  );

  it("reports outages", () => {
    expect(resetRequestOutcome({ status: 500 }).error).toMatch(/couldn't send/);
  });
});

describe("recoveryFailure", () => {
  it("explains an expired or used link, which can't be retried", () => {
    expect(recoveryFailure({ code: "otp_expired", status: 403 })).toEqual({
      error: "This link has expired or was already used. Request a new one.",
      retryable: false,
    });
  });

  it("keeps the button for rate limits and outages", () => {
    expect(recoveryFailure({ status: 429 }).retryable).toBe(true);
    expect(recoveryFailure({ status: 502 }).retryable).toBe(true);
  });

  it("falls back to a generic, non-retryable message", () => {
    expect(recoveryFailure({ code: "validation_failed", status: 400 }).retryable).toBe(false);
  });
});

describe("newPasswordFailure", () => {
  it.each(["same_password", "weak_password"])("maps %s to the password field", (code) => {
    expect(newPasswordFailure({ code, status: 422 }).fieldError).toBeDefined();
  });

  it("maps rate limits and unknown errors to a form message", () => {
    expect(newPasswordFailure({ status: 429 }).error).toMatch(/too many/i);
    expect(newPasswordFailure({ code: "unexpected_failure" }).error).toMatch(/couldn't update/);
  });
});

describe("canSetNewPassword", () => {
  const otp = (secondsAgo: number) => [{ method: "otp", timestamp: NOW - secondsAgo }];

  it("allows a session opened by an emailed link within the window", () => {
    expect(canSetNewPassword({ amr: otp(60) }, NOW)).toBe(true);
    expect(canSetNewPassword({ amr: otp(RECOVERY_WINDOW_SECONDS) }, NOW)).toBe(true);
  });

  it("refuses once the window has passed", () => {
    expect(canSetNewPassword({ amr: otp(RECOVERY_WINDOW_SECONDS + 1) }, NOW)).toBe(false);
  });

  it.each(["password", "oauth", "anonymous"])("refuses a %s session", (method) => {
    expect(canSetNewPassword({ amr: [{ method, timestamp: NOW }] }, NOW)).toBe(false);
  });

  it("refuses anonymous (demo) users even with an otp entry", () => {
    expect(canSetNewPassword({ amr: otp(0), is_anonymous: true }, NOW)).toBe(false);
  });

  it("refuses timestamps from the future beyond clock skew", () => {
    expect(canSetNewPassword({ amr: otp(-3600) }, NOW)).toBe(false);
  });

  it.each([undefined, "otp", [null], [{ method: "otp" }], [{ method: "otp", timestamp: "1" }]])(
    "refuses a missing or malformed amr claim (%j)",
    (amr) => {
      expect(canSetNewPassword({ amr }, NOW)).toBe(false);
    },
  );
});
