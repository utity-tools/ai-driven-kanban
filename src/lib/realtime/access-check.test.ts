import { describe, expect, it } from "vitest";

import { accessAction, membershipStatus } from "./access-check";

describe("membershipStatus", () => {
  it("is member when the row exists", () => {
    expect(membershipStatus({ data: { user_id: "u" }, error: null }, true)).toBe("member");
  });

  it("is not-member only for a successful empty lookup", () => {
    expect(membershipStatus({ data: null, error: null }, true)).toBe("not-member");
  });

  it("is unknown on an error, even with empty data", () => {
    expect(membershipStatus({ data: null, error: new Error("Failed to fetch") }, true)).toBe(
      "unknown",
    );
  });

  it("is unknown when the lookup threw", () => {
    expect(membershipStatus(null, true)).toBe("unknown");
  });

  it("is unknown while offline, whatever the result", () => {
    expect(membershipStatus({ data: null, error: null }, false)).toBe("unknown");
    expect(membershipStatus({ data: { user_id: "u" }, error: null }, false)).toBe("unknown");
  });
});

describe("accessAction", () => {
  it("redirects on not-member in every mode", () => {
    expect(accessAction("not-member", true)).toBe("redirect");
    expect(accessAction("not-member", false)).toBe("redirect");
  });

  it("refreshes on member only when allowed", () => {
    expect(accessAction("member", true)).toBe("refresh");
    expect(accessAction("member", false)).toBe("none");
  });

  it("does nothing on unknown", () => {
    expect(accessAction("unknown", true)).toBe("none");
    expect(accessAction("unknown", false)).toBe("none");
  });
});
