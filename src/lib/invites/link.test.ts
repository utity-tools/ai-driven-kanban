import { describe, expect, it } from "vitest";

import { invitePath, inviteUrl } from "./link";

describe("invite links", () => {
  it("builds the invite path and URL", () => {
    expect(invitePath("tok")).toBe("/invite/tok");
    expect(inviteUrl("https://app.example.com", "tok")).toBe("https://app.example.com/invite/tok");
  });

  it("falls back to the path without an origin", () => {
    expect(inviteUrl(null, "tok")).toBe("/invite/tok");
  });
});
