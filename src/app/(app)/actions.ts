"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
 */
export async function createAccountFromDemo(): Promise<void> {
  await signOutAndRedirect(SIGNUP_PATH);
}
