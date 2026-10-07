import { z } from "zod";

import { sanitizeNextPath } from "./redirect";

/** Page the confirmation email links to (see supabase/templates/confirmation.html). */
export const CONFIRM_PATH = "/auth/confirm";

// Supabase token hashes are hex today; stay a little lenient so a format change
// upstream doesn't lock users out, but keep it to URL-safe characters.
const tokenHash = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/);

export const confirmEmailSchema = z.object({
  tokenHash,
  next: z.unknown().transform((value) => sanitizeNextPath(value)),
});

export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;

/** State returned by the confirm Server Action to `useActionState`. */
export type ConfirmFormState = { error?: string };

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

/** Messages for a failed confirmation, keyed on the Supabase error code only. */
export function confirmErrorMessage(error: { code?: string | undefined } | null): string {
  switch (error?.code) {
    case "otp_expired":
      return "This link has expired or was already used. Sign in to get a new one.";
    case "over_request_rate_limit":
      return "Too many attempts. Wait a moment and try again.";
    default:
      return "We couldn't confirm your email. Sign in to get a new link.";
  }
}

// Next.js gives repeated query keys as arrays; a confirm link never has them.
function single(value: unknown): unknown {
  return Array.isArray(value) ? undefined : value;
}
