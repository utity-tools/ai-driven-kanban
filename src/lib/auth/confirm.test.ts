import { describe, expect, it } from "vitest";

import {
  buildEmailRedirectTo,
  CONFIRM_PATH,
  confirmEmailSchema,
  confirmFailure,
  parseConfirmLink,
  RESEND_NOTICE,
  resendConfirmationSchema,
  isServerFailure,
  resendOutcome,
} from "./confirm";

const HASH = "a".repeat(56);

describe("parseConfirmLink", () => {
  it("accepts a well-formed link and sanitises next", () => {
    expect(parseConfirmLink({ token_hash: HASH, type: "email", next: "/invite/abc?x=1" })).toEqual({
      tokenHash: HASH,
      next: "/invite/abc?x=1",
    });
  });

  it("defaults next to /boards when it is missing", () => {
    expect(parseConfirmLink({ token_hash: HASH, type: "email" })?.next).toBe("/boards");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "never keeps an off-site next (%s)",
    (next) => {
      expect(parseConfirmLink({ token_hash: HASH, type: "email", next })?.next).toBe("/boards");
    },
  );

  it.each([undefined, "signup", "recovery", "magiclink", ["email", "email"]])(
    "rejects type %j",
    (type) => {
      expect(parseConfirmLink({ token_hash: HASH, type })).toBeNull();
    },
  );

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["too short", "abc"],
    ["too long", "a".repeat(257)],
    ["with unsafe characters", `${HASH}<script>`],
    ["repeated", [HASH, HASH]],
  ])("rejects a %s token hash", (_label, token_hash) => {
    expect(parseConfirmLink({ token_hash, type: "email" })).toBeNull();
  });
});

describe("confirmEmailSchema", () => {
  it("validates the confirm form fields", () => {
    expect(confirmEmailSchema.safeParse({ tokenHash: HASH, next: "//evil" }).data).toEqual({
      tokenHash: HASH,
      next: "/boards",
    });
    expect(confirmEmailSchema.safeParse({ tokenHash: 42, next: "/boards" }).success).toBe(false);
  });
});

describe("buildEmailRedirectTo", () => {
  it("points at the confirm page on the given origin, carrying next", () => {
    const url = new URL(buildEmailRedirectTo("https://kanban.example", "/invite/abc"));
    expect(url.origin).toBe("https://kanban.example");
    expect(url.pathname).toBe(CONFIRM_PATH);
    expect(url.searchParams.get("next")).toBe("/invite/abc");
  });

  it("always has a query string, even for the default next", () => {
    expect(buildEmailRedirectTo("http://localhost:3000", undefined)).toBe(
      "http://localhost:3000/auth/confirm?next=%2Fboards",
    );
  });

  it("drops an unsafe next", () => {
    const url = new URL(buildEmailRedirectTo("http://localhost:3000", "https://evil.example"));
    expect(url.searchParams.get("next")).toBe("/boards");
  });
});

describe("confirmFailure", () => {
  it("explains an expired or used link, which can't be retried", () => {
    expect(confirmFailure({ code: "otp_expired", status: 403 })).toEqual({
      error: "This link has expired or was already used. Sign in to get a new one.",
      retryable: false,
    });
  });

  it.each([[{ code: "over_request_rate_limit" }], [{ status: 429 }]])(
    "keeps the button for rate limits (%j): the token wasn't spent",
    (error) => {
      expect(confirmFailure(error)).toMatchObject({ retryable: true });
      expect(confirmFailure(error).error).toMatch(/too many attempts/i);
    },
  );

  it.each([[{ status: 500 }], [{ code: "unexpected_failure" }]])(
    "keeps the button for outages (%j)",
    (error) => {
      expect(confirmFailure(error)).toEqual({
        error: "We couldn't confirm your email right now. Try again.",
        retryable: true,
      });
    },
  );

  it("falls back to a generic, non-retryable message without leaking details", () => {
    expect(confirmFailure({ code: "validation_failed", status: 400 })).toEqual({
      error: "We couldn't confirm your email. Sign in to get a new link.",
      retryable: false,
    });
  });
});

describe("isServerFailure", () => {
  it("is true for 5xx and errors without a status (network)", () => {
    expect(isServerFailure({ status: 500 })).toBe(true);
    expect(isServerFailure({ code: "unexpected_failure" })).toBe(true);
  });

  it("is false for client errors and no error", () => {
    expect(isServerFailure({ status: 400 })).toBe(false);
    expect(isServerFailure({ status: 429 })).toBe(false);
    expect(isServerFailure(null)).toBe(false);
  });
});

describe("resendConfirmationSchema", () => {
  it("trims the email and sanitises next", () => {
    expect(
      resendConfirmationSchema.safeParse({ email: " a@example.com ", next: "//evil" }).data,
    ).toEqual({ email: "a@example.com", next: "/boards" });
  });

  it("rejects an invalid email", () => {
    expect(resendConfirmationSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("resendOutcome", () => {
  it.each([
    [{ code: "over_email_send_rate_limit" }],
    [{ code: "over_request_rate_limit" }],
    [{ status: 429 }],
  ])("reports rate limiting (%j)", (error) => {
    expect(resendOutcome(error).error).toMatch(/too many emails/i);
  });

  it("reports an outage without saying anything about the account", () => {
    expect(resendOutcome({ status: 500 }).error).toMatch(/couldn't send the email right now/);
  });

  it.each([
    [null],
    [{ code: "user_not_found", status: 400 }],
    [{ code: "email_address_invalid", status: 400 }],
  ])("answers with the same notice otherwise (%j)", (error) => {
    expect(resendOutcome(error)).toEqual({ notice: RESEND_NOTICE });
  });
});
