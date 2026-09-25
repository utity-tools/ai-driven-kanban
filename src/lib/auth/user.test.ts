import { describe, expect, it } from "vitest";

import { DEMO_USER_LABEL, userDisplayLabel, userFromClaims } from "./user";

describe("userFromClaims", () => {
  it("maps a permanent user", () => {
    expect(userFromClaims({ sub: "u1", email: "a@b.co", is_anonymous: false })).toEqual({
      id: "u1",
      email: "a@b.co",
      isAnonymous: false,
    });
  });

  it("maps an anonymous user without an email", () => {
    expect(userFromClaims({ sub: "u2", email: "", is_anonymous: true })).toEqual({
      id: "u2",
      email: null,
      isAnonymous: true,
    });
  });

  it("only treats a literal true claim as anonymous", () => {
    for (const is_anonymous of [undefined, "true", 1, null]) {
      expect(userFromClaims({ sub: "u3", email: "a@b.co", is_anonymous }).isAnonymous).toBe(false);
    }
  });

  it("normalises missing or non-string emails to null", () => {
    expect(userFromClaims({ sub: "u4" }).email).toBeNull();
    expect(userFromClaims({ sub: "u4", email: 42 }).email).toBeNull();
    expect(userFromClaims({ sub: "u4", email: "" }).email).toBeNull();
  });
});

describe("userDisplayLabel", () => {
  it("labels anonymous users as demo visitors", () => {
    expect(userDisplayLabel({ email: null, isAnonymous: true })).toBe(DEMO_USER_LABEL);
  });

  it("shows the email of permanent users", () => {
    expect(userDisplayLabel({ email: "a@b.co", isAnonymous: false })).toBe("a@b.co");
  });

  it("never renders an empty label", () => {
    expect(userDisplayLabel({ email: null, isAnonymous: false })).toBe("Your account");
  });
});
