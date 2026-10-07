import { z } from "zod";

import { sanitizeNextPath } from "./redirect";
import { emailSchema } from "./schemas";

type AuthErrorLike = { code?: string | undefined; status?: number | undefined } | null;

/** Page the confirmation email links to (see supabase/templates/confirmation.html). */
export const CONFIRM_PATH = "/auth/confirm";

// Supabase token hashes are hex, prefixed with `pkce_` under @supabase/ssr's PKCE
// flow, so `_` must stay allowed. Lenient on purpose so an upstream format change
// doesn't lock users out, but limited to URL-safe characters.
const tokenHash = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/);

export const confirmEmailSchema = z.object({
  tokenHash,
  next: z.unknown().transform((value) => sanitizeNextPath(value)),
});

export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;

/**
 * State returned by the confirm Server Action to `useActionState`. `retryable`
 * means the token was not spent (rate limit, outage), so the button stays.
 */
export type ConfirmFormState = { error?: string; retryable?: boolean };

export const resendConfirmationSchema = z.object({
  email: emailSchema,
  next: z.unknown().transform((value) => sanitizeNextPath(value)),
});

/** State returned by the resend Server Action to `useActionState`. */
export type ResendFormState = { notice?: string; error?: string };

export const RESEND_NOTICE =
  "If that account still needs confirming, a new link is on its way. Check your inbox and spam folder.";

/**
 * Outcome of a resend. Only rate limits and outages are reported, and neither
 * is about the account: every other result, including "no such account" or
 * "already confirmed", gets the same notice so the form can't be used to find
 * out which emails have accounts.
 */
export function resendOutcome(error: AuthErrorLike): ResendFormState {
  if (isRateLimited(error)) {
    return { error: "Too many emails requested. Wait a few minutes and try again." };
  }
  if (isServerFailure(error)) {
    return { error: "We couldn't send the email right now. Try again in a few minutes." };
  }
  return { notice: RESEND_NOTICE };
}

/**
 * Reads the confirm link's query (`token_hash`, `type`, `next`). Returns `null`
 * when the link is malformed, so the page can say so without calling Supabase.
 * Only `type=email` is accepted: it is the only one our template emits.
 */
export function parseConfirmLink(params: Record<string, unknown>): ConfirmEmailInput | null {
  if (single(params.type) !== "email") return null;
  const result = confirmEmailSchema.safeParse({
    tokenHash: single(params.token_hash),
    next: single(params.next),
  });
  return result.success ? result.data : null;
}

/**
 * The `emailRedirectTo` for sign-up and resend: the confirm page on the app's own
 * origin, carrying `next`. It always has a query string, which the email template
 * relies on to append `&token_hash=…`.
 */
export function buildEmailRedirectTo(origin: string, next: unknown): string {
  const url = new URL(CONFIRM_PATH, origin);
  url.searchParams.set("next", sanitizeNextPath(next));
  return url.toString();
}

/** Outcome of a failed confirmation, keyed on the Supabase error code only. */
export function confirmFailure(error: AuthErrorLike): Required<ConfirmFormState> {
  if (error?.code === "otp_expired") {
    return {
      error: "This link has expired or was already used. Sign in to get a new one.",
      retryable: false,
    };
  }
  if (isRateLimited(error)) {
    return { error: "Too many attempts. Wait a moment and try again.", retryable: true };
  }
  if (isServerFailure(error)) {
    return { error: "We couldn't confirm your email right now. Try again.", retryable: true };
  }
  return {
    error: "We couldn't confirm your email. Sign in to get a new link.",
    retryable: false,
  };
}

/** Rate limited by Supabase: per address (max_frequency) or per project/IP. */
export function isRateLimited(error: AuthErrorLike): boolean {
  return (
    error?.code === "over_email_send_rate_limit" ||
    error?.code === "over_request_rate_limit" ||
    error?.status === 429
  );
}

/** Supabase or its email provider failed (not the user's input): worth logging. */
export function isServerFailure(error: AuthErrorLike): boolean {
  return error !== null && (error.status === undefined || error.status >= 500);
}

// Next.js gives repeated query keys as arrays; a confirm link never has them.
function single(value: unknown): unknown {
  return Array.isArray(value) ? undefined : value;
}
