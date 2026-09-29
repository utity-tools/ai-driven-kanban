import { describe, expect, it } from "vitest";

import {
  createInviteSchema,
  inviteRoleSchema,
  invitePeekSchema,
  inviteTokenSchema,
  revokeInviteSchema,
} from "./schemas";

const TOKEN = "A".repeat(43);
const ID = "3f2b7c1e-8a4d-4c55-9a51-0e2f6d1b7a10";

describe("inviteTokenSchema", () => {
  it("accepts 43 base64url characters", () => {
    expect(inviteTokenSchema.safeParse(TOKEN).success).toBe(true);
    expect(inviteTokenSchema.safeParse("a-_".repeat(14) + "a").success).toBe(true);
  });

  it.each([
    ["too short", "A".repeat(42)],
    ["too long", "A".repeat(44)],
    ["padding", `${"A".repeat(42)}=`],
    ["plus", `${"A".repeat(42)}+`],
    ["slash", `${"A".repeat(42)}/`],
    ["whitespace", `${"A".repeat(42)} `],
    ["newline suffix", `${TOKEN}\n`],
    ["empty", ""],
  ])("rejects %s", (_name, value) => {
    expect(inviteTokenSchema.safeParse(value).success).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(inviteTokenSchema.safeParse(undefined).success).toBe(false);
    expect(inviteTokenSchema.safeParse(null).success).toBe(false);
  });
});

describe("inviteRoleSchema", () => {
  it("never allows owner", () => {
    expect(inviteRoleSchema.safeParse("editor").success).toBe(true);
    expect(inviteRoleSchema.safeParse("viewer").success).toBe(true);
    expect(inviteRoleSchema.safeParse("owner").success).toBe(false);
  });
});

describe("invite action schemas", () => {
  it("validates create and revoke input", () => {
    expect(createInviteSchema.safeParse({ boardId: ID, role: "editor" }).success).toBe(true);
    expect(createInviteSchema.safeParse({ boardId: "x", role: "editor" }).success).toBe(false);
    expect(createInviteSchema.safeParse({ boardId: ID, role: "owner" }).success).toBe(false);
    expect(revokeInviteSchema.safeParse({ boardId: ID, inviteId: ID }).success).toBe(true);
    expect(revokeInviteSchema.safeParse({ boardId: ID, inviteId: "nope" }).success).toBe(false);
  });
});

describe("invitePeekSchema", () => {
  const row = {
    status: "pending",
    role: "editor",
    expires_at: "2026-10-06T10:00:00Z",
    is_member: false,
    board_id: null,
    board_title: "Roadmap",
    inviter_name: null,
  };

  it("accepts nullable board and inviter fields", () => {
    expect(invitePeekSchema.safeParse(row).success).toBe(true);
    expect(invitePeekSchema.safeParse({ ...row, board_title: null }).success).toBe(true);
  });

  it("rejects unknown statuses and roles", () => {
    expect(invitePeekSchema.safeParse({ ...row, status: "revoked" }).success).toBe(false);
    expect(invitePeekSchema.safeParse({ ...row, role: "owner" }).success).toBe(false);
  });
});
