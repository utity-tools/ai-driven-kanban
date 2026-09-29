import { describe, expect, it } from "vitest";

import { formatInviteDate } from "./format";

describe("formatInviteDate", () => {
  it("formats a timestamp as a medium date", () => {
    expect(formatInviteDate("2026-10-06T10:00:00Z", "UTC")).toBe("Oct 6, 2026");
  });

  it("uses the requested time zone", () => {
    expect(formatInviteDate("2026-10-06T23:30:00Z", "Asia/Tokyo")).toBe("Oct 7, 2026");
  });

  it("does not throw on garbage", () => {
    expect(formatInviteDate("nope")).toBe("an unknown date");
  });
});
