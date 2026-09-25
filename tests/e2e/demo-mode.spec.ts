import { type Page } from "@playwright/test";

import { ALICE_STORAGE_STATE, expectLoginWithNext } from "./support/auth";
import {
  addCards,
  boardHeading,
  cardTitles,
  columnHeadings,
  expect,
  test,
  uniqueTitle,
} from "./support/boards";
import { trackServerActions } from "./support/server-actions";

// Demo mode (v0.1 delivery 6): the public landing page at "/" and the
// anonymous demo session started by "Try the demo".
//
// Isolation: every test gets a fresh, signed-out browser context (Playwright
// default) unless it opts into ALICE_STORAGE_STATE. Each "Try the demo"
// creates a brand-new anonymous user with its own demo board, so demo tests
// never share data and are free to edit their board.
//
// Rate limit: Supabase Auth allows 30 anonymous sign-ins per hour per IP, so
// this file starts only two demos per run (the journey and the sign-up
// hand-off), combining steps with test.step instead of one demo per assertion.
//
// Not covered here:
// - A "Continue the demo" whose anonymous user was already deleted by the
//   cleanup job (it signs out and restarts): simulating it needs the service
//   role; the decision logic is unit tested in src/lib/auth/demo.test.ts.
// - The "Starting demo…" pending label: it is visible only while the action
//   runs, so asserting it would be timing-dependent.
// - The ?error=demo redirect when Auth rejects the anonymous sign-in (rate
//   limit, feature disabled): it can't be triggered without breaking Auth for
//   the parallel tests; the alert it leads to is covered by visiting the URL.
// - Cleanup of expired demo users (pg_cron): covered by the pgTAP tests.

const DEMO_BOARD_TITLE = "Demo: Launch a landing page";
const DEMO_COLUMNS = ["Backlog", "To do", "In progress", "Done"];
const DEMO_BACKLOG = ["A/B test the pricing section", "Set up analytics events"];
const DEMO_CARDS: Record<string, string[]> = {
  Backlog: DEMO_BACKLOG,
  "To do": ["Write hero copy and CTA", "Configure custom domain and SSL"],
  "In progress": ["Build responsive hero section", "Integrate newsletter signup form"],
  Done: ["Wireframe the page layout", "Choose the stack and hosting"],
};
const BANNER_TEXT = "You're exploring a demo. Your changes are kept for 7 days, then deleted.";
const BOARD_PATH = /^\/boards\/[0-9a-f-]{36}$/;

function hero(page: Page) {
  return page.getByRole("main").getByRole("region", { name: "AI-Driven Kanban" });
}

function demoBanner(page: Page) {
  return page.getByRole("complementary", { name: "Demo mode" });
}

/** From the signed-out landing page, starts a demo and waits for the demo board. */
async function startDemo(page: Page): Promise<string> {
  await page.goto("/");
  await hero(page).getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL((url) => BOARD_PATH.test(url.pathname));
  await expect(boardHeading(page)).toHaveText(DEMO_BOARD_TITLE);
  return new URL(page.url()).pathname;
}

test.describe("landing page, signed out", () => {
  test("shows the demo, sign-up and sign-in calls to action", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "AI-Driven Kanban" })).toBeVisible();
    const cta = hero(page);
    await expect(cta.getByRole("button", { name: "Try the demo" })).toBeVisible();
    await expect(cta.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/signup",
    );
    await expect(cta.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(cta.getByRole("button", { name: "Continue the demo" })).toHaveCount(0);
    await expect(cta.getByRole("link", { name: "Go to your boards" })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("?error=demo shows a friendly alert and keeps the demo button", async ({ page }) => {
    await page.goto("/?error=demo");

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "We couldn't start the demo right now",
    );
    await expect(hero(page).getByRole("button", { name: "Try the demo" })).toBeVisible();
  });

  test("an unknown error code shows nothing and is not echoed", async ({ page }) => {
    await page.goto("/?error=%3Cb%3Einjected%3C%2Fb%3E");

    await expect(hero(page).getByRole("button", { name: "Try the demo" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("injected")).toHaveCount(0);
  });
});

test.describe("landing page, permanent user", () => {
  test.use({ storageState: ALICE_STORAGE_STATE });

  test("offers the boards instead of a demo", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/");
    const cta = hero(page);
    await expect(cta.getByRole("link", { name: "Go to your boards" })).toHaveAttribute(
      "href",
      "/boards",
    );
    await expect(cta.getByRole("button", { name: "Try the demo" })).toHaveCount(0);
    await expect(cta.getByRole("button", { name: "Continue the demo" })).toHaveCount(0);

    await cta.getByRole("link", { name: "Go to your boards" }).click();
    await expect(page).toHaveURL("/boards");
    await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
    // Permanent users never see the demo banner.
    await expect(demoBanner(page)).toHaveCount(0);
  });
});

test.describe("demo session", () => {
  test("try, edit, continue and exit the demo", async ({ page }) => {
    const boardPath = await test.step("Try the demo opens a pre-filled board", async () => {
      const path = await startDemo(page);

      await expect(columnHeadings(page)).toHaveText(DEMO_COLUMNS);
      for (const [columnTitle, titles] of Object.entries(DEMO_CARDS)) {
        await expect(cardTitles(page, columnTitle)).toHaveText(titles);
      }
      const banner = demoBanner(page);
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(BANNER_TEXT);
      await expect(banner.getByRole("button", { name: "Create an account" })).toBeVisible();
      await expect(banner.getByRole("button", { name: "Exit demo" })).toBeVisible();
      const header = page.getByRole("banner");
      await expect(header).toContainText("Signed in as Demo visitor");
      await expect(header.getByRole("button", { name: "Sign out" })).toHaveCount(0);
      return path;
    });

    await test.step("the visitor can edit the board and the edit persists", async () => {
      const actions = trackServerActions(page);
      const title = uniqueTitle("Demo card");
      const composer = await addCards(page, "Backlog", [title]);
      await composer.press("Escape");
      await actions.settled(1);

      await page.reload();
      await expect(cardTitles(page, "Backlog")).toHaveText([...DEMO_BACKLOG, title]);
    });

    await test.step("back on the landing page, Continue the demo reopens the same board", async () => {
      await page.goto("/");
      const cta = hero(page);
      await expect(cta.getByRole("button", { name: "Continue the demo" })).toBeVisible();
      await expect(cta.getByRole("button", { name: "Try the demo" })).toHaveCount(0);
      await expect(cta.getByRole("link", { name: "Create account" })).toHaveCount(0);
      await expect(cta.getByRole("link", { name: "Sign in" })).toHaveCount(0);
      // Sign-up from the landing page goes through a sign-out (a button, not a link).
      await expect(cta.getByRole("button", { name: "Create an account" })).toBeVisible();

      await cta.getByRole("button", { name: "Continue the demo" }).click();

      await expect(page).toHaveURL(boardPath);
      await expect(boardHeading(page)).toHaveText(DEMO_BOARD_TITLE);
    });

    await test.step("Exit demo signs out to the landing page", async () => {
      await demoBanner(page).getByRole("button", { name: "Exit demo" }).click();

      await expect(page).toHaveURL("/");
      await expect(hero(page).getByRole("button", { name: "Try the demo" })).toBeVisible();
    });

    await test.step("the demo board is no longer reachable", async () => {
      await page.goto(boardPath);

      await expectLoginWithNext(page, boardPath);
    });
  });

  test("Create an account leaves the demo and opens sign-up", async ({ page }) => {
    await startDemo(page);

    await demoBanner(page).getByRole("button", { name: "Create an account" }).click();

    // /signup is only reachable signed out: the proxy sends signed-in users to /boards.
    await expect(page).toHaveURL("/signup");
    await expect(
      page.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeVisible();
    await page.goto("/boards");
    await expectLoginWithNext(page, "/boards");
  });
});
