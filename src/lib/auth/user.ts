export type CurrentUser = {
  id: string;
  /** `null` for anonymous (demo) users and for providers that share no email. */
  email: string | null;
  /** True for demo users created with Supabase anonymous sign-in. */
  isAnonymous: boolean;
};

export const DEMO_USER_LABEL = "Demo visitor";

/**
 * Builds the app's user from verified JWT claims. Only a literal `true`
 * `is_anonymous` claim counts as anonymous, so a missing or malformed claim
 * never downgrades a permanent account into demo mode.
 */
export function userFromClaims(claims: {
  sub: string;
  email?: unknown;
  is_anonymous?: unknown;
}): CurrentUser {
  const isAnonymous = claims.is_anonymous === true;
  const email = typeof claims.email === "string" && claims.email !== "" ? claims.email : null;
  return { id: claims.sub, email: isAnonymous ? null : email, isAnonymous };
}

/** Name shown in the header: the email, or a friendly label when there is none. */
export function userDisplayLabel(user: Pick<CurrentUser, "email" | "isAnonymous">): string {
  if (user.isAnonymous) return DEMO_USER_LABEL;
  return user.email ?? "Your account";
}
