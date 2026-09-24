import { expect, test } from "@playwright/test";

import { ALICE, signUpNewUser, submitCredentials, uniqueEmail } from "./support/auth";

test("a new user lands on /boards with the default board", async ({ page }) => {
  const { email } = await signUpNewUser(page);

  // The onboarding trigger creates exactly one board for a new user.
  const boards = page.getByRole("main").getByRole("listitem");
  await expect(boards).toHaveCount(1);
  await expect(boards.getByRole("link", { name: "My board" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(`Signed in as ${email}`);
});

test("a short password shows a field error and stays on /signup", async ({ page }) => {
  await page.goto("/signup");
  await submitCredentials(page, { email: uniqueEmail(), password: "short" }, "Create account");

  const password = page.getByLabel("Password");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Use at least 8 characters.");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toBeFocused();
  await expect(page).toHaveURL((url) => url.pathname === "/signup");
});

test("an invalid email shows a field error", async ({ page }) => {
  await page.goto("/signup");
  await submitCredentials(
    page,
    { email: "not-an-email", password: "long-enough-1" },
    "Create account",
  );

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Enter a valid email address.",
  );
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL((url) => url.pathname === "/signup");
});

test("an existing email is rejected with a hint to sign in", async ({ page }) => {
  await page.goto("/signup");
  await submitCredentials(
    page,
    { email: ALICE.email, password: "long-enough-1" },
    "Create account",
  );

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "An account with this email already exists. Sign in instead.",
  );
  await expect(page).toHaveURL((url) => url.pathname === "/signup");
});
