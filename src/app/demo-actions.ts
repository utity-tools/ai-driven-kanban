"use server";

import { redirect } from "next/navigation";

import { DEMO_ERROR_PATH, demoBoardPath, visitorKind } from "@/lib/auth/demo";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";
import { getLatestOwnedBoardId } from "@/lib/boards/queries";
import { createClient } from "@/lib/db/server";

/**
 * Starts (or resumes) demo mode. Permanent users go to their boards; everyone
 * else gets an anonymous session, whose pre-filled demo board is created by a
 * database trigger in the same transaction as the anonymous user.
 */
export async function startDemo(): Promise<void> {
  const user = await getCurrentUser();
  const visitor = visitorKind(user);
  if (visitor === "member") redirect(DEFAULT_AFTER_LOGIN_PATH);

  const supabase = await createClient();
  let userId = user?.id;
  if (visitor === "signed-out") {
    const { data, error } = await supabase.auth.signInAnonymously();
    // Rate limits (429) or anonymous sign-ins disabled: show a friendly alert.
    if (error || !data.user) redirect(DEMO_ERROR_PATH);
    userId = data.user.id;
  }
  if (!userId) redirect(DEMO_ERROR_PATH);

  redirect(demoBoardPath(await getLatestOwnedBoardId(supabase, userId)));
}
