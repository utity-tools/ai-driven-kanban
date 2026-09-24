"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
  if (error) return authErrorToFormState(error, parsed.data.email);

  redirect(sanitizeNextPath(formData.get("next")));
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = validateCredentials(signupSchema, readCredentials(formData));
  if (!parsed.success) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return authErrorToFormState(error, parsed.data.email);
  if (!data.session) {
    // Only reachable if email confirmation gets enabled for this project.
    return {
      formError: "Check your email to confirm your account, then sign in.",
      email: parsed.data.email,
    };
  }

  redirect(sanitizeNextPath(formData.get("next")));
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
