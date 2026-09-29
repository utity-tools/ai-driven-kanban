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

/** How to handle a notice that may have removed the viewer (membership change, deleted board). */
export type AccessNoticeHandling = "skip" | "check" | "check-redirect-only";

/**
 * `own`: the notice matches a mutation of this tab; `ownExit`: it matches this tab's own
 * leave or delete, which navigates by itself. Any other own change still checks access,
 * redirect-only: `own` cannot tell this tab from the same user's other tabs, so the notice
 * may be another tab removing the viewer, and no later notice would reach them.
 */
export function accessNoticeHandling(own: boolean, ownExit: boolean): AccessNoticeHandling {
  if (own && ownExit) return "skip";
  return own ? "check-redirect-only" : "check";
}
