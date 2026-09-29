import { describe, expect, it } from "vitest";

import { FALLBACK_INVITER, resolveInviteView } from "./peek";
import type { InvitePeek } from "./schemas";

const BOARD = "3f2b7c1e-8a4d-4c55-9a51-0e2f6d1b7a10";
const peek = (overrides: Partial<InvitePeek> = {}): InvitePeek => ({
  status: "pending",
  role: "editor",
  expires_at: "2026-10-06T10:00:00Z",
  is_member: false,
  board_id: null,
  board_title: "Roadmap",
  inviter_name: "Ada",
  ...overrides,
});
const user = { isDemo: false };

describe("resolveInviteView", () => {
  it("reports no row as invalid", () => {
    expect(resolveInviteView(null, user)).toEqual({ kind: "invalid" });
  });

  it("sends members to their board, even for dead invites", () => {
    const member = peek({ is_member: true, board_id: BOARD, status: "expired" });
    expect(resolveInviteView(member, user)).toEqual({
      kind: "member",
      boardId: BOARD,
      boardTitle: "Roadmap",
    });
  });

  it("reports expired and accepted invites", () => {
    expect(resolveInviteView(peek({ status: "expired", board_title: null }), user)).toEqual({
      kind: "expired",
    });
    expect(resolveInviteView(peek({ status: "accepted" }), user)).toEqual({ kind: "accepted" });
  });

  it("asks demo users to create an account only for live invites", () => {
    expect(resolveInviteView(peek(), { isDemo: true })).toEqual({ kind: "demo" });
    expect(resolveInviteView(peek({ status: "expired" }), { isDemo: true })).toEqual({
      kind: "expired",
    });
  });

  it("describes a pending invite, with a fallback inviter", () => {
    expect(resolveInviteView(peek({ role: "viewer" }), user)).toEqual({
      kind: "pending",
      role: "viewer",
      boardTitle: "Roadmap",
      inviterName: "Ada",
      expiresAt: "2026-10-06T10:00:00Z",
    });
    const anonymous = resolveInviteView(peek({ inviter_name: "  " }), user);
    expect(anonymous).toMatchObject({ kind: "pending", inviterName: FALLBACK_INVITER });
  });
});
