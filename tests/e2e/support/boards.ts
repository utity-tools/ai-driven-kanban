import { randomUUID } from "node:crypto";

import { test as base, expect, type Locator, type Page } from "@playwright/test";

import { createBoardAs, deleteBoardAs } from "./api";
import { ACTION } from "./server-actions";

// Fresh-board fixture and board locators shared by the specs that edit boards.
//
// Isolation: other specs assert the seeded Demo board's exact contents, so
// every test that edits works on a fresh board of its own, created and deleted
// through the API by the `board` fixture below.

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
  await expect(page).toHaveURL("/boards", ACTION);
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
 * `board`: a fresh board created before the test and deleted after it, unless the
 * test deleted it itself. `boardPage`: the page, already on that board, for tests
 * that don't need its title or path.
 *
 * Setup and teardown go through the API as the test's signed-in user (support/api.ts):
 * the UI paths are covered by the specs that test them, and going through them here
 * only made every test wait on a Server Action and a redirect. The page is left on
 * the board, as it would be after creating it in the dialog.
 */
export const test = base.extend<{ board: FreshBoard; boardPage: Page }>({
  board: async ({ page, storageState }, provide) => {
    if (typeof storageState !== "string") {
      throw new Error("The board fixture needs a storageState file, e.g. ALICE_STORAGE_STATE.");
    }
    const title = uniqueTitle("E2E board");
    const boardId = await createBoardAs(storageState, title);
    const path = `/boards/${boardId}`;
    // `finally`: a failure in the test or in the goto still removes the board.
    try {
      await page.goto(path);
      await expect(boardHeading(page)).toHaveText(title);

      await provide({ title, path });
    } finally {
      await deleteBoardAs(storageState, boardId);
    }
  },
  boardPage: async ({ page, board }, provide) => {
    await expect(page).toHaveURL(board.path);
    await provide(page);
  },
});

export { expect };
