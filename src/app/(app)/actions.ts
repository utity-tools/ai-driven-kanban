"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DEFAULT_AFTER_LOGIN_PATH, sanitizeNextPath } from "@/lib/auth/redirect";
import { LOGIN_PATH, SIGNUP_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/db/server";

async function signOutAndRedirect(path: string): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(path);
}

export async function signOut(): Promise<void> {
  await signOutAndRedirect(LOGIN_PATH);
}

/** Leaves demo mode and returns to the landing page. */
export async function exitDemo(): Promise<void> {
  await signOutAndRedirect("/");
}

/**
 * Leaves demo mode and opens sign-up. Signing out first is required: the proxy
 * sends any signed-in user (anonymous included) away from the auth pages.
 * An optional same-origin `next` field (e.g. an invite page) is kept through sign-up.
 */
export async function createAccountFromDemo(formData?: FormData): Promise<void> {
  const next = sanitizeNextPath(formData?.get("next"));
  await signOutAndRedirect(
    next === DEFAULT_AFTER_LOGIN_PATH
      ? SIGNUP_PATH
      : `${SIGNUP_PATH}?${new URLSearchParams({ next }).toString()}`,
  );
}
