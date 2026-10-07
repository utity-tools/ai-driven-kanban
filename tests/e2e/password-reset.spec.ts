import { randomUUID } from "node:crypto";

import { type Browser, expect, type Page, test } from "@playwright/test";

import {
  ALICE_STORAGE_STATE,
  expectLoginWithNext,
  signIn,
  signUpNewUser,
  uniqueEmail,
} from "./support/auth";
import { latestEmailId, resetLink } from "./support/mailpit";

// Password reset by email (ADR 0023). Emails are read from the local Mailpit.

async function signedOutPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return context.newPage();
}

/** Asks for a reset link from /forgot-password and waits for the neutral answer. */
async function requestReset(page: Page, email: string): Promise<void> {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists for that email");
}

test("a forgotten password is reset from the emailed link", async ({ page, browser }) => {
  const { email, password: oldPassword } = await signUpNewUser(page);
  const signUpEmail = await latestEmailId(email);
  const newPassword = `pw-${randomUUID()}`;
  const visitor = await signedOutPage(browser);

  try {
    await test.step("sign-in links to the forgot password page", async () => {
      await visitor.goto("/login");
      await visitor.getByRole("link", { name: "Forgot password?" }).click();
      await expect(
        visitor.getByRole("heading", { level: 1, name: "Forgot your password?" }),
      ).toBeVisible();
    });

    await test.step("a reset link is emailed", async () => {
      await requestReset(visitor, email);
    });

    await test.step("the link opens a button page, then the new password form", async () => {
      await visitor.goto(await resetLink(email, { after: signUpEmail }));
      await visitor.getByRole("button", { name: "Choose a new password" }).click();

      await expect(visitor).toHaveURL((url) => url.pathname === "/reset-password");
      await expect(visitor.getByRole("main")).toContainText(`For ${email}.`);
    });

    await test.step("a weak password is refused", async () => {
      await visitor.getByLabel("New password").fill("short");
      await visitor.getByRole("button", { name: "Save new password" }).click();

      await expect(visitor.getByRole("main").getByRole("alert")).toHaveText(
        "Use at least 8 characters.",
      );
    });

    await test.step("the new password is saved and the user lands on /boards", async () => {
      await visitor.getByLabel("New password").fill(newPassword);
      await visitor.getByRole("button", { name: "Save new password" }).click();

      await expect(visitor).toHaveURL("/boards");
      await expect(visitor.getByRole("banner")).toContainText(`Signed in as ${email}`);
    });
  } finally {
    await visitor.context().close();
  }

  await test.step("only the new password signs in", async () => {
    const fresh = await signedOutPage(browser);
    try {
      await fresh.goto("/login");
      await signIn(fresh, { email, password: oldPassword });
      await expect(fresh.getByRole("main").getByRole("alert")).toHaveText(
        "Incorrect email or password.",
      );

      await signIn(fresh, { email, password: newPassword });
      await expect(fresh).toHaveURL("/boards");
    } finally {
      await fresh.context().close();
    }
  });
});

test("an unknown email gets the same answer as a real one", async ({ page }) => {
  await requestReset(page, uniqueEmail());

  await expect(page).toHaveURL((url) => url.pathname === "/forgot-password");
});

test("a used reset link explains how to get a new one", async ({ page, browser }) => {
  const { email } = await signUpNewUser(page);
  const signUpEmail = await latestEmailId(email);
  const visitor = await signedOutPage(browser);

  try {
    await requestReset(visitor, email);
    const link = await resetLink(email, { after: signUpEmail });
    await visitor.goto(link);
    await visitor.getByRole("button", { name: "Choose a new password" }).click();
    await expect(visitor).toHaveURL((url) => url.pathname === "/reset-password");

    await visitor.goto(link);
    await visitor.getByRole("button", { name: "Choose a new password" }).click();

    await expect(visitor.getByRole("main").getByRole("alert")).toHaveText(
      "This link has expired or was already used. Request a new one.",
    );
    await visitor.getByRole("link", { name: "Request a new link" }).click();
    await expect(visitor).toHaveURL("/forgot-password");
  } finally {
    await visitor.context().close();
  }
});

test("a malformed reset link has no button", async ({ page }) => {
  await page.goto("/auth/reset?type=recovery");

  await expect(page.getByRole("main")).toContainText("This reset link is incomplete or invalid.");
  await expect(page.getByRole("button", { name: "Choose a new password" })).toHaveCount(0);
});

test.describe("the new password page", () => {
  test("is not available to a normal signed-in session", async ({ browser }) => {
    // Alice signed in with her password: that session can't set a new one (ADR 0023).
    const context = await browser.newContext({ storageState: ALICE_STORAGE_STATE });
    try {
      const page = await context.newPage();
      await page.goto("/reset-password");

      await expect(page.getByRole("main")).toContainText("open a reset link from your email first");
      await expect(page.getByLabel("New password")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("sends signed-out visitors to sign in", async ({ page }) => {
    await page.goto("/reset-password");

    await expectLoginWithNext(page, "/reset-password");
  });
});
