import { expect, test } from "@playwright/test";

import {
  ALICE,
  ALICE_STORAGE_STATE,
  expectLoginWithNext,
  signIn,
  signUpNewUser,
} from "./support/auth";

// Every test gets a fresh browser context (Playwright default), so each starts
// signed out unless it opts into ALICE_STORAGE_STATE.

test.describe("signed out", () => {
  test("/boards redirects to /login keeping next", async ({ page }) => {
    await page.goto("/boards");

    await expectLoginWithNext(page, "/boards");
  });

  test("/ is the public landing page, not a redirect", async ({ page }) => {
    // demo-mode.spec.ts covers the landing page's calls to action.
    await page.goto("/");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "AI-Driven Kanban" })).toBeVisible();
  });

  test("login page offers GitHub sign-in", async ({ page }) => {
    // OAuth itself is not tested end to end: it depends on an external provider.
    await page.goto("/login");

    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  });
});

test.describe("sign in", () => {
  test("seeded Alice sees her boards and her email in the header", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, ALICE);

    await expect(page).toHaveURL("/boards");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Demo board" })).toBeVisible();
    await expect(main.getByRole("link", { name: "My board" })).toBeVisible();
    const header = page.getByRole("banner");
    await expect(header).toContainText(`Signed in as ${ALICE.email}`);
    await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("wrong password shows a friendly error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, { email: ALICE.email, password: "not-the-password" });

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Incorrect email or password.",
    );
    await expect(page).toHaveURL((url) => url.pathname === "/login");
    // The email survives the failed submit; the password does not.
    await expect(page.getByLabel("Email")).toHaveValue(ALICE.email);
    await expect(page.getByLabel("Password")).toHaveValue("");
  });

  test("empty submit shows field errors without calling Auth", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page).toHaveURL((url) => url.pathname === "/login");
  });

  test("deep link to a board returns there after sign-in", async ({ browser }) => {
    // Find the Demo board's URL through the UI as an already signed-in Alice.
    const aliceContext = await browser.newContext({ storageState: ALICE_STORAGE_STATE });
    const alicePage = await aliceContext.newPage();
    await alicePage.goto("/boards");
    await alicePage.getByRole("main").getByRole("link", { name: "Demo board" }).click();
    await expect(alicePage).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
    const boardPath = new URL(alicePage.url()).pathname;
    await aliceContext.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(boardPath);
    await expectLoginWithNext(page, boardPath);

    await signIn(page, ALICE);

    await expect(page).toHaveURL(boardPath);
    await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();
    await context.close();
  });

  test("open redirect via next=//evil.com is blocked", async ({ page }) => {
    await page.goto("/login?next=//evil.com");
    await signIn(page, ALICE);

    await expect(page).toHaveURL("/boards");
    await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
  });
});

test.describe("signed in", () => {
  test.use({ storageState: ALICE_STORAGE_STATE });

  for (const path of ["/login", "/signup"]) {
    test(`visiting ${path} sends the user to /boards`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL("/boards");
      await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
    });
  }
});

test.describe("sign out", () => {
  test("signs the user out and protects /boards again", async ({ page }) => {
    // A throwaway user: signing out revokes all of the user's sessions, so
    // doing it as Alice would break tests running in parallel.
    await signUpNewUser(page);

    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL((url) => url.pathname === "/login");
    await page.goto("/boards");
    await expectLoginWithNext(page, "/boards");
  });
});
