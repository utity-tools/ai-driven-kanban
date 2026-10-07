import { z } from "zod";

import {
  type ConfirmEmailInput,
  isRateLimited,
  isServerFailure,
  nextPathField,
  parseEmailLink,
} from "./confirm";
import { emailSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./schemas";

/** Page the reset email links to (see supabase/templates/recovery.html). */
export const RECOVERY_PATH = "/auth/reset";
/** Where a recovered session sets the new password. */
export const NEW_PASSWORD_PATH = "/reset-password";

/**
 * How long after following an emailed link a session may set a new password
 * without knowing the current one (ADR 0023).
 */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

type AuthErrorLike = { code?: string | undefined; status?: number | undefined } | null;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  next: nextPathField,
});

export const newPasswordSchema = z.object({
  password: z
    .string({ error: "Enter a new password." })
    .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
    .max(PASSWORD_MAX_LENGTH, { error: `Use at most ${PASSWORD_MAX_LENGTH} characters.` }),
  next: nextPathField,
});

/** State returned by the "send me a reset link" Server Action. */
export type ForgotPasswordFormState = {
  notice?: string;
  error?: string;
  fieldError?: string;
  /** Echoed back so the email survives React's form reset. */
  email?: string;
};

/** State returned by the "set a new password" Server Action. */
export type NewPasswordFormState = { error?: string; fieldError?: string };

export const RESET_REQUEST_NOTICE =
  "If an account exists for that email, a link to reset the password is on its way. Check your inbox and spam folder.";

/** Reads the reset link (`type=recovery`). */
export function parseRecoveryLink(params: Record<string, unknown>): ConfirmEmailInput | null {
  return parseEmailLink(params, "recovery");
}

/**
 * Outcome of a reset request. Like resend, only rate limits and outages are
 * reported: "no such account" gets the same notice as a real send.
 */
export function resetRequestOutcome(error: AuthErrorLike): ForgotPasswordFormState {
  if (isRateLimited(error)) {
    return { error: "Too many emails requested. Wait a few minutes and try again." };
  }
  if (isServerFailure(error)) {
    return { error: "We couldn't send the email right now. Try again in a few minutes." };
  }
  return { notice: RESET_REQUEST_NOTICE };
}

/** Messages for a failed recovery link, keyed on the Supabase error code only. */
export function recoveryFailure(error: AuthErrorLike): { error: string; retryable: boolean } {
  if (error?.code === "otp_expired") {
    return {
      error: "This link has expired or was already used. Request a new one.",
      retryable: false,
    };
  }
  if (isRateLimited(error)) {
    return { error: "Too many attempts. Wait a moment and try again.", retryable: true };
  }
  if (isServerFailure(error)) {
    return { error: "We couldn't check your link right now. Try again.", retryable: true };
  }
  return { error: "This reset link is invalid. Request a new one.", retryable: false };
}

/** Messages for a refused new password, keyed on the Supabase error code only. */
export function newPasswordFailure(error: AuthErrorLike): NewPasswordFormState {
  switch (error?.code) {
    case "same_password":
      return { fieldError: "Choose a password different from your current one." };
    case "weak_password":
      return {
        fieldError: "That password is too weak. Use a longer password that is harder to guess.",
      };
    default:
      return isRateLimited(error)
        ? { error: "Too many attempts. Wait a moment and try again." }
        : { error: "We couldn't update your password. Try again." };
  }
}

/**
 * Whether this session may set a new password without the current one: it must
 * have been opened by an emailed link (Supabase records it as `otp` in the JWT
 * `amr` claim) within the last RECOVERY_WINDOW_SECONDS. A session from a
 * password or GitHub sign-in (e.g. a stolen cookie) never qualifies. Proving
 * email ownership is exactly what a reset link proves, so a just-confirmed
 * sign-up counts too (ADR 0023).
 */
export function canSetNewPassword(
  claims: { amr?: unknown; is_anonymous?: unknown },
  nowSeconds: number,
): boolean {
  if (claims.is_anonymous === true || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (
      method === "otp" &&
      typeof timestamp === "number" &&
      timestamp <= nowSeconds + 60 && // tolerate small clock skew
      nowSeconds - timestamp <= RECOVERY_WINDOW_SECONDS
    );
  });
}
