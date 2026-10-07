import { describe, expect, it } from "vitest";

import {
  buildEmailRedirectTo,
  CONFIRM_PATH,
  confirmEmailSchema,
  confirmErrorMessage,
  parseConfirmLink,
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

describe("confirmErrorMessage", () => {
  it("explains an expired or used link", () => {
    expect(confirmErrorMessage({ code: "otp_expired" })).toMatch(/expired or was already used/);
  });

  it("maps rate limiting", () => {
    expect(confirmErrorMessage({ code: "over_request_rate_limit" })).toMatch(/too many attempts/i);
  });

  it("falls back to a generic message without leaking details", () => {
    expect(confirmErrorMessage({ code: "unexpected_failure" })).toBe(
      "We couldn't confirm your email. Sign in to get a new link.",
    );
    expect(confirmErrorMessage(null)).toBe(
      "We couldn't confirm your email. Sign in to get a new link.",
    );
  });
});
