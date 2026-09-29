"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getRequestOrigin } from "@/lib/auth/origin";
import { getCurrentUser } from "@/lib/auth/session";
import {
  type ActionResult,
  SIGNED_OUT_ERROR,
  failure,
  friendlyDbError,
} from "@/lib/boards/action-result";
import { affected, runBoardAction as run } from "@/lib/boards/action-runner";
import { inviteErrorMessage } from "@/lib/invites/errors";
import { inviteUrl } from "@/lib/invites/link";
import { createInviteSchema, revokeInviteSchema } from "@/lib/invites/schemas";

import { changeMemberRoleSchema, leaveBoardSchema, removeMemberSchema } from "./schemas";

/*
 * Member management and invite links (ADR 0018). RLS decides who may do what;
 * the protect_board_owners trigger keeps the creator an owner (SQLSTATE 23001).
 */

const RESTRICT_VIOLATION = "23001";

export async function changeMemberRole(input: unknown): Promise<ActionResult> {
  return run(changeMemberRoleSchema, input, async ({ boardId, userId, role }, supabase) => {
    const { data, error } = await supabase
      .from("board_members")
      .update({ role })
      .eq("board_id", boardId)
      .eq("user_id", userId)
      .select("user_id");
    if (error) {
      return failure(
        friendlyDbError(error, {
          [RESTRICT_VIOLATION]:
            "The board's creator can't be demoted, and a board must keep at least one owner.",
        }),
      );
    }
    return affected(data, "Only board owners can change roles, and this member may have left.");
  });
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  return run(removeMemberSchema, input, async ({ boardId, userId }, supabase) => {
    const { data, error } = await supabase
      .from("board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("user_id", userId)
      .select("user_id");
    if (error) {
      return failure(
        friendlyDbError(error, {
          [RESTRICT_VIOLATION]: "The board's creator can't be removed.",
        }),
      );
    }
    return affected(data, "Only board owners can remove members, and this member may be gone.");
  });
}

/** Leaves the board. The caller navigates to /boards on success (like deleteBoard). */
export async function leaveBoard(input: unknown): Promise<ActionResult> {
  const result = await run(leaveBoardSchema, input, async ({ boardId }, supabase) => {
    const user = await getCurrentUser();
    if (!user) return failure(SIGNED_OUT_ERROR);
    const { data, error } = await supabase
      .from("board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("user_id", user.id)
      .select("user_id");
    if (error) {
      return failure(
        friendlyDbError(error, {
          [RESTRICT_VIOLATION]: "You created this board, so you can't leave it.",
        }),
      );
    }
    return affected(data, "You are no longer a member of this board.");
  });
  if (result.ok) revalidatePath("/boards");
  return result;
}

/**
 * Creates a single-use invite link. The token is returned once, inside the
 * URL, and is neither stored nor logged (only the hash lives in the database).
 */
export async function createInvite(
  input: unknown,
): Promise<ActionResult<{ inviteId: string; url: string; expiresAt: string }>> {
  return run(createInviteSchema, input, async ({ boardId, role }, supabase) => {
    const { data, error } = await supabase
      .rpc("create_board_invite", { p_board_id: boardId, p_role: role })
      .single();
    if (error || !data) {
      return failure(
        error?.code === "42501"
          ? "Only board owners can invite people."
          : error?.code === "23514"
            ? "Invites can only grant the Editor or Viewer role."
            : inviteErrorMessage(error?.code),
      );
    }
    const origin = getRequestOrigin(await headers());
    return {
      ok: true,
      inviteId: data.invite_id,
      url: inviteUrl(origin, data.token),
      expiresAt: data.expires_at,
    };
  });
}

/** Revokes (deletes) a pending invite. */
export async function revokeInvite(input: unknown): Promise<ActionResult> {
  return run(revokeInviteSchema, input, async ({ boardId, inviteId }, supabase) => {
    const { data, error } = await supabase
      .from("board_invites")
      .delete()
      .eq("id", inviteId)
      .eq("board_id", boardId)
      .select("id");
    if (error) return failure(friendlyDbError(error));
    return affected(data, "This invite is already gone.");
  });
}
