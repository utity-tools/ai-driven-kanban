import type { BrowserContext, Locator, Page } from "@playwright/test";

import { BOB_STORAGE_STATE } from "./auth";
import { boardHeading, expect, test as boardsTest } from "./boards";

// Members dialog, invite links and multi-user sessions shared by the specs that
// need a second signed-in person on a fresh board.

export const TOKEN = /\/invite\/[A-Za-z0-9_-]{43}$/;

export type OpenSession = (storageState?: string) => Promise<Page>;

/** `session` opens a page in a browser context of its own (signed in with `storageState`, or signed out); all are closed after the test. */
export const test = boardsTest.extend<{ session: OpenSession }>({
  session: async ({ browser, baseURL }, provide) => {
    const contexts: BrowserContext[] = [];
    await provide(async (storageState) => {
      const context = await browser.newContext({ baseURL, storageState });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export function membersDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Board members" });
}

export async function openMembers(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Members", exact: true }).click();
  const dialog = membersDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Creates an invite link in the open Members dialog and returns its URL. */
export async function createInviteLink(
  dialog: Locator,
  role?: "Editor" | "Viewer",
): Promise<string> {
  if (role && role !== "Editor") {
    await dialog.getByRole("combobox", { name: "Invite role" }).click();
    await dialog.page().getByRole("option", { name: role }).click();
  }
  await dialog.getByRole("button", { name: "Create invite link" }).click();
  const input = dialog.getByLabel("Invite link");
  await expect(input).toHaveValue(TOKEN);
  return input.inputValue();
}

export function memberRow(dialog: Locator, name: string): Locator {
  return dialog
    .getByRole("list", { name: "People with access" })
    .getByRole("listitem")
    .filter({ hasText: name });
}

/** Opens the invite link as Bob, joins, and ends on the board. Returns Bob's page. */
export async function joinAsBob(
  session: OpenSession,
  link: string,
  board: { title: string; path: string },
): Promise<Page> {
  const page = await session(BOB_STORAGE_STATE);
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    `invited you to join ${board.title} as`,
  );
  await page.getByRole("button", { name: "Join board" }).click();
  await expect(page).toHaveURL(board.path);
  await expect(boardHeading(page)).toHaveText(board.title);
  return page;
}
