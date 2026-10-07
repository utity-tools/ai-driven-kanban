import { expect, test } from "@playwright/test";

import {
  confirmEmail,
  DEMO_BOARD_PATH,
  expectLoginWithNext,
  newCredentials,
  signIn,
  startSignUp,
} from "./support/auth";
import { confirmationLink, latestEmailId } from "./support/mailpit";

// Sign-up requires email confirmation (ADR 0022). Emails are read from the local Mailpit.

test("opening the link doesn't confirm: only pressing the button does", async ({ page }) => {
  const credentials = newCredentials();
  await startSignUp(page, credentials);
  const link = await confirmationLink(credentials.email);

  await test.step("a plain GET (like a mail scanner's) doesn't spend the token", async () => {
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1, name: "Confirm your email" })).toBeVisible();
    await page.goto("/boards");
    await expectLoginWithNext(page, "/boards");
  });

  await test.step("the same link still confirms and signs the user in", async () => {
    await page.goto(link);
    await page.getByRole("button", { name: "Confirm email" }).click();

    await expect(page).toHaveURL("/boards");
    await expect(page.getByRole("banner")).toContainText(`Signed in as ${credentials.email}`);
  });
});

test("an unconfirmed user can't sign in until confirming a resent link", async ({ page }) => {
  const credentials = newCredentials();
  await startSignUp(page, credentials);
  // Wait for the first email to be indexed, so the resent one is told apart from it.
  await confirmationLink(credentials.email);
  const firstEmail = await latestEmailId(credentials.email);

  await test.step("sign-in is refused with an offer to resend", async () => {
    await page.goto("/login");
    await signIn(page, credentials);

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Confirm your email address before signing in.",
    );
    await expect(page).toHaveURL((url) => url.pathname === "/login");
  });

  await test.step("resending sends a new email", async () => {
    // Supabase spaces emails to one address (max_frequency, 1s locally): retry past it.
    await expect(async () => {
      await page.getByRole("button", { name: "Resend confirmation email" }).click();
      await expect(page.getByRole("status")).toContainText("a new link is on its way", {
        timeout: 1_000,
      });
    }).toPass({ intervals: [1_000], timeout: 10_000 });
  });

  await test.step("the new link confirms the account", async () => {
    await page.goto(await confirmationLink(credentials.email, { after: firstEmail }));
    await page.getByRole("button", { name: "Confirm email" }).click();

    await expect(page).toHaveURL("/boards");
    await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
  });
});

test("the confirm link keeps the page the user was going to", async ({ page }) => {
  const credentials = newCredentials();
  await startSignUp(page, credentials, { next: DEMO_BOARD_PATH });

  await confirmEmail(page, credentials.email);

  // Not a member of Alice's board, so "Board not found" — but on the right path.
  await expect(page).toHaveURL(DEMO_BOARD_PATH);
});

test("a link that was already used explains how to get a new one", async ({ page, browser }) => {
  const credentials = newCredentials();
  await startSignUp(page, credentials);
  const link = await confirmationLink(credentials.email);
  await confirmEmail(page, credentials.email);
  await expect(page).toHaveURL("/boards");

  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const second = await other.newPage();
    await second.goto(link);
    await second.getByRole("button", { name: "Confirm email" }).click();

    await expect(second.getByRole("main").getByRole("alert")).toHaveText(
      "This link has expired or was already used. Sign in to get a new one.",
    );
    await expect(second.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("a malformed link says so without a confirm button", async ({ page }) => {
  await page.goto("/auth/confirm?type=email");

  await expect(page.getByRole("main")).toContainText(
    "This confirmation link is incomplete or invalid.",
  );
  await expect(page.getByRole("button", { name: "Confirm email" })).toHaveCount(0);
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await expect(page).toHaveURL("/login");
});
