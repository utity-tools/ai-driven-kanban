import type { BoardMember } from "@/lib/boards/view-model";

import type { InviteRole } from "./schemas";

export type PendingInvite = {
  id: string;
  role: InviteRole;
  createdAt: string;
  expiresAt: string;
  /** Display name of the inviter, or `null` when unknown (no name, no longer a member). */
  createdByName: string | null;
};

export type PendingInviteRow = {
  id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  expires_at: string;
  created_by: string;
  accepted_at: string | null;
};

/** Keeps invites that can still be used, newest first, with the inviter's name. */
export function toPendingInvites(
  rows: readonly PendingInviteRow[],
  members: readonly Pick<BoardMember, "id" | "displayName">[],
  now: Date,
): PendingInvite[] {
  const names = new Map(members.map((m) => [m.id, m.displayName?.trim() || null]));
  return rows
    .filter(
      (row) =>
        row.accepted_at === null &&
        Date.parse(row.expires_at) > now.getTime() &&
        (row.role === "editor" || row.role === "viewer"),
    )
    .map((row) => ({
      id: row.id,
      role: row.role as InviteRole,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      createdByName: names.get(row.created_by) ?? null,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
