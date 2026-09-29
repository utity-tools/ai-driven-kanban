import { describe, expect, it } from "vitest";

import { type PendingInviteRow, toPendingInvites } from "./pending";

const now = new Date("2026-09-30T12:00:00Z");
const row = (id: string, overrides: Partial<PendingInviteRow> = {}): PendingInviteRow => ({
  id,
  role: "editor",
  created_at: "2026-09-29T10:00:00Z",
  expires_at: "2026-10-06T10:00:00Z",
  created_by: "u1",
  accepted_at: null,
  ...overrides,
});
const members = [
  { id: "u1", displayName: "Ada" },
  { id: "u2", displayName: null },
];

describe("toPendingInvites", () => {
  it("drops used and expired invites", () => {
    const result = toPendingInvites(
      [
        row("live"),
        row("used", { accepted_at: "2026-09-30T09:00:00Z" }),
        row("expired", { expires_at: "2026-09-30T11:59:59Z" }),
        row("boundary", { expires_at: "2026-09-30T12:00:00Z" }),
      ],
      members,
      now,
    );
    expect(result.map((i) => i.id)).toEqual(["live"]);
  });

  it("resolves the inviter's name, null when unknown", () => {
    const result = toPendingInvites(
      [row("a"), row("b", { created_by: "u2" }), row("c", { created_by: "gone" })],
      members,
      now,
    );
    expect(result.map((i) => i.createdByName)).toEqual(["Ada", null, null]);
  });

  it("lists the newest first", () => {
    const result = toPendingInvites(
      [row("old"), row("new", { created_at: "2026-09-30T08:00:00Z" })],
      members,
      now,
    );
    expect(result.map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("ignores owner-role rows (never created by the RPC)", () => {
    expect(toPendingInvites([row("x", { role: "owner" })], members, now)).toEqual([]);
  });
});
