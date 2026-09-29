import { describe, expect, it } from "vitest";

import { accessAction, accessNoticeHandling, membershipStatus } from "./access-check";

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

describe("accessNoticeHandling", () => {
  it("checks someone else's change in full", () => {
    expect(accessNoticeHandling(false, false)).toBe("check");
  });

  it("skips this tab's own leave or delete, which navigates by itself", () => {
    expect(accessNoticeHandling(true, true)).toBe("skip");
  });

  it("still checks, redirect-only, an own change that is not an exit (maybe another tab)", () => {
    expect(accessNoticeHandling(true, false)).toBe("check-redirect-only");
  });
});
