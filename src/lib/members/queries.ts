import "server-only";

import { createClient } from "@/lib/db/server";
import { type PendingInvite, toPendingInvites } from "@/lib/invites/pending";
import type { BoardMember } from "@/lib/boards/view-model";

/**
 * Invites that can still be used. Only owners can read board_invites (RLS), and
 * columns are listed explicitly: token_hash is not selectable, so `select *` fails.
 */
export async function listPendingInvites(
  boardId: string,
  members: readonly Pick<BoardMember, "id" | "displayName">[],
): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("board_invites")
    .select("id, role, created_at, expires_at, created_by, accepted_at")
    .eq("board_id", boardId)
    .is("accepted_at", null)
    .gt("expires_at", now.toISOString());
  if (error) throw new Error("Failed to load invites.", { cause: error });
  return toPendingInvites(data, members, now);
}
