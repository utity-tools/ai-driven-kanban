"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  buildEmailRedirectTo,
  confirmEmailSchema,
  confirmFailure,
  type ConfirmFormState,
  isServerFailure,
  type ResendFormState,
  resendConfirmationSchema,
  resendOutcome,
} from "@/lib/auth/confirm";
import { authErrorToFormState } from "@/lib/auth/errors";
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

/** Sends the sign-up confirmation email again. Same answer for every email, except rate limits. */
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
  if (error) logAuthFailure("auth.resend_failed", error);
  return resendOutcome(error);
}

/**
 * Confirm page on the current origin, so links from Vercel previews come back
 * to the same preview. Without a usable origin, Supabase falls back to the
 * project's Site URL (the email template handles both).
 */
async function confirmRedirectTo(next: string): Promise<string | undefined> {
  const origin = getRequestOrigin(await headers());
  return origin ? buildEmailRedirectTo(origin, next) : undefined;
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
