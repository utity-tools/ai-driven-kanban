/** Whether the viewer is still on the board; `unknown` when it could not be told. */
export type MembershipStatus = "member" | "not-member" | "unknown";

/** What the realtime hook should do after a membership check. */
export type AccessAction = "redirect" | "refresh" | "none";

/**
 * Reads the outcome of the `board_members` lookup. supabase-js reports network
 * failures as `error` instead of throwing, so any error, a thrown lookup or an
 * offline browser is `unknown`: an empty result only counts as removal when the
 * lookup really succeeded.
 */
export function membershipStatus(
  result: { data: unknown; error: unknown } | null,
  online: boolean,
): MembershipStatus {
  if (!online || result === null || result.error) return "unknown";
  return result.data === null ? "not-member" : "member";
}

/**
 * Only a confirmed removal redirects. A refresh needs a confirmed membership
 * (`router.refresh()` while offline falls back to a full page navigation that
 * loses unsaved input), and after a channel error it is never wanted.
 */
export function accessAction(status: MembershipStatus, allowRefresh: boolean): AccessAction {
  if (status === "not-member") return "redirect";
  if (status === "member" && allowRefresh) return "refresh";
  return "none";
}
