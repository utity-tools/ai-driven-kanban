import type { Locator, Page, Route } from "@playwright/test";

import { ALICE_STORAGE_STATE } from "./support/auth";
import { addCards, cardLink, test, expect } from "./support/boards";
import { trackServerActions } from "./support/server-actions";

// AI subtask proposals (v0.2 deliveries 4 and 5): "Suggest with AI" in the card modal
// streams a proposal, the user reviews it, and only what they keep is saved.
//
// The model is never reached: the decompose route is mocked in the browser
// with deterministic fixtures (the real route streams the same plain-text
// JSON via toTextStreamResponse). Saving is real: the acceptAiSubtasks Server
// Action and the accept_ai_subtasks RPC run against the local database.
//
// Isolation: every test works on a fresh board (support/boards.ts).

test.use({ storageState: ALICE_STORAGE_STATE });

const DECOMPOSE_ROUTE = "**/api/cards/*/decompose";

const PROPOSAL = {
  subtasks: [
    { title: "Design the login form", estimate: 3 },
    { title: "Wire up Supabase Auth", estimate: 5 },
    { title: "Write the E2E test", estimate: null },
  ],
};

// --- Locators ---------------------------------------------------------------

function cardDialog(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

function subtaskList(dialog: Locator): Locator {
  return dialog.getByRole("list", { name: "Subtasks", exact: true });
}

/** The saved subtasks' titles in order (each checkbox is named after its subtask). */
function subtaskTitles(dialog: Locator): Promise<string[]> {
  return subtaskList(dialog)
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label") ?? ""));
}

/** A saved subtask row, by its checkbox (`has` matches inside the row, so start at the page). */
function subtaskRow(dialog: Locator, title: string): Locator {
  return subtaskList(dialog)
    .getByRole("listitem")
    .filter({ has: dialog.page().getByRole("checkbox", { name: title, exact: true }) });
}

function suggestButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Suggest with AI" });
}

function suggestions(dialog: Locator): Locator {
  return dialog.getByRole("region", { name: "AI suggestions" });
}

function suggestedList(dialog: Locator): Locator {
  return suggestions(dialog).getByRole("list", { name: "Suggested subtasks" });
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

/** Answers like the real route's successful text stream (the whole body at once). */
function fulfillStream(route: Route, body: string, quotaRemaining?: number): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "text/plain; charset=utf-8",
    headers: quotaRemaining === undefined ? {} : { "X-Quota-Remaining": String(quotaRemaining) },
    body,
  });
}

// --- Tests --------------------------------------------------------------------

test("review an AI proposal: uncheck, edit and re-estimate, then add only what was kept", async ({
  boardPage: page,
}) => {
  const requests: string[] = [];
  await page.route(DECOMPOSE_ROUTE, async (route) => {
    requests.push(route.request().method());
    await fulfillStream(route, JSON.stringify(PROPOSAL));
  });

  const card = "Card for AI suggestions";
  const dialog = await createAndOpenCard(page, card);
  await suggestButton(dialog).click();

  // The review: every row checked, titles and estimates as proposed.
  const list = suggestedList(dialog);
  await expect(list.getByRole("listitem")).toHaveCount(3);
  expect(requests).toEqual(["POST"]);
  await expect(suggestButton(dialog)).toBeHidden();
  for (const n of [1, 2, 3]) {
    await expect(
      list.getByRole("checkbox", { name: `Include suggested subtask ${n}` }),
    ).toBeChecked();
  }
  await expect(list.getByRole("textbox", { name: "Title of suggested subtask 1" })).toHaveValue(
    "Design the login form",
  );
  await expect(
    list.getByRole("button", { name: "Estimate for suggested subtask 1: 3 points" }),
  ).toBeVisible();
  await expect(
    list.getByRole("button", { name: "Estimate for suggested subtask 3: none" }),
  ).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: "suggested" })).toHaveText(
    "3 subtasks suggested. Review them before adding.",
  );
  await expect(suggestions(dialog).getByRole("button", { name: "Add 3 subtasks" })).toBeEnabled();

  // Drop the second, rename the first, re-estimate the third.
  await list.getByRole("checkbox", { name: "Include suggested subtask 2" }).click();
  await expect(
    list.getByRole("checkbox", { name: "Include suggested subtask 2" }),
  ).not.toBeChecked();
  await list
    .getByRole("textbox", { name: "Title of suggested subtask 1" })
    .fill("Design the sign-in form");
  await list.getByRole("button", { name: "Estimate for suggested subtask 3: none" }).click();
  await page.getByRole("menuitemradio", { name: "8 pts", exact: true }).click();
  await expect(
    list.getByRole("button", { name: "Estimate for suggested subtask 3: 8 points" }),
  ).toBeVisible();

  // Nothing is saved until the user confirms.
  await expect.poll(() => subtaskTitles(dialog)).toEqual([]);

  const actions = trackServerActions(page);
  await suggestions(dialog).getByRole("button", { name: "Add 2 subtasks" }).click();

  // The review closes and the kept rows join the checklist, marked as AI.
  await expect(suggestions(dialog)).toBeHidden();
  await expect(suggestButton(dialog)).toBeFocused();
  await expect(dialog.getByRole("status").filter({ hasText: "Added" })).toHaveText(
    "Added 2 subtasks.",
  );
  // The outcome stays on screen under the button, not only in the screen-reader status.
  await expect(dialog.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  await expect
    .poll(() => subtaskTitles(dialog))
    .toEqual(["Design the sign-in form", "Write the E2E test"]);
  await expectSavedRows(dialog);

  // Persisted: one Server Action, and the same rows after a reload.
  await actions.settled(1);
  expect(actions.started()).toBe(1);
  await page.reload();
  const reopened = cardDialog(page, card);
  await modalReady(reopened);
  await expect
    .poll(() => subtaskTitles(reopened))
    .toEqual(["Design the sign-in form", "Write the E2E test"]);
  await expectSavedRows(reopened);
  // Reopening the card never requests a proposal on its own.
  expect(requests).toHaveLength(1);

  async function expectSavedRows(scope: Locator): Promise<void> {
    const first = subtaskRow(scope, "Design the sign-in form");
    const third = subtaskRow(scope, "Write the E2E test");
    await expect(first.getByText("Proposed by AI")).toBeAttached();
    await expect(third.getByText("Proposed by AI")).toBeAttached();
    await expect(
      first.getByRole("button", { name: "Estimate for Design the sign-in form: 3 points" }),
    ).toBeVisible();
    await expect(
      third.getByRole("button", { name: "Estimate for Write the E2E test: 8 points" }),
    ).toBeVisible();
    await expect(
      subtaskList(scope).getByRole("checkbox", { name: "Wire up Supabase Auth" }),
    ).toHaveCount(0);
    await expect(scope.getByText("0/2 · 0 of 11 pts", { exact: true })).toBeVisible();
  }
});

test("while the AI works a thinking mark shows; stopping before anything streamed says so", async ({
  boardPage: page,
}) => {
  // The route answers only when released, so the streaming state stays observable.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(DECOMPOSE_ROUTE, async (route) => {
    await gate;
    await fulfillStream(route, JSON.stringify(PROPOSAL)).catch(() => {});
  });

  const dialog = await createAndOpenCard(page, "Card for stopping early");
  await suggestButton(dialog).click();

  await expect(suggestions(dialog).locator("[data-ai-thinking]")).toBeVisible();
  await suggestions(dialog).getByRole("button", { name: "Stop" }).click();

  await expect(suggestions(dialog)).toBeHidden();
  await expect(suggestButton(dialog)).toBeFocused();
  const stopped = dialog.getByRole("status").filter({ hasText: "Stopped" });
  await expect(stopped).toHaveText("Stopped. No subtasks were suggested.");
  await expect(stopped).toBeVisible();
  release();
});

test("an empty proposal shows an error; Retry reviews a new one; Discard saves nothing", async ({
  boardPage: page,
}) => {
  let calls = 0;
  await page.route(DECOMPOSE_ROUTE, async (route) => {
    calls += 1;
    // The first answer is an empty stream (the model failed mid-way); the retry succeeds.
    await fulfillStream(route, calls === 1 ? "" : JSON.stringify(PROPOSAL));
  });

  const dialog = await createAndOpenCard(page, "Card with a flaky AI");
  const actions = trackServerActions(page);
  await suggestButton(dialog).click();

  const panel = suggestions(dialog);
  const emptyError = "The AI didn't return any usable subtasks. Please try again.";
  await expect(panel.getByText(emptyError, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: emptyError })).toHaveText(emptyError);
  await expect(panel.getByRole("button", { name: "Discard" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Add \d+ subtasks?$/ })).toHaveCount(0);

  await panel.getByRole("button", { name: "Retry" }).click();
  await expect(suggestedList(dialog).getByRole("listitem")).toHaveCount(3);
  await expect(panel.getByText(emptyError)).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Retry" })).toHaveCount(0);
  expect(calls).toBe(2);

  await panel.getByRole("button", { name: "Discard" }).click();
  await expect(panel).toBeHidden();
  await expect(suggestButton(dialog)).toBeFocused();
  await expect(dialog.getByRole("status").filter({ hasText: "discarded" })).toHaveText(
    "Suggestions discarded.",
  );

  // Nothing was saved: no Server Action ran, and a reload shows an empty checklist.
  expect(actions.started()).toBe(0);
  await expect.poll(() => subtaskTitles(dialog)).toEqual([]);
  await page.reload();
  const reopened = cardDialog(page, "Card with a flaky AI");
  await modalReady(reopened);
  await expect(suggestButton(reopened)).toBeVisible();
  await expect.poll(() => subtaskTitles(reopened)).toEqual([]);
  await expect(reopened.getByText("Proposed by AI")).toHaveCount(0);
});

test("a refused request shows the route's own error message", async ({ boardPage: page }) => {
  const message = "Only owners and editors can use AI decomposition.";
  await page.route(DECOMPOSE_ROUTE, (route) =>
    route.fulfill({ status: 403, json: { error: message } }),
  );

  const dialog = await createAndOpenCard(page, "Card the AI refuses");
  await suggestButton(dialog).click();

  const panel = suggestions(dialog);
  await expect(panel.getByText(message, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: message })).toHaveText(message);
  await expect(panel.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Suggested subtasks" })).toHaveCount(0);
  await expect.poll(() => subtaskTitles(dialog)).toEqual([]);
});

test("the daily quota: what's left is shown, and a spent quota can't be retried", async ({
  boardPage: page,
}) => {
  let calls = 0;
  await page.route(DECOMPOSE_ROUTE, async (route) => {
    calls += 1;
    if (calls === 1) {
      await fulfillStream(route, JSON.stringify(PROPOSAL), 1);
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

  const dialog = await createAndOpenCard(page, "Card near the AI quota");
  const panel = suggestions(dialog);

  // First request: a proposal, then back to the button with the count left.
  await suggestButton(dialog).click();
  await expect(suggestedList(dialog).getByRole("listitem")).toHaveCount(3);
  await panel.getByRole("button", { name: "Discard" }).click();
  await expect(suggestButton(dialog)).toBeEnabled();
  await expect(dialog.getByText("1 AI suggestion left today.", { exact: true })).toBeVisible();

  // Second request: refused by the quota, with no Retry.
  await suggestButton(dialog).click();
  const refused = "You've used all your AI suggestions for today. They reset at midnight UTC.";
  await expect(panel.getByText(refused, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Retry" })).toHaveCount(0);

  // Discarding leaves the button disabled, explained by its description.
  await panel.getByRole("button", { name: "Discard" }).click();
  await expect(suggestButton(dialog)).toBeDisabled();
  await expect(suggestButton(dialog)).toHaveAccessibleDescription(
    "No AI suggestions left today. They reset at midnight UTC.",
  );
  expect(calls).toBe(2);
});
