/*
 * Daily AI quotas (ADR 0016): the pure pieces shared by the decomposition
 * route and the review UI. Enforcement lives in the database
 * (public.reserve_ai_decomposition, migration 20260928152546_ai_quotas.sql);
 * this module only maps its outcome to HTTP and to user-facing copy.
 */

/** Response header with the caller's decompositions left today, after this one. */
export const QUOTA_REMAINING_HEADER = "X-Quota-Remaining";

/** Why a reservation was refused: the caller's own daily limit, or the shared daily budget. */
export type QuotaExceeded = "user" | "global";

// Custom SQLSTATEs raised by private.reserve_ai_decomposition.
const QUOTA_ERROR_CODES = new Map<string, QuotaExceeded>([
  ["AIQ01", "user"],
  ["AIQ02", "global"],
]);

export const QUOTA_EXCEEDED_MESSAGES: Record<QuotaExceeded, string> = {
  user: "You've used all your AI suggestions for today. They reset at midnight UTC.",
  global: "AI suggestions are paused for everyone until midnight UTC. Try again tomorrow.",
};

/** The kind of quota refusal behind a Postgres error code, or null for any other error. */
export function quotaExceededKind(code: string | undefined): QuotaExceeded | null {
  return (code && QUOTA_ERROR_CODES.get(code)) || null;
}

/** Whole seconds until the next midnight UTC, when quotas reset (for Retry-After). Always ≥ 1. */
export function secondsUntilQuotaReset(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/** The remaining count from the response header, or null when absent or malformed. */
export function parseQuotaRemaining(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

export function quotaRemainingMessage(remaining: number): string {
  if (remaining === 0) return "No AI suggestions left today. They reset at midnight UTC.";
  return `${remaining} AI ${remaining === 1 ? "suggestion" : "suggestions"} left today.`;
}
