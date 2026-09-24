import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

/** Seeded accounts (see supabase/seed.sql). */
export const ALICE = { email: "alice@example.com", password: "password123" } as const;

/**
 * Alice's signed-in storage state, written once per run by `auth.setup.ts`.
 * Only for tests that need to *be* signed in, not to test signing in. Never sign
 * out with it: Supabase's sign-out revokes every session of the user, which
 * would break other tests running in parallel.
 */
export const ALICE_STORAGE_STATE = path.join(__dirname, "../../../playwright/.auth/alice.json");

/** Unique per call, so sign-up tests never collide across workers or runs. */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
}

/** Fills and submits the email/password form on /login or /signup. */
export async function submitCredentials(
  page: Page,
  { email, password }: { email: string; password: string },
  submitLabel: "Sign in" | "Create account",
): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: submitLabel, exact: true }).click();
}

export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  await submitCredentials(page, credentials, "Sign in");
}

/** Signs up a brand-new user from /signup and waits for the boards page. */
export async function signUpNewUser(page: Page): Promise<{ email: string; password: string }> {
  const credentials = { email: uniqueEmail(), password: `pw-${randomUUID()}` };
  await page.goto("/signup");
  await submitCredentials(page, credentials, "Create account");
  await expect(page).toHaveURL("/boards");
  await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
  return credentials;
}

/** Asserts the page is /login and that `next` carries the given path. */
export async function expectLoginWithNext(page: Page, next: string): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe(next);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
}
