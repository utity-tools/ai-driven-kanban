import type { Browser, Locator, Page } from "@playwright/test";

import { ALICE_STORAGE_STATE, BOB_STORAGE_STATE } from "./support/auth";
import { addCards, cardLink, test as boardTest, expect } from "./support/boards";
import { trackServerActions } from "./support/server-actions";

// Card details (v0.1 delivery 4b): due date, labels, members.
//
// Isolation: every test that edits works on a fresh board (support/boards.ts);
// the seeded Demo board is only read.
//
// Time: due-date status is computed in the browser from the viewer's local
// date (ADR 0007), so the browser clock is fixed for every test here. The
// instant is in the past on purpose: nothing in the browser checks session
// expiry against it, while the server (Server Actions) keeps the real clock.
// At 2026-03-10T12:00Z it is Mar 10 in Madrid and Honolulu (UTC−10), and
// already Mar 11 in Kiritimati (UTC+14).
const NOW = new Date("2026-03-10T12:00:00Z");

const test = boardTest.extend({
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(NOW);
    await provide(page);
  },
});

test.use({ storageState: ALICE_STORAGE_STATE, timezoneId: "Europe/Madrid" });

// --- Locators ---------------------------------------------------------------

/** The card modal (its name follows the card title). */
function cardDialog(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

/**
 * A card on the board, even while the card modal is open (the board behind
 * the modal is hidden from assistive tech then, hence `includeHidden`).
 */
function cardFace(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "Columns", includeHidden: true })
    .getByRole("article", { includeHidden: true })
    .filter({
      has: page.getByRole("link", { name: title, exact: true, includeHidden: true }),
    });
}

function faceLabels(face: Locator): Locator {
  return face
    .getByRole("list", { name: "Labels", includeHidden: true })
    .getByRole("listitem", { includeHidden: true });
}

function faceAssignees(face: Locator): Locator {
  return face
    .getByRole("list", { name: "Assignees", includeHidden: true })
    .getByRole("img", { includeHidden: true });
}

/** The due badge ("Overdue: Mar 9", "Due soon: Mar 10", …); its status text is sr-only on faces. */
function dueBadge(scope: Locator, text: string): Locator {
  return scope.getByText(text, { exact: true });
}

/** Any due badge in `scope`, whatever its status. */
function anyDueBadge(scope: Locator): Locator {
  return scope.getByText(/^(Overdue|Due soon|Due|Done): /);
}

function dueDateButton(dialog: Locator): Locator {
  return dialog
    .getByRole("group", { name: "Card details" })
    .getByRole("button", { name: /^Due date/ });
}

function popover(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name, exact: true });
}

/** react-day-picker day button, e.g. "Today, Tuesday, March 10th, 2026, selected". */
function day(page: Page, name: string | RegExp): Locator {
  return popover(page, "Due date").getByRole("button", { name });
}

// --- Helpers ----------------------------------------------------------------

/**
 * Waits for the card modal to take focus when it opens (or reopens on load).
 * Until then, focusing a control inside it by hand can be undone by the
 * modal's own initial focus.
 */
async function modalReady(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)), {
      message: "waiting for the card modal to take focus",
    })
    .toBe(true);
}

/**
 * Adds cards to "To do" and waits until they are saved. Opening a card whose
 * creation is still in flight remounts the modal's content when the save
 * lands, which moves keyboard focus (reported as an app issue); these tests
 * are about card details, so they start from saved cards.
 */
async function createCards(page: Page, titles: string[]): Promise<void> {
  const actions = trackServerActions(page);
  const composer = await addCards(page, "To do", titles);
  await composer.press("Escape");
  await actions.settled(titles.length);
}

/** Adds one (saved) card to "To do" and opens its modal. */
async function createAndOpenCard(page: Page, title: string): Promise<Locator> {
  await createCards(page, [title]);
  await cardLink(page, title).click();
  const dialog = cardDialog(page, title);
  await modalReady(dialog);
  return dialog;
}

/**
 * Picks a colour in the label form with the keyboard. The radios are visually
 * hidden (the swatch is their label), so a pointer click lands on the label.
 */
async function chooseColour(form: Locator, colour: string): Promise<void> {
  const radio = form.getByRole("group", { name: "Colour" }).getByRole("radio", { name: colour });
  await radio.focus();
  await radio.press("Space");
  await expect(radio).toBeChecked();
}

/** Opens the due-date popover and picks the day named `dayName` with the mouse. */
async function pickDueDate(page: Page, dialog: Locator, dayName: string | RegExp): Promise<void> {
  await dueDateButton(dialog).click();
  await day(page, dayName).click();
  await expect(popover(page, "Due date")).toBeHidden();
}

// --- Due date -----------------------------------------------------------------

test.describe("due date", () => {
  test("set with the keyboard, shown on modal and card, persisted, changed, removed", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const title = "Card with a due date";
    const dialog = await createAndOpenCard(page, title);
    const face = cardFace(page, title);
    const trigger = dueDateButton(dialog);
    await expect(trigger).toHaveAccessibleName("Due date");
    await expect(dialog.getByRole("checkbox", { name: "Done" })).toHaveCount(0);

    // Enter opens the calendar with focus on today; arrows move, Enter picks.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(popover(page, "Due date")).toBeVisible();
    await expect(day(page, "Today, Tuesday, March 10th, 2026")).toBeFocused();
    await page.keyboard.press("ArrowDown"); // +1 week
    await expect(day(page, "Tuesday, March 17th, 2026")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(popover(page, "Due date")).toBeHidden();
    await expect(trigger).toHaveAccessibleName("Due date: Mar 17");
    await expect(trigger).toBeFocused();
    await expect(dueBadge(dialog, "Due: Mar 17")).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Done" })).not.toBeChecked();
    await expect(dueBadge(face, "Due: Mar 17")).toBeVisible();

    await actions.settled(2);
    await page.reload();
    await modalReady(dialog);
    await expect(dueBadge(dialog, "Due: Mar 17")).toBeVisible();
    await expect(dueBadge(face, "Due: Mar 17")).toBeVisible();

    // Change it: the calendar reopens on the selected day.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(day(page, "Tuesday, March 17th, 2026, selected")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(day(page, "Wednesday, March 18th, 2026")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(trigger).toHaveAccessibleName("Due date: Mar 18");
    await expect(dueBadge(dialog, "Due: Mar 18")).toBeVisible();
    await expect(dueBadge(face, "Due: Mar 18")).toBeVisible();

    // Remove it: the badge and the Done checkbox go away.
    await trigger.click();
    await popover(page, "Due date").getByRole("button", { name: "Remove" }).click();

    await expect(popover(page, "Due date")).toBeHidden();
    await expect(trigger).toHaveAccessibleName("Due date");
    await expect(anyDueBadge(dialog)).toHaveCount(0);
    await expect(dialog.getByRole("checkbox", { name: "Done" })).toHaveCount(0);
    await expect(anyDueBadge(face)).toHaveCount(0);

    await actions.settled(4);
    await page.reload();
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAccessibleName("Due date");
    await expect(anyDueBadge(dialog)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(cardLink(page, title)).toBeVisible();
    await expect(anyDueBadge(cardFace(page, title))).toHaveCount(0);
  });

  test("status follows the viewer's today: overdue, due soon, upcoming, done", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const title = "Card with a status";
    const dialog = await createAndOpenCard(page, title);
    const face = cardFace(page, title);

    // Yesterday: overdue, red, and spelled out (not colour alone).
    await pickDueDate(page, dialog, "Monday, March 9th, 2026");
    let badge = dueBadge(dialog, "Overdue: Mar 9");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("data-due-status", "overdue");
    await expect(badge).toHaveClass(/\bbg-red-100\b/);
    const faceBadge = dueBadge(face, "Overdue: Mar 9");
    await expect(faceBadge).toHaveAttribute("data-due-status", "overdue");
    await expect(faceBadge).toHaveClass(/\bbg-red-100\b/);

    // Today and tomorrow: due soon (amber).
    await pickDueDate(page, dialog, "Today, Tuesday, March 10th, 2026");
    badge = dueBadge(dialog, "Due soon: Mar 10");
    await expect(badge).toHaveAttribute("data-due-status", "due-soon");
    await expect(badge).toHaveClass(/\bbg-amber-100\b/);
    await expect(dueBadge(face, "Due soon: Mar 10")).toHaveAttribute("data-due-status", "due-soon");

    await pickDueDate(page, dialog, "Wednesday, March 11th, 2026");
    badge = dueBadge(dialog, "Due soon: Mar 11");
    await expect(badge).toHaveAttribute("data-due-status", "due-soon");
    await expect(badge).toHaveClass(/\bbg-amber-100\b/);

    // The day after tomorrow: neutral.
    await pickDueDate(page, dialog, "Thursday, March 12th, 2026");
    badge = dueBadge(dialog, "Due: Mar 12");
    await expect(badge).toHaveAttribute("data-due-status", "upcoming");
    await expect(badge).not.toHaveClass(/\b(bg-red|bg-amber|bg-green)-/);
    await expect(dueBadge(face, "Due: Mar 12")).toHaveAttribute("data-due-status", "upcoming");

    // Done wins over any date, including a past one.
    await pickDueDate(page, dialog, "Monday, March 9th, 2026");
    await expect(dueBadge(dialog, "Overdue: Mar 9")).toBeVisible();
    const done = dialog.getByRole("checkbox", { name: "Done" });
    await done.check();
    await expect(done).toBeChecked();
    badge = dueBadge(dialog, "Done: Mar 9");
    await expect(badge).toHaveAttribute("data-due-status", "done");
    await expect(badge).toHaveClass(/\bbg-green-100\b/);
    await expect(dueBadge(face, "Done: Mar 9")).toHaveAttribute("data-due-status", "done");
    await expect(face).not.toContainText("Overdue");

    await actions.settled(7);
    await page.reload();
    await expect(dueBadge(dialog, "Done: Mar 9")).toBeVisible();
    await expect(done).toBeChecked();

    // Unticking Done brings the date status back.
    await done.uncheck();
    await expect(dueBadge(dialog, "Overdue: Mar 9")).toBeVisible();
    await expect(dueBadge(face, "Overdue: Mar 9")).toBeVisible();
    await actions.settled(8);
    await page.reload();
    await expect(dueBadge(dialog, "Overdue: Mar 9")).toBeVisible();
    await expect(done).not.toBeChecked();
  });
});

// --- Time zones -----------------------------------------------------------------

test.describe("time zones", () => {
  // The board is created (and the first date picked) in Honolulu, UTC−10.
  test.use({ timezoneId: "Pacific/Honolulu" });

  /** Alice's session in another time zone, with the same fixed clock. */
  async function openIn(browser: Browser, timezoneId: string, url: string) {
    const context = await browser.newContext({ storageState: ALICE_STORAGE_STATE, timezoneId });
    const page = await context.newPage();
    await page.clock.setFixedTime(NOW);
    await page.goto(url);
    return { context, page };
  }

  test("'today' is the viewer's local date, with no off-by-one", async ({
    boardPage: page,
    browser,
  }) => {
    const actions = trackServerActions(page);
    const title = "Card across time zones";
    const dialog = await createAndOpenCard(page, title);

    // Honolulu: 02:00 on Mar 10. Pick "today" with the keyboard.
    await dueDateButton(dialog).focus();
    await page.keyboard.press("Enter");
    await expect(day(page, "Today, Tuesday, March 10th, 2026")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dueBadge(dialog, "Due soon: Mar 10")).toBeVisible();
    await expect(dueBadge(cardFace(page, title), "Due soon: Mar 10")).toBeVisible();
    await actions.settled(2);

    // Kiritimati (UTC+14), same instant: already 02:00 on Mar 11. The stored
    // date is the calendar day Mar 10, so there it is yesterday: overdue.
    const kiritimati = await openIn(browser, "Pacific/Kiritimati", page.url());
    try {
      const other = kiritimati.page;
      const otherDialog = cardDialog(other, title);
      await modalReady(otherDialog);
      await expect(dueBadge(otherDialog, "Overdue: Mar 10")).toBeVisible();
      await expect(dueBadge(cardFace(other, title), "Overdue: Mar 10")).toBeVisible();

      // Their "today" is Mar 11: picking it stores Mar 11.
      const otherActions = trackServerActions(other);
      await dueDateButton(otherDialog).focus();
      await other.keyboard.press("Enter");
      await expect(day(other, "Tuesday, March 10th, 2026, selected")).toBeFocused();
      await other.keyboard.press("ArrowRight");
      await expect(day(other, "Today, Wednesday, March 11th, 2026")).toBeFocused();
      await other.keyboard.press("Enter");
      await expect(dueBadge(otherDialog, "Due soon: Mar 11")).toBeVisible();
      await otherActions.settled(1);
      await other.reload();
      await expect(dueBadge(otherDialog, "Due soon: Mar 11")).toBeVisible();
    } finally {
      await kiritimati.context.close();
    }

    // Back in Honolulu, Mar 11 is tomorrow: still due soon, and the same day.
    await page.reload();
    await expect(dueBadge(dialog, "Due soon: Mar 11")).toBeVisible();
    await expect(dueDateButton(dialog)).toHaveAccessibleName("Due date: Mar 11");
    await dueDateButton(dialog).click();
    await expect(day(page, "Wednesday, March 11th, 2026, selected")).toBeFocused();
    await expect(day(page, "Today, Tuesday, March 10th, 2026")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

// --- Labels -------------------------------------------------------------------

test.describe("labels", () => {
  /** Creates a label from the card's Labels popover (which also attaches it), back on the list. */
  async function createLabel(
    page: Page,
    dialog: Locator,
    { name, color }: { name: string; color: string },
  ): Promise<void> {
    await dialog.getByRole("button", { name: "Labels", exact: true }).click();
    await popover(page, "Labels").getByRole("button", { name: "Create a label" }).click();
    const form = popover(page, "Create a label");
    await expect(form.getByLabel("Name")).toBeFocused();
    await form.getByLabel("Name").fill(name);
    await chooseColour(form, color);
    await form.getByRole("button", { name: "Create", exact: true }).click();
    await expect(popover(page, "Labels")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover(page, "Labels")).toBeHidden();
  }

  test("attach and detach existing labels; the card face updates at once and after reload", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    await createCards(page, ["Labelled first", "Labelled second"]);

    // A board label to work with, created on the first card.
    await cardLink(page, "Labelled first").click();
    await modalReady(cardDialog(page, "Labelled first"));
    await createLabel(page, cardDialog(page, "Labelled first"), { name: "backend", color: "Blue" });
    await page.keyboard.press("Escape");
    await expect(cardDialog(page, "Labelled first")).toBeHidden();

    const title = "Labelled second";
    await cardLink(page, title).click();
    const dialog = cardDialog(page, title);
    await modalReady(dialog);
    const face = cardFace(page, title);
    await dialog.getByRole("button", { name: "Labels", exact: true }).click();
    const picker = popover(page, "Labels");
    const backend = picker
      .getByRole("list", { name: "Board labels" })
      .getByRole("checkbox", { name: "backend" });
    await expect(backend).not.toBeChecked();

    await backend.check();
    await expect(backend).toBeChecked();
    await expect(faceLabels(face)).toHaveText(["backend"]);
    await expect(dialog.getByRole("list", { name: "Labels" })).toHaveText("backend");

    await backend.uncheck();
    await expect(backend).not.toBeChecked();
    await expect(faceLabels(face)).toHaveCount(0);
    await expect(dialog.getByRole("list", { name: "Labels" })).toHaveCount(0);

    await backend.check();
    await actions.settled(6);
    await page.reload();
    await expect(dialog.getByRole("list", { name: "Labels" })).toHaveText("backend");
    await expect(faceLabels(face)).toHaveText(["backend"]);

    await dialog.getByRole("button", { name: "Labels", exact: true }).click();
    await backend.uncheck();
    await expect(faceLabels(face)).toHaveCount(0);
    await actions.settled(7);
    await page.reload();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Labels" })).toHaveCount(0);
    await expect(faceLabels(face)).toHaveCount(0);
    // The other card keeps its label.
    await expect(faceLabels(cardFace(page, "Labelled first"))).toHaveText(["backend"]);
  });

  test("create a named label and a colour-only label; both show on the card", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const title = "Card for new labels";
    const dialog = await createAndOpenCard(page, title);
    const face = cardFace(page, title);

    await dialog.getByRole("button", { name: "Labels", exact: true }).click();
    await expect(popover(page, "Labels")).toContainText("This board has no labels yet.");
    await page.keyboard.press("Escape");

    await createLabel(page, dialog, { name: "frontend", color: "Purple" });
    await expect(faceLabels(face)).toHaveText(["frontend"]);
    await expect(faceLabels(face).getByText("frontend")).toHaveClass(/\bbg-purple-100\b/);

    // No name: the label is named after its colour for assistive tech.
    await createLabel(page, dialog, { name: "", color: "Red" });
    await expect(faceLabels(face)).toHaveCount(2);
    await expect(face.getByRole("img", { name: "Red label", includeHidden: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Red label" })).toBeVisible();

    await dialog.getByRole("button", { name: "Labels", exact: true }).click();
    const picker = popover(page, "Labels");
    await expect(picker.getByRole("checkbox", { name: "frontend" })).toBeChecked();
    await expect(picker.getByRole("checkbox", { name: "Red label" })).toBeChecked();
    await expect(picker.getByRole("button", { name: "Edit label Red label" })).toBeVisible();
    await page.keyboard.press("Escape");

    await actions.settled(3);
    await page.reload();
    await expect(dialog.getByRole("list", { name: "Labels" }).getByRole("listitem")).toHaveCount(2);
    await expect(dialog.getByText("frontend", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Red label" })).toBeVisible();
  });

  test("a blank name creates a colour-only label", async ({ boardPage: page }) => {
    // Edge case: the name field is optional; whitespace-only becomes a colour-only label.
    const title = "Card for a blank label";
    const dialog = await createAndOpenCard(page, title);
    await createLabel(page, dialog, { name: "   ", color: "Sky" });
    await expect(dialog.getByRole("img", { name: "Sky label" })).toBeVisible();
    await expect(
      cardFace(page, title).getByRole("img", { name: "Sky label", includeHidden: true }),
    ).toBeVisible();
  });

  test("edit a label's name and colour", async ({ boardPage: page }) => {
    const actions = trackServerActions(page);
    const title = "Card with an edited label";
    const dialog = await createAndOpenCard(page, title);
    const face = cardFace(page, title);
    await createLabel(page, dialog, { name: "frontend", color: "Purple" });

    await dialog.getByRole("button", { name: "Labels", exact: true }).click();
    const editButton = popover(page, "Labels").getByRole("button", {
      name: "Edit label frontend",
    });
    await editButton.click();
    const form = popover(page, "Edit label");
    const name = form.getByLabel("Name");
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("frontend");
    await expect(form.getByRole("radio", { name: "Purple" })).toBeChecked();

    await name.fill("ui");
    await chooseColour(form, "Sky");
    await form.getByRole("button", { name: "Save" }).click();

    // Back on the list, focus returns to the label's edit button.
    const picker = popover(page, "Labels");
    await expect(picker.getByRole("button", { name: "Edit label ui" })).toBeFocused();
    await expect(picker.getByRole("checkbox", { name: "ui" })).toBeChecked();
    await expect(picker.getByRole("checkbox", { name: "frontend" })).toHaveCount(0);
    await expect(faceLabels(face)).toHaveText(["ui"]);
    await expect(faceLabels(face).getByText("ui")).toHaveClass(/\bbg-sky-100\b/);
    await page.keyboard.press("Escape");

    await actions.settled(3);
    await page.reload();
    await expect(dialog.getByRole("list", { name: "Labels" })).toHaveText("ui");
    await expect(faceLabels(face)).toHaveText(["ui"]);
    await expect(faceLabels(face).getByText("ui")).toHaveClass(/\bbg-sky-100\b/);
  });

  test("delete a label after confirming how many cards it is removed from", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    await createCards(page, ["Doomed label one", "Doomed label two"]);

    // "bug" on both cards, "keep" only on the first.
    await cardLink(page, "Doomed label one").click();
    const first = cardDialog(page, "Doomed label one");
    await createLabel(page, first, { name: "bug", color: "Red" });
    await createLabel(page, first, { name: "keep", color: "Green" });
    await page.keyboard.press("Escape");
    await cardLink(page, "Doomed label two").click();
    const second = cardDialog(page, "Doomed label two");
    await second.getByRole("button", { name: "Labels", exact: true }).click();
    await popover(page, "Labels").getByRole("checkbox", { name: "bug" }).check();
    await expect(faceLabels(cardFace(page, "Doomed label two"))).toHaveText(["bug"]);

    // Delete from the edit screen; Cancel first goes back without deleting.
    await popover(page, "Labels").getByRole("button", { name: "Edit label bug" }).click();
    await popover(page, "Edit label").getByRole("button", { name: "Delete", exact: true }).click();
    let confirm = popover(page, "Delete label “bug”?");
    await expect(confirm).toContainText("This removes it from 2 cards. This can't be undone.");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(popover(page, "Edit label")).toBeVisible();
    await popover(page, "Edit label").getByRole("button", { name: "Delete", exact: true }).click();
    confirm = popover(page, "Delete label “bug”?");
    await confirm.getByRole("button", { name: "Delete label" }).click();

    const picker = popover(page, "Labels");
    await expect(picker.getByRole("button", { name: "Create a label" })).toBeFocused();
    await expect(picker.getByRole("checkbox", { name: "bug" })).toHaveCount(0);
    await expect(picker.getByRole("checkbox", { name: "keep" })).not.toBeChecked();
    await expect(faceLabels(cardFace(page, "Doomed label two"))).toHaveCount(0);
    await expect(faceLabels(cardFace(page, "Doomed label one"))).toHaveText(["keep"]);
    await page.keyboard.press("Escape");
    await expect(second.getByRole("list", { name: "Labels" })).toHaveCount(0);

    await actions.settled(6);
    await page.reload();
    await expect(second).toBeVisible();
    await expect(second.getByRole("list", { name: "Labels" })).toHaveCount(0);
    await expect(faceLabels(cardFace(page, "Doomed label one"))).toHaveText(["keep"]);
    await second.getByRole("button", { name: "Labels", exact: true }).click();
    await expect(
      popover(page, "Labels").getByRole("list", { name: "Board labels" }).getByRole("checkbox"),
    ).toHaveCount(1);
    await expect(popover(page, "Labels").getByRole("checkbox", { name: "keep" })).toBeVisible();
  });
});

// --- Members --------------------------------------------------------------------

test.describe("members", () => {
  test("assign and unassign the board owner; persisted after reload", async ({
    boardPage: page,
  }) => {
    const actions = trackServerActions(page);
    const title = "Card with an assignee";
    const dialog = await createAndOpenCard(page, title);
    const face = cardFace(page, title);
    const assignees = dialog.getByRole("heading", { name: "Assignees" });

    await dialog.getByRole("button", { name: "Members", exact: true }).click();
    const picker = popover(page, "Members");
    const alice = picker
      .getByRole("list", { name: "Board members" })
      .getByRole("checkbox", { name: "Alice Martin" });
    // A fresh board has only its owner as a member.
    await expect(picker.getByRole("checkbox")).toHaveCount(1);
    await expect(alice).not.toBeChecked();

    await alice.check();
    await expect(alice).toBeChecked();
    await expect(faceAssignees(face)).toHaveCount(1);
    await expect(
      face.getByRole("img", { name: "Alice Martin", includeHidden: true }),
    ).toBeVisible();
    await expect(assignees).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Alice Martin" })).toBeVisible();

    await page.keyboard.press("Escape");
    await actions.settled(2);
    await page.reload();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Alice Martin" })).toBeVisible();
    await expect(
      face.getByRole("img", { name: "Alice Martin", includeHidden: true }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Members", exact: true }).click();
    await expect(alice).toBeChecked();
    await alice.uncheck();
    await expect(alice).not.toBeChecked();
    await expect(faceAssignees(face)).toHaveCount(0);
    await expect(assignees).toHaveCount(0);

    await page.keyboard.press("Escape");
    await actions.settled(3);
    await page.reload();
    await expect(dialog).toBeVisible();
    await expect(assignees).toHaveCount(0);
    await expect(faceAssignees(face)).toHaveCount(0);
  });
});

// --- Keyboard and focus ---------------------------------------------------------

test.describe("keyboard and focus", () => {
  test("Escape closes a popover, not the modal, and focus returns to its trigger", async ({
    boardPage: page,
  }) => {
    const dialog = await createAndOpenCard(page, "Card for popovers");
    const actions = dialog.getByRole("group", { name: "Card details" });

    for (const name of ["Labels", "Members", "Due date"]) {
      const trigger = actions.getByRole("button", { name, exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const pop = popover(page, name);
      await expect(pop).toBeVisible();
      // Focus is inside the popover.
      await expect(pop.locator(":focus")).toHaveCount(1);

      await page.keyboard.press("Escape");

      await expect(pop).toBeHidden();
      await expect(dialog).toBeVisible();
      await expect(trigger).toBeFocused();
    }

    // A nested screen (create label) also closes on Escape, back to the trigger.
    const labels = actions.getByRole("button", { name: "Labels", exact: true });
    await labels.click();
    await popover(page, "Labels").getByRole("button", { name: "Create a label" }).click();
    await expect(popover(page, "Create a label").getByLabel("Name")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(popover(page, "Create a label")).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(labels).toBeFocused();

    // With no popover open, Escape closes the modal as before.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

// --- Permissions ----------------------------------------------------------------

test.describe("permissions", () => {
  // Bob is an editor on the seeded Demo board. Read-only here: nothing is changed.
  test.use({ storageState: BOB_STORAGE_STATE });

  test("an editor gets the Labels, Members and Due date buttons", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("main").getByRole("link", { name: "Demo board" }).click();
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);

    const title = "Card order resets after refreshing the page";
    await cardLink(page, title).click();
    const dialog = cardDialog(page, title);
    const actions = dialog.getByRole("group", { name: "Card details" });
    await expect(actions.getByRole("button", { name: "Labels", exact: true })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Members", exact: true })).toBeVisible();
    // The seeded card has a due date, so the button names it.
    await expect(actions.getByRole("button", { name: /^Due date: \w{3} \d{1,2}/ })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Done" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
