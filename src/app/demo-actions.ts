"use server";

import { decideOpenDemo, type OpenDemoResult, visitorKind } from "@/lib/auth/demo";
import { getCurrentUser } from "@/lib/auth/session";
import { getLatestOwnedBoardId } from "@/lib/boards/queries";
import { createClient } from "@/lib/db/server";

/**
 * Finds where the demo should open for the current (cookie) session. The
 * anonymous sign-in itself happens in the browser, so Supabase's per-IP
 * anonymous rate limit counts each visitor, not this server.
 *
 * Returns a path instead of calling `redirect()`, so the client can tell a
 * navigation from a failure. A demo session whose user was deleted by the
 * cleanup job (its JWT stays valid until it expires) is signed out and
 * answered with `restart`.
 */
export async function openDemo(): Promise<OpenDemoResult> {
  const user = await getCurrentUser();
  const visitor = visitorKind(user);
  const boardId = visitor === "demo" && user ? await getLatestOwnedBoardId(user.id) : null;

  const { result, signOut } = decideOpenDemo(visitor, boardId);
  if (signOut) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return result;
}
