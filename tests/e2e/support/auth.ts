import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

import { confirmationLink } from "./mailpit";

/** Seeded accounts (see supabase/seed.sql). */
export const ALICE = { email: "alice@example.com", password: "password123" } as const;
/** Editor (not owner) on Alice's "Demo board". */
export const BOB = { email: "bob@example.com", password: "password123" } as const;
/** Viewer (read-only) on Alice's "Demo board". */
export const CAROL = { email: "carol@example.com", password: "password123" } as const;

/** The seeded Demo board (see supabase/seed.sql). */
export const DEMO_BOARD_PATH = "/boards/b0a4d000-0000-4000-8000-000000000001";

/**
 * Alice's signed-in storage state, written once per run by `auth.setup.ts`.
 * Only for tests that need to *be* signed in, not to test signing in. Never sign
 * out with it: Supabase's sign-out revokes every session of the user, which
 * would break other tests running in parallel.
 */
export const ALICE_STORAGE_STATE = path.join(__dirname, "../../../playwright/.auth/alice.json");

/** Bob's signed-in storage state, same rules as ALICE_STORAGE_STATE (never sign out with it). */
export const BOB_STORAGE_STATE = path.join(__dirname, "../../../playwright/.auth/bob.json");

/** Carol's signed-in storage state, same rules as ALICE_STORAGE_STATE (never sign out with it). */
export const CAROL_STORAGE_STATE = path.join(__dirname, "../../../playwright/.auth/carol.json");

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

/** Fresh credentials for a user that doesn't exist yet. */
export function newCredentials(): { email: string; password: string } {
  return { email: uniqueEmail(), password: `pw-${randomUUID()}` };
}

/** Submits /signup and waits for "Check your email" (sign-up requires confirmation, ADR 0022). */
export async function startSignUp(
  page: Page,
  credentials: { email: string; password: string },
  { next }: { next?: string } = {},
): Promise<void> {
  await page.goto(next ? `/signup?${new URLSearchParams({ next }).toString()}` : "/signup");
  await submitCredentials(page, credentials, "Create account");
  await expect(page.getByRole("heading", { level: 2, name: "Check your email" })).toBeVisible();
}

/** Opens the confirmation link from the email in Mailpit and presses "Confirm email". */
export async function confirmEmail(page: Page, email: string): Promise<void> {
  await page.goto(await confirmationLink(email));
  await page.getByRole("button", { name: "Confirm email" }).click();
}

/** Signs up a brand-new user from /signup, confirms the email and waits for the boards page. */
export async function signUpNewUser(page: Page): Promise<{ email: string; password: string }> {
  const credentials = newCredentials();
  await startSignUp(page, credentials);
  await confirmEmail(page, credentials.email);
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
