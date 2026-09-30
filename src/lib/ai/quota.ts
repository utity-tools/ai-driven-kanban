/*
 * Daily AI quotas (ADR 0016): the pure pieces shared by the decomposition
 * route and the review UI. Enforcement lives in the database
 * (public.reserve_ai_decomposition, migration 20260928152546_ai_quotas.sql);
 * this module only maps its outcome to HTTP and to user-facing copy.
 */

import { z } from "zod";

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

const reservationSchema = z.object({
  remaining: z.number().int().nonnegative(),
  usage_id: z.uuid(),
});

/**
 * The parts of a reservation row the routes use. `usageId` identifies the
 * reserved row for record_ai_usage and must stay server-side: it never goes in
 * a header or body. Returns null when the row doesn't have the expected shape.
 */
export function parseReservation(row: unknown): { remaining: number; usageId: string } | null {
  const parsed = reservationSchema.safeParse(row);
  return parsed.success
    ? { remaining: parsed.data.remaining, usageId: parsed.data.usage_id }
    : null;
}
