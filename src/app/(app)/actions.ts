"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/db/server";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(LOGIN_PATH);
}
