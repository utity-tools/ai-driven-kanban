import type { Locator, Page } from "@playwright/test";

import { ALICE_STORAGE_STATE } from "./support/auth";
import { addCards, cardLink, test, expect } from "./support/boards";
import { trackServerActions } from "./support/server-actions";

// Subtasks (v0.2 delivery 2): the checklist inside the card modal, and its
// count on the card face.
//
// Isolation: every test works on a fresh board (support/boards.ts). Nothing
// here involves AI: subtasks are typed by the user (source 'manual').

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

function subtaskList(dialog: Locator): Locator {
  return dialog.getByRole("list", { name: "Subtasks", exact: true });
}

/** The subtasks' titles in order (each checkbox is named after its subtask). */
function subtaskTitles(dialog: Locator): Promise<string[]> {
  return subtaskList(dialog)
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label") ?? ""));
}

function composerField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "New subtask title" });
}

// --- Helpers ----------------------------------------------------------------

/** Waits for the modal to take focus (see card-details.spec.ts). */
async function modalReady(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
}

/** Adds one card to "To do", waits until it is saved, and opens its modal. */
async function createAndOpenCard(page: Page, title: string): Promise<Locator> {
  const actions = trackServerActions(page);
  const composer = await addCards(page, "To do", [title]);
  await composer.press("Escape");
  await actions.settled(1);
  await cardLink(page, title).click();
  const dialog = cardDialog(page, title);
  await modalReady(dialog);
  return dialog;
}

/** Opens the composer, adds each title with Enter, closes it with Escape. */
async function addSubtasks(dialog: Locator, titles: string[]): Promise<void> {
  await dialog.getByRole("button", { name: "Add a subtask" }).click();
  const field = composerField(dialog);
  for (const title of titles) {
    await field.fill(title);
    await field.press("Enter");
    await expect(field).toHaveValue("");
  }
  await field.press("Escape");
  await expect(field).toBeHidden();
}

// --- Tests --------------------------------------------------------------------

test("add, rename, estimate, complete and delete subtasks; progress and card badge", async ({
  boardPage: page,
}) => {
  const card = "Card with a checklist";
  const dialog = await createAndOpenCard(page, card);
  const actions = trackServerActions(page);
  const face = cardFace(page, card);

  // No badge before there are subtasks.
  await expect(face.getByText(/^\d+\/\d+$/)).toHaveCount(0);

  // Add three; Escape closes the composer but not the modal.
  await addSubtasks(dialog, ["Write the schema", "Build the UI", "Tpyo here"]);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add a subtask" })).toBeFocused();
  await expect
    .poll(() => subtaskTitles(dialog))
    .toEqual(["Write the schema", "Build the UI", "Tpyo here"]);
  await expect(dialog.getByText("0/3", { exact: true })).toBeVisible();
  await expect(face.getByText("0/3", { exact: true })).toBeVisible();

  // Rename with the inline editor.
  await subtaskList(dialog).getByRole("button", { name: "Tpyo here", exact: true }).click();
  const titleField = dialog.getByRole("textbox", { name: "Subtask title" });
  await titleField.fill("Write the tests");
  await titleField.press("Enter");
  await expect
    .poll(() => subtaskTitles(dialog))
    .toEqual(["Write the schema", "Build the UI", "Write the tests"]);

  // Estimate two of them.
  await dialog.getByRole("button", { name: "Estimate for Write the schema: none" }).click();
  await page.getByRole("menuitemradio", { name: "3 pts", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Estimate for Write the schema: 3 points" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Estimate for Build the UI: none" }).click();
  await page.getByRole("menuitemradio", { name: "5 pts", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Estimate for Build the UI: 5 points" }),
  ).toBeVisible();
  await expect(dialog.getByText("0/3 · 0 of 8 pts", { exact: true })).toBeVisible();

  // Complete one: progress and the card-face badge follow.
  const schemaBox = subtaskList(dialog).getByRole("checkbox", { name: "Write the schema" });
  await schemaBox.click();
  await expect(schemaBox).toBeChecked();
  await expect(dialog.getByText("1/3 · 3 of 8 pts", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("progressbar", { name: "Subtask progress" })).toHaveAttribute(
    "aria-valuetext",
    "1 of 3 subtasks done. 3 of 8 story points done, 5 remaining.",
  );
  await expect(face.getByText("1/3", { exact: true })).toBeVisible();

  // Delete one; focus moves to its neighbour.
  await dialog.getByRole("button", { name: "Delete subtask Build the UI" }).click();
  await expect.poll(() => subtaskTitles(dialog)).toEqual(["Write the schema", "Write the tests"]);
  await expect(
    subtaskList(dialog).getByRole("checkbox", { name: "Write the tests" }),
  ).toBeFocused();
  await expect(dialog.getByText("1/2 · 3 of 3 pts", { exact: true })).toBeVisible();
  await expect(face.getByText("1/2", { exact: true })).toBeVisible();

  // Everything was saved: 3 adds, rename, 2 estimates, complete, delete.
  await actions.settled(8);
  await page.reload();
  const reopened = cardDialog(page, card);
  await modalReady(reopened);
  await expect.poll(() => subtaskTitles(reopened)).toEqual(["Write the schema", "Write the tests"]);
  await expect(
    subtaskList(reopened).getByRole("checkbox", { name: "Write the schema" }),
  ).toBeChecked();
  await expect(
    subtaskList(reopened).getByRole("checkbox", { name: "Write the tests" }),
  ).not.toBeChecked();
  await expect(
    reopened.getByRole("button", { name: "Estimate for Write the tests: none" }),
  ).toBeVisible();
  await expect(reopened.getByText("1/2 · 3 of 3 pts", { exact: true })).toBeVisible();
  // Typed subtasks carry no AI marker.
  await expect(reopened.getByText("Proposed by AI")).toHaveCount(0);

  await reopened.getByRole("button", { name: "Close" }).click();
  await expect(reopened).toBeHidden();
  await expect(cardFace(page, card).getByText("1/2", { exact: true })).toBeVisible();
  await expect(
    cardFace(page, card).getByText("Subtasks: 1 of 2 done", { exact: true }),
  ).toBeAttached();
});

test("reorder subtasks with the keyboard from the grip button", async ({ boardPage: page }) => {
  const card = "Card to reorder";
  const dialog = await createAndOpenCard(page, card);
  const actions = trackServerActions(page);
  await addSubtasks(dialog, ["First", "Second", "Third"]);
  await actions.settled(3);

  // Arrows move one place at a time; focus stays on the grip.
  const grip = dialog.getByRole("button", { name: "Move subtask First" });
  await grip.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => subtaskTitles(dialog)).toEqual(["Second", "First", "Third"]);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => subtaskTitles(dialog)).toEqual(["Second", "Third", "First"]);
  await expect(grip).toBeFocused();
  await expect(dialog.getByRole("status").filter({ hasText: "Subtask First" })).toHaveText(
    "Subtask First is now in position 3 of 3.",
  );
  // Past the end: nothing happens, and the modal stays open.
  await page.keyboard.press("ArrowDown");
  await expect(dialog).toBeVisible();

  // Home jumps to the top.
  await dialog.getByRole("button", { name: "Move subtask Third" }).focus();
  await page.keyboard.press("Home");
  await expect.poll(() => subtaskTitles(dialog)).toEqual(["Third", "Second", "First"]);

  await actions.settled(6);
  expect(actions.started()).toBe(6);
  await page.reload();
  const reopened = cardDialog(page, card);
  await modalReady(reopened);
  await expect.poll(() => subtaskTitles(reopened)).toEqual(["Third", "Second", "First"]);
});

test("reorder subtasks by dragging the grip with the mouse", async ({ boardPage: page }) => {
  const card = "Card to drag";
  const dialog = await createAndOpenCard(page, card);
  const actions = trackServerActions(page);
  await addSubtasks(dialog, ["One", "Two", "Three"]);
  await actions.settled(3);

  const from = await dialog.getByRole("button", { name: "Move subtask One" }).boundingBox();
  const to = await subtaskList(dialog).getByRole("listitem").nth(2).boundingBox();
  if (!from || !to) throw new Error("missing bounding boxes");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Past the 5px activation distance, then in small steps to below "Three"'s centre.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 2 });
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => subtaskTitles(dialog)).toEqual(["Two", "Three", "One"]);
  await expect(dialog).toBeVisible();
  await actions.settled(4);
  await page.reload();
  const reopened = cardDialog(page, card);
  await modalReady(reopened);
  await expect.poll(() => subtaskTitles(reopened)).toEqual(["Two", "Three", "One"]);
});
