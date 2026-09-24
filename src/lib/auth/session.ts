import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/db/server";

import { LOGIN_PATH } from "./routes";

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in user, verified from the JWT with getClaims() (never
 * getSession() alone). Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

/** Like getCurrentUser, but redirects to the login page when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}
