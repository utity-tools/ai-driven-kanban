"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { SIGNED_OUT_ERROR } from "@/lib/boards/action-result";
import { createClient } from "@/lib/db/server";

import { inviteErrorMessage } from "./errors";
import { inviteTokenSchema } from "./schemas";

export type AcceptInviteState = { error?: string };

/**
 * Joins the board (POST only, never on GET: link previews must not consume
 * invites). The invite may have changed since the page peeked at it, so every
 * RPC error is mapped to a message. The token is never logged.
 */
export async function acceptInvite(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = inviteTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: inviteErrorMessage("INV01") };
  if (!(await getCurrentUser())) return { error: SIGNED_OUT_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_board_invite", { p_token: token.data });
  const boardId = z.uuid().safeParse(data);
  if (error || !boardId.success) {
    // Only the code: the error object could echo the RPC arguments.
    return { error: inviteErrorMessage(error?.code) };
  }

  revalidatePath("/boards");
  redirect(`/boards/${boardId.data}`);
}
