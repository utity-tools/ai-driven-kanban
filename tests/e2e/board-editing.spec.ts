import { randomUUID } from "node:crypto";

import { test as base, expect, type Locator, type Page } from "@playwright/test";

import { ALICE_STORAGE_STATE, BOB_STORAGE_STATE } from "./support/auth";
import { trackServerActions } from "./support/server-actions";

// Creating and editing board structure (v0.1 delivery 4a).
//
// Isolation: other specs assert the seeded Demo board's exact contents, so
// every test that edits works on a fresh board of its own, created through
// the "New board" dialog and deleted through the board menu afterwards.

const DEFAULT_COLUMNS = ["To do", "In progress", "Done"];

type FreshBoard = { title: string; path: string };

function uniqueTitle(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function boardHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1 });
}

function columnsList(page: Page): Locator {
  return page.getByRole("list", { name: "Columns" });
}

function column(page: Page, title: string): Locator {
  return columnsList(page).getByRole("region", { name: title, exact: true });
}

function columnHeadings(page: Page): Locator {
  return columnsList(page).getByRole("heading", { level: 2 });
}

function cardTitles(page: Page, columnTitle: string): Locator {
  return column(page, columnTitle)
    .getByRole("list", { name: `${columnTitle} cards`, exact: true })
    .getByRole("heading", { level: 3 });
}

function cardLink(page: Page, title: string): Locator {
  return columnsList(page).getByRole("link", { name: title, exact: true });
}

/** Creates a board through the "New board" dialog; ends on the new board. */
async function createBoardViaDialog(page: Page, title: string): Promise<string> {
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
async function deleteOpenBoard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Delete board…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL("/boards");
}

/** Opens the composer of a column, adds each title with Enter, leaves the composer open. */
async function addCards(page: Page, columnTitle: string, titles: string[]): Promise<Locator> {
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

const test = base.extend<{ board: FreshBoard; boardPage: Page }>({
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
  /** The page, already on a fresh board, for tests that don't need its title or path. */
  boardPage: async ({ page, board }, provide) => {
    await expect(page).toHaveURL(board.path);
    await provide(page);
  },
});

test.use({ storageState: ALICE_STORAGE_STATE });

test.describe("new board", () => {
  test("the dialog creates a board with the default columns and opens it", async ({
    page,
    board,
  }) => {
    await expect(page).toHaveURL(board.path);
    await expect(boardHeading(page)).toHaveText(board.title);
    await expect(columnHeadings(page)).toHaveText(DEFAULT_COLUMNS);
    for (const title of DEFAULT_COLUMNS) {
      await expect(column(page, title).getByText("0 cards", { exact: true })).toBeAttached();
    }
    await expect(page.getByRole("button", { name: "Archived cards (0)" })).toBeVisible();

    await page.goto("/boards");
    await expect(page.getByRole("main").getByRole("link", { name: board.title })).toHaveAttribute(
      "href",
      board.path,
    );
  });

  test("an empty or blank title shows a validation error and creates nothing", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("button", { name: "New board" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a board" });
    const title = dialog.getByLabel("Title");
    const submit = dialog.getByRole("button", { name: "Create board" });

    await submit.click();

    await expect(dialog.getByRole("alert")).toHaveText("Enter a board title.");
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toBeFocused();
    await expect(page).toHaveURL("/boards");

    // Whitespace only is normalised to empty, too.
    await title.fill("   ");
    await submit.click();

    await expect(dialog.getByRole("alert")).toHaveText("Enter a board title.");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL("/boards");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("board title", () => {
  test("Enter saves a rename, Escape cancels one, and the rename persists", async ({
    page,
    board,
  }) => {
    const actions = trackServerActions(page);
    const renamed = uniqueTitle("Renamed board");

    await boardHeading(page).getByRole("button", { name: board.title }).click();
    const field = page.getByRole("textbox", { name: "Board title" });
    await expect(field).toBeFocused();
    await field.fill(renamed);
    await field.press("Enter");

    await expect(field).toBeHidden();
    await expect(boardHeading(page)).toHaveText(renamed);
    // Focus goes back to the title so keyboard users stay in place.
    await expect(boardHeading(page).getByRole("button", { name: renamed })).toBeFocused();

    await boardHeading(page).getByRole("button", { name: renamed }).click();
    await field.fill("This edit is discarded");
    await field.press("Escape");

    await expect(field).toBeHidden();
    await expect(boardHeading(page)).toHaveText(renamed);

    await actions.settled(1);
    await page.reload();
    await expect(boardHeading(page)).toHaveText(renamed);

    await page.goto("/boards");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: renamed })).toBeVisible();
    await expect(main.getByRole("link", { name: board.title, exact: true })).toHaveCount(0);
  });
});

test.describe("columns", () => {
  test("add, rename, and delete a column with cards after confirming", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);

    // Add a column: the field stays open (and focused) for the next one.
    await page.getByRole("button", { name: "Add column" }).click();
    const newColumn = page.getByRole("textbox", { name: "Title for a new column" });
    await newColumn.fill("Backlog");
    await newColumn.press("Enter");
    await expect(columnHeadings(page)).toHaveText([...DEFAULT_COLUMNS, "Backlog"]);
    await expect(newColumn).toBeFocused();
    await expect(newColumn).toHaveValue("");
    await newColumn.press("Escape");
    await expect(newColumn).toBeHidden();

    // Rename it inline.
    await column(page, "Backlog").getByRole("button", { name: "Backlog", exact: true }).click();
    const columnTitle = page.getByRole("textbox", { name: "Column title" });
    await columnTitle.fill("Icebox");
    await columnTitle.press("Enter");
    await expect(columnHeadings(page)).toHaveText([...DEFAULT_COLUMNS, "Icebox"]);

    // Give "To do" two cards, then delete it.
    const composer = await addCards(page, "To do", ["First doomed card", "Second doomed card"]);
    await composer.press("Escape");
    await actions.settled(4);

    await column(page, "To do").getByRole("button", { name: "Actions for column To do" }).click();
    await page.getByRole("menuitem", { name: "Delete column…" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete column “To do”?" });
    await expect(confirm).toContainText("This permanently deletes the column and its 2 cards.");
    await confirm.getByRole("button", { name: "Delete column" }).click();

    await expect(confirm).toBeHidden();
    await expect(columnHeadings(page)).toHaveText(["In progress", "Done", "Icebox"]);
    await expect(page.getByText("First doomed card")).toHaveCount(0);

    await actions.settled(5);
    await page.reload();
    await expect(columnHeadings(page)).toHaveText(["In progress", "Done", "Icebox"]);
    await expect(page.getByText("First doomed card")).toHaveCount(0);
  });

  test("cancelling the column deletion keeps the column", async ({ boardPage: page }) => {
    await column(page, "Done").getByRole("button", { name: "Actions for column Done" }).click();
    await page.getByRole("menuitem", { name: "Delete column…" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete column “Done”?" });
    await expect(confirm).toContainText("The column has no cards.");

    await confirm.getByRole("button", { name: "Cancel" }).click();

    await expect(confirm).toBeHidden();
    await expect(columnHeadings(page)).toHaveText(DEFAULT_COLUMNS);
  });
});

test.describe("card composer", () => {
  test("Enter adds cards in a row, keeping focus; order persists after reload", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const titles = ["Alpha card", "Bravo card", "Charlie card"];

    const composer = await addCards(page, "To do", titles);

    await expect(composer).toBeFocused();
    await expect(cardTitles(page, "To do")).toHaveText(titles);
    await expect(column(page, "To do").getByText("3 cards", { exact: true })).toBeAttached();

    await actions.settled(titles.length);
    await page.reload();
    await expect(cardTitles(page, "To do")).toHaveText(titles);
  });

  test("empty or blank input adds nothing; Escape closes the composer", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const todo = column(page, "To do");

    const composer = await addCards(page, "To do", []);
    await expect(composer).toBeFocused();
    await composer.press("Enter");
    await composer.fill("   \n  ");
    await todo.getByRole("button", { name: "Add card" }).click();

    await expect(composer).toBeFocused();
    await expect(todo.getByText("0 cards", { exact: true })).toBeAttached();
    await expect(todo.getByRole("listitem")).toHaveCount(0);

    await composer.press("Escape");

    await expect(composer).toBeHidden();
    await expect(todo.getByRole("button", { name: "Add a card" })).toBeFocused();

    // Nothing was sent to the server, and a reload shows nothing either.
    expect(actions.started()).toBe(0);
    await page.reload();
    await expect(columnHeadings(page)).toHaveText(DEFAULT_COLUMNS);
    await expect(todo.getByText("0 cards", { exact: true })).toBeAttached();
  });
});

test.describe("card modal editing", () => {
  test("rename the card and edit its description with Write / Preview", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const composer = await addCards(page, "To do", ["Original card title"]);
    await composer.press("Escape");
    await actions.settled(1);

    await cardLink(page, "Original card title").click();
    // While the title is being edited the dialog's name follows the field, so
    // hold on to the (only) dialog and check its name separately.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Original card title");
    await expect(dialog).toContainText("In column To do");

    // Rename.
    await dialog.getByRole("button", { name: "Original card title", exact: true }).click();
    const titleField = dialog.getByRole("textbox", { name: "Card title" });
    await expect(titleField).toBeFocused();
    await titleField.fill("Renamed card title");
    await titleField.press("Enter");
    await expect(titleField).toBeHidden();
    await expect(dialog).toHaveAccessibleName("Renamed card title");

    // Description: write Markdown, preview it, go back, save.
    await dialog.getByRole("button", { name: "Add a description" }).click();
    const editor = dialog.getByRole("textbox", { name: "Description" });
    await expect(editor).toBeFocused();
    const markdown = "Intro with **bold words**.\n\n- first point\n- second point";
    await editor.fill(markdown);

    await dialog.getByRole("tab", { name: "Preview" }).click();
    const preview = dialog.getByRole("tabpanel");
    await expect(preview.getByText("bold words", { exact: true })).toHaveJSProperty(
      "tagName",
      "STRONG",
    );
    await expect(preview.getByRole("listitem")).toHaveText(["first point", "second point"]);
    await expect(preview).not.toContainText("**");

    await dialog.getByRole("tab", { name: "Write" }).click();
    await expect(editor).toHaveValue(markdown);

    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(editor).toBeHidden();
    await expect(dialog.getByText("bold words", { exact: true })).toHaveJSProperty(
      "tagName",
      "STRONG",
    );
    await expect(dialog.getByRole("button", { name: "Edit description" })).toBeFocused();

    // Escape cancels a description edit without closing the modal.
    await dialog.getByRole("button", { name: "Edit description" }).click();
    await editor.fill("This edit is discarded");
    await editor.press("Escape");
    await expect(editor).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("This edit is discarded");

    await actions.settled(3);
    // The URL carries ?card=<id>, so the reload reopens the modal.
    await page.reload();
    await expect(dialog).toHaveAccessibleName("Renamed card title");
    await expect(dialog.getByText("bold words", { exact: true })).toHaveJSProperty(
      "tagName",
      "STRONG",
    );
    await expect(dialog.getByRole("listitem")).toHaveText(["first point", "second point"]);
    await page.keyboard.press("Escape");
    await expect(cardTitles(page, "To do")).toHaveText(["Renamed card title"]);
  });
});

test.describe("archive", () => {
  test("archive, restore, archive again, then delete permanently", async ({ boardPage: page }) => {
    const actions = trackServerActions(page);
    const target = "Card to archive";
    const composer = await addCards(page, "In progress", ["Card that stays", target]);
    await composer.press("Escape");
    await actions.settled(2);

    async function archiveFromModal(): Promise<void> {
      await cardLink(page, target).click();
      const dialog = page.getByRole("dialog", { name: target });
      await dialog.getByRole("button", { name: "Archive", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(cardLink(page, target)).toHaveCount(0);
      await expect(cardTitles(page, "In progress")).toHaveText(["Card that stays"]);
    }

    // Archive from the modal: the card leaves the column.
    await archiveFromModal();
    await actions.settled(3);

    // The Archived panel lists it with its column; Restore puts it back.
    await page.getByRole("button", { name: "Archived cards (1)" }).click();
    let panel = page.getByRole("dialog", { name: "Archived cards" });
    const item = panel.getByRole("list", { name: "Archived cards" }).getByRole("listitem");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(target);
    await expect(item).toContainText("From In progress");

    await item.getByRole("button", { name: "Restore" }).click();

    await expect(panel.getByText("No archived cards.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(cardLink(page, target)).toBeVisible();
    await expect(column(page, "In progress").getByRole("link", { name: target })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archived cards (0)" })).toBeVisible();

    await actions.settled(4);
    await page.reload();
    await expect(column(page, "In progress").getByRole("link", { name: target })).toBeVisible();

    // Archive again, then delete permanently from the panel.
    await archiveFromModal();
    await page.getByRole("button", { name: "Archived cards (1)" }).click();
    panel = page.getByRole("dialog", { name: "Archived cards" });
    await panel.getByRole("button", { name: "Delete permanently" }).click();
    const confirm = page.getByRole("alertdialog", { name: `Delete “${target}” permanently?` });
    await expect(confirm).toContainText("This can't be undone.");
    await confirm.getByRole("button", { name: "Delete permanently" }).click();

    await expect(confirm).toBeHidden();
    await expect(panel.getByText("No archived cards.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Archived cards (0)" })).toBeVisible();

    await actions.settled(6);
    await page.reload();
    await expect(cardTitles(page, "In progress")).toHaveText(["Card that stays"]);
    await expect(page.getByText(target)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archived cards (0)" })).toBeVisible();
  });
});

test.describe("delete board", () => {
  test("the board menu deletes the board after confirmation", async ({ page, board }) => {
    await page.getByRole("button", { name: "Board actions" }).click();
    await page.getByRole("menuitem", { name: "Delete board…" }).click();
    const confirm = page.getByRole("alertdialog", { name: `Delete “${board.title}”?` });
    await expect(confirm).toContainText("3 columns and 0 cards");

    // Cancelling keeps it.
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(page).toHaveURL(board.path);

    await deleteOpenBoard(page);

    // Regression: the delete used to succeed but show a generic error, because the
    // action redirected (Next surfaces that as a thrown error on the client). Success
    // and error toasts are mutually exclusive outcomes of the same call.
    await expect(page.getByText("Board deleted")).toBeVisible();
    await expect(page.getByText("Something went wrong. Please try again.")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: board.title })).toHaveCount(0);
    await page.goto(board.path);
    await expect(boardHeading(page)).toHaveText("Board not found");
  });
});

test.describe("editor permissions", () => {
  // Bob is an editor on the seeded Demo board. Read-only here: nothing is changed.
  test.use({ storageState: BOB_STORAGE_STATE });

  test("an editor gets edit controls but cannot delete the board", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("main").getByRole("link", { name: "Demo board" }).click();
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);

    await expect(boardHeading(page).getByRole("button", { name: "Demo board" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add column" })).toBeVisible();
    const todo = column(page, "To do");
    await expect(todo.getByRole("button", { name: "Add a card" })).toBeVisible();
    await expect(todo.getByRole("button", { name: "Actions for column To do" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archived cards (1)" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Board actions" })).toHaveCount(0);
    await expect(page.getByText("Delete board")).toHaveCount(0);
  });
});
