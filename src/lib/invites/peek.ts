import type { InvitePeek, InviteRole } from "./schemas";

/** What the /invite/[token] page shows. */
export type InviteView =
  | { kind: "invalid" }
  | { kind: "member"; boardId: string; boardTitle: string | null }
  | { kind: "expired" }
  | { kind: "accepted" }
  | { kind: "demo" }
  | {
      kind: "pending";
      role: InviteRole;
      boardTitle: string;
      inviterName: string;
      expiresAt: string;
    };

export const FALLBACK_INVITER = "A board owner";

/**
 * Decides which state the invite page is in. Order matters: existing members
 * go to their board whatever the invite's state; a dead invite is reported as
 * such even to demo users (creating an account would not help them); only a
 * live invite asks demo users to create an account.
 */
export function resolveInviteView(
  peek: InvitePeek | null,
  viewer: { isDemo: boolean },
): InviteView {
  if (!peek) return { kind: "invalid" };
  if (peek.is_member && peek.board_id) {
    return { kind: "member", boardId: peek.board_id, boardTitle: peek.board_title };
  }
  if (peek.status === "expired") return { kind: "expired" };
  if (peek.status === "accepted") return { kind: "accepted" };
  if (viewer.isDemo) return { kind: "demo" };
  return {
    kind: "pending",
    role: peek.role,
    boardTitle: peek.board_title ?? "this board",
    inviterName: peek.inviter_name?.trim() || FALLBACK_INVITER,
    expiresAt: peek.expires_at,
  };
}
