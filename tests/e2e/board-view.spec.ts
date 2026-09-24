import { expect, test, type Locator, type Page } from "@playwright/test";

import { ALICE_STORAGE_STATE, signUpNewUser } from "./support/auth";

// Read-only board view (v0.1 delivery 3), against the seeded Demo board.
// Every test starts from Alice's saved session; ids are found through the UI.
test.use({ storageState: ALICE_STORAGE_STATE });

/** Seeded Demo board, column by column, in board order (supabase/seed.sql). */
const DEMO_COLUMNS = [
  {
    title: "To do",
    cards: [
      "Add keyboard shortcuts for moving cards",
      "Rate-limit the AI proposal endpoint",
      "Empty state for boards without cards",
    ],
  },
  {
    title: "In progress",
    cards: [
      "Drag and drop cards between columns",
      "Card order resets after refreshing the page",
      "Spike: Supabase Realtime for live board updates",
    ],
  },
  {
    title: "Review",
    cards: ["Show board members in the header", "pgTAP tests for label and assignee policies"],
  },
  { title: "Done", cards: ["Create the board data model", "Sign in with GitHub"] },
] as const;

const ARCHIVED_CARD = "Evaluate other Kanban libraries";
const OVERDUE_CARD = "Card order resets after refreshing the page";
const DONE_CARD = "Create the board data model";
const DESCRIBED_CARD = "Rate-limit the AI proposal endpoint";

/** Opens the Demo board from /boards and returns its path (`/boards/<uuid>`). */
async function openDemoBoard(page: Page): Promise<string> {
  await page.goto("/boards");
  await page.getByRole("main").getByRole("link", { name: "Demo board" }).click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();
  return new URL(page.url()).pathname;
}

function columnsList(page: Page): Locator {
  return page.getByRole("list", { name: "Columns" });
}

function column(page: Page, title: string): Locator {
  return columnsList(page).getByRole("region", { name: title, exact: true });
}

function cardLink(page: Page, title: string): Locator {
  return columnsList(page).getByRole("link", { name: title, exact: true });
}

function card(page: Page, title: string): Locator {
  return columnsList(page)
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
}

function cardParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get("card");
}

test.describe("board layout", () => {
  test("shows the columns in order with their cards in seeded order", async ({ page }) => {
    await openDemoBoard(page);

    await expect(columnsList(page).getByRole("heading", { level: 2 })).toHaveText(
      DEMO_COLUMNS.map((c) => c.title),
    );

    for (const { title, cards } of DEMO_COLUMNS) {
      const region = column(page, title);
      // The count is visible as a number and spelled out for screen readers.
      await expect(region.getByText(`${cards.length} cards`, { exact: true })).toBeVisible();
      await expect(
        region.getByRole("list", { name: `${title} cards` }).getByRole("heading", { level: 3 }),
      ).toHaveText([...cards]);
    }
  });

  test("hides archived cards", async ({ page }) => {
    await openDemoBoard(page);
    await expect(cardLink(page, DEMO_COLUMNS[0].cards[0])).toBeVisible();

    await expect(page.getByText(ARCHIVED_CARD)).toHaveCount(0);
  });

  test("header lists the board members by name", async ({ page }) => {
    await openDemoBoard(page);

    const members = page.getByRole("list", { name: "Board members" }).getByRole("img");
    await expect(members).toHaveCount(2);
    await expect(members.nth(0)).toHaveAccessibleName("Alice Martin");
    await expect(members.nth(1)).toHaveAccessibleName("Bob Chen");
  });
});

test.describe("card face", () => {
  test("due badges convey overdue and done in text, not only colour", async ({ page }) => {
    await openDemoBoard(page);

    await expect(card(page, OVERDUE_CARD)).toContainText(/Overdue: \w{3} \d{1,2}/);
    await expect(card(page, DONE_CARD)).toContainText(/Done: \w{3} \d{1,2}/);
    await expect(card(page, DONE_CARD)).not.toContainText("Overdue");
  });

  test("labels and assignees have accessible names", async ({ page }) => {
    await openDemoBoard(page);

    const overdue = card(page, OVERDUE_CARD);
    await expect(overdue.getByRole("list", { name: "Labels" }).getByRole("listitem")).toHaveText([
      "bug",
      "frontend",
    ]);
    await expect(
      overdue.getByRole("list", { name: "Assignees" }).getByRole("img", { name: "Bob Chen" }),
    ).toBeVisible();

    // Colour-only labels are named after their colour.
    const spike = card(page, "Spike: Supabase Realtime for live board updates");
    await expect(spike.getByRole("img", { name: "Green label" })).toBeVisible();

    const bothAssigned = card(page, "Drag and drop cards between columns");
    await expect(
      bothAssigned.getByRole("list", { name: "Assignees" }).getByRole("img"),
    ).toHaveCount(2);
    await expect(bothAssigned.getByRole("img", { name: "Alice Martin" })).toBeVisible();
    await expect(bothAssigned.getByRole("img", { name: "Bob Chen" })).toBeVisible();
  });
});

test.describe("card modal", () => {
  test("clicking a card opens its details; Escape closes it", async ({ page }) => {
    const boardPath = await openDemoBoard(page);

    await cardLink(page, DESCRIBED_CARD).click();

    const dialog = page.getByRole("dialog", { name: DESCRIBED_CARD });
    await expect(dialog).toBeVisible();
    expect(cardParam(page)).toMatch(/^[0-9a-f-]{36}$/);
    await expect(dialog).toContainText("In column To do");
    await expect(dialog.getByRole("list", { name: "Labels" })).toHaveText("backend");
    await expect(dialog.getByRole("listitem").filter({ hasText: "Bob Chen" })).toBeVisible();
    // Markdown is rendered, not shown raw.
    await expect(
      dialog.getByRole("listitem").filter({ hasText: "Per-user limit: 10 proposals / hour" }),
    ).toBeVisible();
    await expect(dialog.getByText("10 proposals / hour", { exact: true })).toHaveJSProperty(
      "tagName",
      "STRONG",
    );
    await expect(dialog).not.toContainText("**");

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === boardPath && !url.search);
  });

  test("the close button closes the modal", async ({ page }) => {
    const boardPath = await openDemoBoard(page);
    await cardLink(page, DONE_CARD).click();
    const dialog = page.getByRole("dialog", { name: DONE_CARD });
    await expect(dialog).toContainText("In column Done");

    await dialog.getByRole("button", { name: "Close" }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === boardPath && !url.search);
  });

  test("browser Back closes the modal and stays on the board", async ({ page }) => {
    const boardPath = await openDemoBoard(page);
    await cardLink(page, OVERDUE_CARD).click();
    const dialog = page.getByRole("dialog", { name: OVERDUE_CARD });
    await expect(dialog).toBeVisible();

    await page.goBack();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === boardPath && !url.search);
    await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();
  });

  test("a direct link opens the card on load; closing keeps the user on the board", async ({
    page,
  }) => {
    await openDemoBoard(page);
    const href = await cardLink(page, DESCRIBED_CARD).getAttribute("href");
    expect(href).toMatch(/^\/boards\/[0-9a-f-]{36}\?card=[0-9a-f-]{36}$/);

    // Fresh load of the shared URL (no board history entry to go back to).
    await page.goto(href!);

    const dialog = page.getByRole("dialog", { name: DESCRIBED_CARD });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("In column To do");

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === new URL(href!, url).pathname);
    expect(cardParam(page)).toBeNull();
    await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();
  });

  test("an unknown card id shows the not-found state", async ({ page }) => {
    const boardPath = await openDemoBoard(page);

    await page.goto(`${boardPath}?card=not-a-card`);

    const dialog = page.getByRole("dialog", { name: "Card not found" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("doesn't exist on this board");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(cardParam(page)).toBeNull();
    // The board rendered behind the modal (hidden from assistive tech while it was open).
    await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();
  });

  test("keyboard: Tab to a card, Enter opens it, focus returns on close", async ({ page }) => {
    await openDemoBoard(page);
    const [first, second] = DEMO_COLUMNS[0].cards;
    await cardLink(page, first).focus();

    await page.keyboard.press("Tab");
    const target = cardLink(page, second);
    await expect(target).toBeFocused();

    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: second });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(target).toBeFocused();
  });
});

test.describe("access control", () => {
  test("another user cannot see Alice's board", async ({ page, browser }) => {
    const boardPath = await openDemoBoard(page);

    // A brand-new user in a separate context. browser.newContext() inherits the
    // file's `use` options (Alice's session), so start explicitly signed out.
    const strangerContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      const stranger = await strangerContext.newPage();
      await signUpNewUser(stranger);

      await stranger.goto(boardPath);

      await expect(
        stranger.getByRole("heading", { level: 1, name: "Board not found" }),
      ).toBeVisible();
      await expect(stranger.getByText("Demo board")).toHaveCount(0);
      await expect(stranger.getByText(DEMO_COLUMNS[0].cards[0])).toHaveCount(0);
    } finally {
      await strangerContext.close();
    }
  });

  test("a malformed board id shows not found", async ({ page }) => {
    await page.goto("/boards/not-a-uuid");

    await expect(page.getByRole("heading", { level: 1, name: "Board not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "All boards" })).toBeVisible();
  });
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("follows the OS dark preference", async ({ page }) => {
    await openDemoBoard(page);

    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });
});

test.describe("light mode", () => {
  test.use({ colorScheme: "light" });

  test("follows the OS light preference", async ({ page }) => {
    await openDemoBoard(page);

    await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("columns scroll horizontally", async ({ page }) => {
    await openDemoBoard(page);

    const list = columnsList(page);
    await expect(list.getByRole("heading", { level: 2 })).toHaveCount(DEMO_COLUMNS.length);
    const { scrollWidth, clientWidth } = await list.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test("only the columns scroll sideways, not the whole page", async ({ page }) => {
    // Regression: screen-reader-only text (`sr-only`, position: absolute) inside
    // the columns used to escape the scroll container and widen the document.
    // The columns list is `relative` so it is the containing block and clips it.
    await openDemoBoard(page);
    await expect(columnsList(page).getByRole("heading", { level: 2 })).toHaveCount(
      DEMO_COLUMNS.length,
    );

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(pageOverflows).toBe(false);
  });
});
