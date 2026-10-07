"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  buildEmailRedirectTo,
  confirmEmailSchema,
  confirmFailure,
  type ConfirmFormState,
  isRateLimited,
  isServerFailure,
  type ResendFormState,
  resendConfirmationSchema,
  resendOutcome,
} from "@/lib/auth/confirm";
import { authErrorToFormState } from "@/lib/auth/errors";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormState,
  NEW_PASSWORD_PATH,
  newPasswordFailure,
  type NewPasswordFormState,
  newPasswordSchema,
  RECOVERY_PATH,
  recoveryFailure,
  resetRequestOutcome,
} from "@/lib/auth/recovery";
import { getRequestOrigin } from "@/lib/auth/origin";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  type AuthFormState,
  loginSchema,
  readCredentials,
  signupSchema,
  validateCredentials,
} from "@/lib/auth/schemas";
import { getPasswordResetUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = validateCredentials(loginSchema, readCredentials(formData));
  if (!parsed.success) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const state = authErrorToFormState(error, parsed.data.email);
    return error.code === "email_not_confirmed" ? { ...state, unconfirmed: true } : state;
  }

  redirect(sanitizeNextPath(formData.get("next")));
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = validateCredentials(signupSchema, readCredentials(formData));
  if (!parsed.success) return parsed.state;

  const next = sanitizeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: await confirmRedirectTo(next) },
  });
  // Never reveal that an account exists (ADR 0022): a taken email gets the same
  // "check your email" answer as a new one. Supabase rejects already-confirmed
  // emails with this error and re-sends the link for unconfirmed ones.
  const emailTaken = error?.code === "user_already_exists" || error?.code === "email_exists";
  if (error && !emailTaken) {
    logAuthFailure("auth.signup_failed", error);
    return authErrorToFormState(error, parsed.data.email);
  }
  // No session means the project requires email confirmation.
  if (emailTaken || !data.session) {
    return { confirmationSentTo: parsed.data.email, email: parsed.data.email };
  }

  redirect(next);
}

export async function signInWithGitHub(formData: FormData): Promise<void> {
  const next = sanitizeNextPath(formData.get("next"));
  const failure = `${LOGIN_PATH}?${new URLSearchParams({ error: "oauth", next }).toString()}`;

  const origin = getRequestOrigin(await headers());
  if (!origin) redirect(failure);

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect(failure);

  redirect(data.url);
}

/** Spends the confirmation token from the email link and signs the user in. See ADR 0022. */
export async function confirmEmail(
  _prev: ConfirmFormState,
  formData: FormData,
): Promise<ConfirmFormState> {
  const parsed = confirmEmailSchema.safeParse({
    tokenHash: formData.get("token_hash"),
    next: formData.get("next"),
  });
  if (!parsed.success) return confirmFailure({ code: "invalid_input", status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: parsed.data.tokenHash,
  });
  if (error) {
    logAuthFailure("auth.confirm_failed", error);
    return confirmFailure(error);
  }

  redirect(parsed.data.next);
}

/** Sends the sign-up confirmation email again. Same answer for every email, except outages. */
export async function resendConfirmation(
  _prev: ResendFormState,
  formData: FormData,
): Promise<ResendFormState> {
  const parsed = resendConfirmationSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: await confirmRedirectTo(parsed.data.next) },
  });
  if (error) {
    logAuthFailure("auth.resend_failed", error);
    logHiddenRateLimit("auth.resend_rate_limited", error);
  }
  return resendOutcome(error);
}

/** Emails a password reset link. Same answer for every email, except outages. */
export async function requestPasswordReset(
  _prev: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const raw = formData.get("email");
  const parsed = forgotPasswordSchema.safeParse({ email: raw, next: formData.get("next") });
  if (!parsed.success) {
    return {
      fieldError: "Enter a valid email address.",
      email: typeof raw === "string" ? raw : undefined,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await confirmRedirectTo(parsed.data.next, RECOVERY_PATH),
  });
  if (error) {
    logAuthFailure("auth.reset_request_failed", error);
    logHiddenRateLimit("auth.reset_request_rate_limited", error);
  }
  return { ...resetRequestOutcome(error), email: parsed.data.email };
}

/** Spends the reset token from the email link, then asks for the new password. ADR 0023. */
export async function verifyRecovery(
  _prev: ConfirmFormState,
  formData: FormData,
): Promise<ConfirmFormState> {
  const parsed = confirmEmailSchema.safeParse({
    tokenHash: formData.get("token_hash"),
    next: formData.get("next"),
  });
  if (!parsed.success) return recoveryFailure({ code: "invalid_input", status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: parsed.data.tokenHash,
  });
  if (error) {
    logAuthFailure("auth.recovery_failed", error);
    return recoveryFailure(error);
  }

  redirect(`${NEW_PASSWORD_PATH}?${new URLSearchParams({ next: parsed.data.next }).toString()}`);
}

/**
 * Sets the new password, only for a session opened by an emailed link moments
 * ago (re-checked here, never trusted from the page), then signs out every
 * other session of the user in case the account was compromised.
 */
export async function updatePassword(
  _prev: NewPasswordFormState,
  formData: FormData,
): Promise<NewPasswordFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { fieldError: parsed.error.issues[0]?.message ?? "Enter a new password." };
  }

  if (!(await getPasswordResetUser())) {
    return { error: "This reset session has expired. Request a new link." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logAuthFailure("auth.password_update_failed", error);
    return newPasswordFailure(error);
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) logAuthFailure("auth.sign_out_others_failed", signOutError);

  redirect(parsed.data.next);
}

/**
 * Emailed-link page (confirm by default) on the current origin, so links from Vercel previews come back
 * to the same preview. Without a usable origin, Supabase falls back to the
 * project's Site URL (the email template handles both).
 */
async function confirmRedirectTo(next: string, path?: string): Promise<string | undefined> {
  const origin = getRequestOrigin(await headers());
  return origin ? buildEmailRedirectTo(origin, next, path) : undefined;
}

/**
 * Logs Supabase/SMTP outages so silently failing sign-ups show up in the logs.
 * Only the error code and status: never the email or the token.
 */
function logAuthFailure(
  event: string,
  error: { code?: string | undefined; status?: number | undefined },
): void {
  if (isServerFailure(error)) console.error(event, { code: error.code, status: error.status });
}

/**
 * Logs rate limits the user isn't told about (resend, reset), so an exhausted
 * project email quota still shows up in the logs.
 */
function logHiddenRateLimit(
  event: string,
  error: { code?: string | undefined; status?: number | undefined },
): void {
  if (isRateLimited(error)) console.warn(event, { code: error.code, status: error.status });
}
