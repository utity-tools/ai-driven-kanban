import type { Locator, Page, Route } from "@playwright/test";

import { ALICE_STORAGE_STATE } from "./support/auth";
import { addCards, cardLink, expect, test } from "./support/boards";
import { trackServerActions } from "./support/server-actions";

// AI blocker suggestions (v0.3 delivery 5): "Suggest blockers with AI" in the
// card modal streams a proposal of the cards that block the open card, the user
// reviews it, and only what they keep is saved (source = 'ai').
//
// The model is never reached: the suggest route is mocked in the browser. The
// mock builds the X-Candidate-Ids header and the "c1", "c2"... references
// together from card ids read off the board, so it doesn't depend on the
// server's candidate order. Saving is real: the acceptAiDependencies Server
// Action and the accept_ai_dependencies RPC run against the local database.
//
// Isolation: every test works on a fresh board (support/boards.ts).
//
// Not covered: a viewer not seeing the button (the app cannot add a viewer yet;
// see dependencies.spec.ts), and the server-side candidate order (unit tests).

test.use({ storageState: ALICE_STORAGE_STATE });

const SUGGEST_ROUTE = "**/api/cards/*/dependencies/suggest";
const TARGET = "Ship the feature";
const A = "Set up the database";
const B = "Build the API";
const C = "Write the docs";

// --- Locators ---------------------------------------------------------------

function cardDialog(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

function suggestButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Suggest blockers with AI" });
}

function panel(dialog: Locator): Locator {
  return dialog.getByRole("region", { name: "AI blocker suggestions" });
}

function suggestedList(dialog: Locator): Locator {
  return panel(dialog).getByRole("list", { name: "Suggested blockers" });
}

function depList(dialog: Locator, name: "Blocked by" | "Blocks"): Locator {
  return dialog.getByRole("list", { name, exact: true });
}

function aiBadge(scope: Locator): Locator {
  return scope.getByText("Suggested by AI", { exact: true });
}

/** A row of "Blocked by" / "Blocks", by the link to its card. */
function depRow(dialog: Locator, name: "Blocked by" | "Blocks", title: string): Locator {
  return depList(dialog, name)
    .getByRole("listitem")
    .filter({ has: dialog.page().getByRole("link", { name: title, exact: true }) });
}

// --- Helpers ----------------------------------------------------------------

/** Waits for the modal to take focus (see card-details.spec.ts). */
async function modalReady(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
}

/** Adds the cards to "To do", waits until the server has them, and opens `open`. */
async function seedAndOpen(page: Page, titles: string[], open: string): Promise<Locator> {
  const actions = trackServerActions(page);
  const composer = await addCards(page, "To do", titles);
  await composer.press("Escape");
  await actions.settled(titles.length);
  await cardLink(page, open).click();
  const dialog = cardDialog(page, open);
  await modalReady(dialog);
  return dialog;
}

/**
 * The id of a card on the board, from its link (`?card=<id>`). The open modal
 * hides the board from assistive tech, hence `includeHidden`.
 */
async function cardId(page: Page, title: string): Promise<string> {
  const href = await page
    .getByRole("list", { name: "Columns", includeHidden: true })
    .getByRole("link", { name: title, exact: true, includeHidden: true })
    .getAttribute("href");
  const id = new URL(href ?? "", page.url()).searchParams.get("card");
  if (!id) throw new Error(`No card id in the link of "${title}"`);
  return id;
}

/**
 * Mocks the suggest route. `ids` are the candidates in the order the mock
 * "shows the model" (ref cN is the Nth); `pick` builds the proposal from them.
 */
async function mockSuggestions(
  page: Page,
  titles: string[],
  respond: (ref: (title: string) => string) => unknown,
  quotaRemaining = 5,
): Promise<{ calls: () => number }> {
  const ids = await Promise.all(titles.map((title) => cardId(page, title)));
  const ref = (title: string) => `c${titles.indexOf(title) + 1}`;
  let calls = 0;
  await page.route(SUGGEST_ROUTE, (route: Route) => {
    calls += 1;
    return route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      headers: {
        "X-Candidate-Ids": ids.join(","),
        "X-Quota-Remaining": String(quotaRemaining),
      },
      body: JSON.stringify(respond(ref)),
    });
  });
  return { calls: () => calls };
}

// --- Tests --------------------------------------------------------------------

test("review an AI proposal: uncheck one, add the rest, marked as AI and saved after a reload", async ({
  boardPage: page,
}) => {
  const dialog = await seedAndOpen(page, [TARGET, A, B, C], TARGET);
  const mock = await mockSuggestions(page, [A, B, C], (ref) => ({
    dependencies: [
      { blocker: ref(A), rationale: "The API needs a schema first." },
      { blocker: ref(B), rationale: "The feature calls the API." },
      { blocker: ref(C), rationale: "Docs can wait for the release." },
    ],
  }));

  await suggestButton(dialog).click();

  const list = suggestedList(dialog);
  await expect(list.getByRole("listitem")).toHaveCount(3);
  expect(mock.calls()).toBe(1);
  await expect(suggestButton(dialog)).toBeHidden();
  for (const title of [A, B, C]) {
    await expect(
      list.getByRole("checkbox", { name: `Include ${title} as a blocker` }),
    ).toBeChecked();
  }
  await expect(list.getByText("The API needs a schema first.")).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: "suggested" })).toHaveText(
    "3 blockers suggested. Review them before adding.",
  );
  await expect(panel(dialog).getByRole("button", { name: "Add 3 blockers" })).toBeEnabled();

  // Nothing is saved until the user confirms.
  await expect(depList(dialog, "Blocked by").getByRole("listitem")).toHaveCount(0);

  await list.getByRole("checkbox", { name: `Include ${C} as a blocker` }).click();
  await expect(list.getByRole("checkbox", { name: `Include ${C} as a blocker` })).not.toBeChecked();

  const actions = trackServerActions(page);
  await panel(dialog).getByRole("button", { name: "Add 2 blockers" }).click();

  await expect(panel(dialog)).toBeHidden();
  await expect(dialog.getByRole("status").filter({ hasText: "Added" })).toHaveText(
    "Added 2 blockers.",
  );
  await expectSaved(dialog);

  // Persisted with source = 'ai': one Server Action, and the badges survive a reload.
  await actions.settled(1);
  expect(actions.started()).toBe(1);
  await page.reload();
  const reopened = cardDialog(page, TARGET);
  await modalReady(reopened);
  await expectSaved(reopened);
  // Reopening the card never requests a proposal on its own.
  expect(mock.calls()).toBe(1);

  // From the blocker's side, "Blocks" shows the AI badge too.
  await depRow(reopened, "Blocked by", A).getByRole("link").click();
  const blockerDialog = cardDialog(page, A);
  await modalReady(blockerDialog);
  await expect(aiBadge(depRow(blockerDialog, "Blocks", TARGET))).toBeAttached();

  async function expectSaved(scope: Locator): Promise<void> {
    const blockedBy = depList(scope, "Blocked by");
    await expect(blockedBy.getByRole("listitem")).toHaveCount(2);
    await expect(aiBadge(depRow(scope, "Blocked by", A))).toBeAttached();
    await expect(aiBadge(depRow(scope, "Blocked by", B))).toBeAttached();
    await expect(blockedBy.getByRole("link", { name: C, exact: true })).toHaveCount(0);
    await expect(blockedBy.getByTitle("Suggested by AI")).toHaveCount(2);
  }
});

test("a reference the model invented is dropped; only the valid blocker is shown", async ({
  boardPage: page,
}) => {
  const dialog = await seedAndOpen(page, [TARGET, A, B], TARGET);
  await mockSuggestions(page, [A, B], (ref) => ({
    dependencies: [
      { blocker: "c99", rationale: "A card that doesn't exist." },
      { blocker: ref(B), rationale: "The feature calls the API." },
    ],
  }));

  await suggestButton(dialog).click();

  const list = suggestedList(dialog);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("checkbox", { name: `Include ${B} as a blocker` })).toBeChecked();
  await expect(list.getByText("A card that doesn't exist.")).toHaveCount(0);
  await expect(dialog.getByRole("status").filter({ hasText: "suggested" })).toHaveText(
    "1 blocker suggested. Review them before adding.",
  );

  const actions = trackServerActions(page);
  await panel(dialog).getByRole("button", { name: "Add 1 blocker" }).click();
  await expect(depRow(dialog, "Blocked by", B)).toBeVisible();
  await expect(depList(dialog, "Blocked by").getByRole("listitem")).toHaveCount(1);
  await expect(aiBadge(depRow(dialog, "Blocked by", B))).toBeAttached();
  await actions.settled(1);
});

test("an empty proposal says so and Discard saves nothing", async ({ boardPage: page }) => {
  const dialog = await seedAndOpen(page, [TARGET, A], TARGET);
  await mockSuggestions(page, [A], () => ({ dependencies: [] }));
  const actions = trackServerActions(page);
  await suggestButton(dialog).click();

  const message =
    "The AI didn't find any cards that block this one. You can still add blockers yourself.";
  await expect(panel(dialog).getByText(message, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: message })).toHaveText(message);
  await expect(panel(dialog).getByRole("button", { name: /^Add \d+ blockers?$/ })).toHaveCount(0);
  await expect(suggestedList(dialog)).toHaveCount(0);

  await panel(dialog).getByRole("button", { name: "Discard" }).click();
  await expect(panel(dialog)).toBeHidden();
  await expect(suggestButton(dialog)).toBeFocused();

  expect(actions.started()).toBe(0);
  await page.reload();
  const reopened = cardDialog(page, TARGET);
  await modalReady(reopened);
  await expect(depList(reopened, "Blocked by").getByRole("listitem")).toHaveCount(0);
  await expect(reopened.getByText("No card blocks this one.")).toBeVisible();
  await expect(aiBadge(reopened)).toHaveCount(0);
});

test("the daily quota: what's left is shown, and a spent quota can't be retried", async ({
  boardPage: page,
}) => {
  const dialog = await seedAndOpen(page, [TARGET, A], TARGET);
  const ids = [await cardId(page, A)];
  let calls = 0;
  await page.route(SUGGEST_ROUTE, async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        headers: { "X-Candidate-Ids": ids.join(","), "X-Quota-Remaining": "1" },
        body: JSON.stringify({ dependencies: [{ blocker: "c1", rationale: "Needed first." }] }),
      });
      return;
    }
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "3600" },
      json: {
        error: "You've used all your AI suggestions for today. They reset at midnight UTC.",
      },
    });
  });

  await suggestButton(dialog).click();
  await expect(suggestedList(dialog).getByRole("listitem")).toHaveCount(1);
  await panel(dialog).getByRole("button", { name: "Discard" }).click();
  await expect(suggestButton(dialog)).toBeEnabled();
  await expect(dialog.getByText("1 AI suggestion left today.", { exact: true })).toBeVisible();

  await suggestButton(dialog).click();
  const refused = "You've used all your AI suggestions for today. They reset at midnight UTC.";
  await expect(panel(dialog).getByText(refused, { exact: true })).toBeVisible();
  await expect(panel(dialog).getByRole("button", { name: "Retry" })).toHaveCount(0);

  // Discarding leaves the button aria-disabled (it keeps focus), explained by its description.
  await panel(dialog).getByRole("button", { name: "Discard" }).click();
  await expect(suggestButton(dialog)).toHaveAttribute("aria-disabled", "true");
  await expect(suggestButton(dialog)).toHaveAccessibleDescription(
    "No AI suggestions left today. They reset at midnight UTC.",
  );
  // A forced click (Playwright skips aria-disabled buttons) does nothing.
  await suggestButton(dialog).click({ force: true });
  await expect(panel(dialog)).toHaveCount(0);
  expect(calls).toBe(2);
});

test("a blocker added by hand has no AI badge", async ({ boardPage: page }) => {
  const dialog = await seedAndOpen(page, [TARGET, A], TARGET);
  const actions = trackServerActions(page);

  await dialog.getByRole("button", { name: "Add blocker" }).click();
  await page
    .getByRole("list", { name: "Cards that can block this one" })
    .getByRole("button", { name: `${A} To do`, exact: true })
    .click();
  await expect(depRow(dialog, "Blocked by", A)).toBeVisible();
  await actions.settled(1);

  await expect(aiBadge(dialog)).toHaveCount(0);
  await page.reload();
  const reopened = cardDialog(page, TARGET);
  await modalReady(reopened);
  await expect(depRow(reopened, "Blocked by", A)).toBeVisible();
  await expect(aiBadge(reopened)).toHaveCount(0);
});
