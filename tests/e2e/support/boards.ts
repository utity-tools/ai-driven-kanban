import { randomUUID } from "node:crypto";

import { test as base, expect, type Locator, type Page } from "@playwright/test";

// Fresh-board fixture and board locators shared by the specs that edit boards.
//
// Isolation: other specs assert the seeded Demo board's exact contents, so
// every test that edits works on a fresh board of its own, created through
// the "New board" dialog and deleted through the board menu afterwards.

export const DEFAULT_COLUMNS = ["To do", "In progress", "Done"];

export type FreshBoard = { title: string; path: string };

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

export function boardHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1 });
}

export function columnsList(page: Page): Locator {
  return page.getByRole("list", { name: "Columns" });
}

export function column(page: Page, title: string): Locator {
  return columnsList(page).getByRole("region", { name: title, exact: true });
}

export function columnHeadings(page: Page): Locator {
  return columnsList(page).getByRole("heading", { level: 2 });
}

export function cardTitles(page: Page, columnTitle: string): Locator {
  return column(page, columnTitle)
    .getByRole("list", { name: `${columnTitle} cards`, exact: true })
    .getByRole("heading", { level: 3 });
}

export function cardLink(page: Page, title: string): Locator {
  return columnsList(page).getByRole("link", { name: title, exact: true });
}

/** Creates a board through the "New board" dialog; ends on the new board. */
export async function createBoardViaDialog(page: Page, title: string): Promise<string> {
  await page.goto("/boards");
  await page.getByRole("button", { name: "New board" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a board" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(boardHeading(page)).toHaveText(title);
  return new URL(page.url()).pathname;
}

/** Deletes the board open on `page` through the board menu and its confirmation. */
export async function deleteOpenBoard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Delete board…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL("/boards");
}

/** Opens the composer of a column, adds each title with Enter, leaves the composer open. */
export async function addCards(
  page: Page,
  columnTitle: string,
  titles: string[],
): Promise<Locator> {
  await column(page, columnTitle).getByRole("button", { name: "Add a card" }).click();
  const composer = page.getByRole("textbox", {
    name: `Title for a new card in ${columnTitle}`,
  });
  for (const title of titles) {
    await composer.fill(title);
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
  }
  return composer;
}

/**
 * `board`: a fresh board created (as the signed-in user) before the test and
 * deleted after it, unless the test deleted it itself. `boardPage`: the page,
 * already on that board, for tests that don't need its title or path.
 */
export const test = base.extend<{ board: FreshBoard; boardPage: Page }>({
  board: async ({ page }, provide) => {
    const title = uniqueTitle("E2E board");
    const path = await createBoardViaDialog(page, title);

    await provide({ title, path });

    // Clean up unless the test deleted the board itself.
    await page.goto(path);
    await expect(boardHeading(page)).toBeVisible();
    if (await page.getByRole("button", { name: "Board actions" }).isVisible()) {
      await deleteOpenBoard(page);
    }
  },
  boardPage: async ({ page, board }, provide) => {
    await expect(page).toHaveURL(board.path);
    await provide(page);
  },
});

export { expect };
