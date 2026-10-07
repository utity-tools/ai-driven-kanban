import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/db/server";

import { canSetNewPassword } from "./recovery";
import { LOGIN_PATH } from "./routes";
import { type CurrentUser, userFromClaims } from "./user";

export type { CurrentUser };

/**
 * The signed-in user, verified from the JWT with getClaims() (never
 * getSession() alone). Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return userFromClaims(data.claims);
});

/** Like getCurrentUser, but redirects to the login page when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/**
 * The signed-in user when this session may set a new password without the
 * current one (opened by an emailed link moments ago, ADR 0023); otherwise
 * `null`. Checked on the page and again in the Server Action.
 */
export async function getPasswordResetUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  if (!canSetNewPassword(data.claims, Math.floor(Date.now() / 1000))) return null;
  return userFromClaims(data.claims);
}
