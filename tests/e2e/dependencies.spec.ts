import type { Locator, Page } from "@playwright/test";

import { ALICE_STORAGE_STATE } from "./support/auth";
import { addCards, cardLink, column, expect, test } from "./support/boards";
import { pickUpWithKeyboard } from "./support/dnd";
import { trackServerActions } from "./support/server-actions";

// Card dependencies (v0.3): the modal's "Blocked by" / "Blocks" lists, the
// blocker picker, the "Blocked by N cards" badge, done columns and the
// Bottlenecks panel.
//
// Isolation: every test works on a fresh board (support/boards.ts).
//
// Not covered: viewers seeing the lists read-only. The seed has only the owner
// (Alice) and an editor (Bob), and the app cannot add a viewer yet.

test.use({ storageState: ALICE_STORAGE_STATE });

// --- Locators ---------------------------------------------------------------

function cardDialog(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

/** A card on the board, even while the modal hides the board from assistive tech. */
function cardFace(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "Columns", includeHidden: true })
    .getByRole("article", { includeHidden: true })
    .filter({
      has: page.getByRole("link", { name: title, exact: true, includeHidden: true }),
    });
}

function blockedByBadge(page: Page, title: string, text: string): Locator {
  return cardFace(page, title).getByText(text, { exact: true });
}

function depList(dialog: Locator, name: "Blocked by" | "Blocks"): Locator {
  return dialog.getByRole("list", { name, exact: true });
}

function bottlenecksList(page: Page): Locator {
  return page.getByRole("list", { name: "Bottlenecks", exact: true });
}

// --- Helpers ----------------------------------------------------------------

/** Waits for the modal to take focus (see card-details.spec.ts). */
async function modalReady(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
}

async function openCard(page: Page, title: string): Promise<Locator> {
  await cardLink(page, title).click();
  const dialog = cardDialog(page, title);
  await modalReady(dialog);
  return dialog;
}

async function closeCard(dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
}

/** Adds the cards to "To do" and waits until the server has them. */
async function seedCards(page: Page, titles: string[]): Promise<void> {
  const actions = trackServerActions(page);
  const composer = await addCards(page, "To do", titles);
  await composer.press("Escape");
  await actions.settled(titles.length);
}

/** In the open modal of the blocked card, picks `blocker` in "Add blocker". */
async function addBlocker(page: Page, dialog: Locator, blocker: string): Promise<void> {
  await dialog.getByRole("button", { name: "Add blocker" }).click();
  await page
    .getByRole("list", { name: "Cards that can block this one" })
    .getByRole("button", { name: `${blocker} To do`, exact: true })
    .click();
  await expect(
    depList(dialog, "Blocked by").getByRole("link", { name: blocker, exact: true }),
  ).toBeVisible();
}

/** Blocker -> Blocked, created through the UI; ends with the modal closed. */
async function seedDependency(page: Page, blocker: string, blocked: string): Promise<void> {
  await seedCards(page, [blocker, blocked]);
  const actions = trackServerActions(page);
  const dialog = await openCard(page, blocked);
  await addBlocker(page, dialog, blocker);
  await actions.settled(1);
  await closeCard(dialog);
}

/** The blocker row is resolved: no "Pending", and its status reads `status`. */
async function expectResolved(dialog: Locator, status = "Done"): Promise<void> {
  const row = depList(dialog, "Blocked by").getByRole("listitem");
  await expect(row.getByText("Pending", { exact: true })).toHaveCount(0);
  await expect(row.locator("[data-resolved=true]")).toHaveText(status);
}

// --- Tests --------------------------------------------------------------------

test("add a blocker: lists, badge and bottlenecks on both cards, saved after a reload", async ({
  boardPage: page,
}) => {
  const blocker = "Set up the database";
  const blocked = "Build the API";
  await seedCards(page, [blocker, blocked]);

  await expect(page.getByRole("button", { name: "Bottlenecks" })).toHaveCount(0);

  const actions = trackServerActions(page);
  const dialog = await openCard(page, blocked);
  await expect(dialog.getByText("No card blocks this one.")).toBeVisible();
  await addBlocker(page, dialog, blocker);

  const item = depList(dialog, "Blocked by").getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item.getByText("To do", { exact: true })).toBeVisible();
  await expect(item.getByText("Pending", { exact: true })).toBeVisible();
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toBeAttached();
  await actions.settled(1);

  // From the blocker's side: it blocks the other card.
  await depList(dialog, "Blocked by").getByRole("link", { name: blocker, exact: true }).click();
  const blockerDialog = cardDialog(page, blocker);
  await modalReady(blockerDialog);
  await expect(
    depList(blockerDialog, "Blocks").getByRole("link", { name: blocked, exact: true }),
  ).toBeVisible();
  // Opened from a link inside the modal, so closing goes Back to the first card.
  await closeCard(blockerDialog);
  await modalReady(dialog);
  await closeCard(dialog);

  await page.getByRole("button", { name: "Bottlenecks" }).click();
  const entry = bottlenecksList(page).getByRole("listitem").filter({ hasText: blocker });
  await expect(entry.getByText("Holds up 1 card", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toBeAttached();
  await expect(blockedByBadge(page, blocker, "Blocked by 1 card")).toHaveCount(0);
  await page.getByRole("button", { name: "Bottlenecks" }).click();
  await expect(
    bottlenecksList(page)
      .getByRole("listitem")
      .filter({ hasText: blocker })
      .getByText("Holds up 1 card", { exact: true }),
  ).toBeVisible();
});

test("a card that would close a cycle is not offered as a blocker", async ({ boardPage: page }) => {
  const a = "Card A";
  const b = "Card B";
  // A blocks B, so B can no longer block A.
  await seedDependency(page, a, b);

  const dialog = await openCard(page, a);
  await dialog.getByRole("button", { name: "Add blocker" }).click();
  await expect(page.getByText("No other cards can block this one.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Cards that can block this one" })).toHaveCount(0);

  // B, in turn, has no candidate left either (A is already its blocker).
  await page.keyboard.press("Escape");
  await closeCard(dialog);
  const bDialog = await openCard(page, b);
  await bDialog.getByRole("button", { name: "Add blocker" }).click();
  await expect(page.getByText("No other cards can block this one.")).toBeVisible();
});

test("the search narrows the blocker candidates", async ({ boardPage: page }) => {
  await seedCards(page, ["Alpha task", "Bravo task", "Charlie task"]);
  const dialog = await openCard(page, "Alpha task");
  await dialog.getByRole("button", { name: "Add blocker" }).click();

  const candidates = page.getByRole("list", { name: "Cards that can block this one" });
  await expect(candidates.getByRole("button")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search cards" }).fill("brav");
  await expect(page.getByRole("status").filter({ hasText: "found" })).toHaveText("1 card found");
  await expect(candidates.getByRole("button")).toHaveCount(1);
  await expect(
    candidates.getByRole("button", { name: "Bravo task To do", exact: true }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: "Search cards" }).fill("zzz");
  await expect(page.getByText("No cards match “zzz”.")).toBeVisible();
});

test("a blocker in a done column no longer blocks; unmarking the column restores it", async ({
  boardPage: page,
}) => {
  const blocker = "Design the schema";
  const blocked = "Write the migration";
  await seedDependency(page, blocker, blocked);
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toBeAttached();

  const actions = trackServerActions(page);
  await column(page, "To do").getByRole("button", { name: "Actions for column To do" }).click();
  await page.getByRole("menuitem", { name: "Mark as done column" }).click();
  await expect(column(page, "To do").getByText("Done column")).toBeAttached();
  await actions.settled(1);
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bottlenecks" })).toHaveCount(0);

  const dialog = await openCard(page, blocked);
  await expectResolved(dialog);
  await closeCard(dialog);

  await column(page, "To do").getByRole("button", { name: "Actions for column To do" }).click();
  await page.getByRole("menuitem", { name: "Unmark as done column" }).click();
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toBeAttached();

  await actions.settled(2);
  await page.reload();
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toBeAttached();
});

test("moving the blocker into the Done column resolves the dependency", async ({
  boardPage: page,
}) => {
  const blocker = "Ship the schema";
  const blocked = "Ship the API";
  await seedDependency(page, blocker, blocked);
  const actions = trackServerActions(page);

  await pickUpWithKeyboard(page, cardLink(page, blocker));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[id^=DndLiveRegion]")).toContainText(
    `Card ${blocker} is now in column Done`,
  );
  await page.keyboard.press("Space");

  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toHaveCount(0);
  await actions.settled(1);
  await page.reload();
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toHaveCount(0);
  const dialog = await openCard(page, blocked);
  await expectResolved(dialog);
});

test("removing a dependency clears both lists and the badge, saved after a reload", async ({
  boardPage: page,
}) => {
  const blocker = "Pick a framework";
  const blocked = "Scaffold the app";
  await seedDependency(page, blocker, blocked);

  const actions = trackServerActions(page);
  const dialog = await openCard(page, blocked);
  await dialog.getByRole("button", { name: `Remove dependency on ${blocker}` }).click();

  await expect(dialog.getByText("No card blocks this one.")).toBeVisible();
  await expect(depList(dialog, "Blocked by")).toHaveCount(0);
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toHaveCount(0);
  await actions.settled(1);
  await closeCard(dialog);
  await expect(page.getByRole("button", { name: "Bottlenecks" })).toHaveCount(0);

  await page.reload();
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toHaveCount(0);
  const reopened = await openCard(page, blocker);
  await expect(reopened.getByText("This card doesn't block any other card.")).toBeVisible();
});

test("archiving the blocker resolves the dependency, saved after a reload", async ({
  boardPage: page,
}) => {
  const blocker = "Retire the old API";
  const blocked = "Cut over the clients";
  await seedDependency(page, blocker, blocked);
  await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toBeAttached();
  await expect(page.getByRole("button", { name: "Bottlenecks" })).toBeVisible();

  const actions = trackServerActions(page);
  const blockerDialog = await openCard(page, blocker);
  await blockerDialog.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(blockerDialog).toBeHidden();
  await expect(cardLink(page, blocker)).toHaveCount(0);
  await actions.settled(1);

  async function expectArchivedBlocker(): Promise<void> {
    await expect(blockedByBadge(page, blocked, "Blocked by 1 card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bottlenecks" })).toHaveCount(0);
    const dialog = await openCard(page, blocked);
    await expectResolved(dialog, "Archived");
    await expect(
      depList(dialog, "Blocked by").getByRole("listitem").locator("[data-state=archived]"),
    ).toHaveCount(1);
    await closeCard(dialog);
  }

  await expectArchivedBlocker();
  await page.reload();
  await expectArchivedBlocker();
});
