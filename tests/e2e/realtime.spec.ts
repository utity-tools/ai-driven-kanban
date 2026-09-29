import type { Page } from "@playwright/test";

import { ALICE_STORAGE_STATE } from "./support/auth";
import {
  addCards,
  boardHeading,
  cardLink,
  column,
  deleteOpenBoard,
  expect,
} from "./support/boards";
import { createInviteLink, joinAsBob, memberRow, openMembers, test } from "./support/members";
import { trackServerActions } from "./support/server-actions";

// Live board (v0.4): another member's change shows up without a reload, presence
// avatars, and what happens when access is lost or an open card is deleted.
//
// Isolation: Alice owns a fresh board (support/boards.ts) and Bob joins it through
// an invite link, each in a browser context of their own. Nothing touches the
// Demo board. Updates arrive through Supabase Realtime plus a debounced refresh,
// so waits use a generous expect timeout, never fixed sleeps.
//
// Not covered: the "Live updates paused" indicator (needs the socket to drop),
// the "+N" overflow of viewers (needs five members) and reconnect catch-up.

const ALICE_NAME = "Alice Martin";
const BOB_NAME = "Bob Chen";
const LIVE = { timeout: 15_000 };

test.use({ storageState: ALICE_STORAGE_STATE });

/** Resolves once the page's Realtime socket has been told its channel join succeeded. */
function channelJoined(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (socket) => {
      socket.on("framereceived", ({ payload }) => {
        if (
          typeof payload === "string" &&
          payload.includes('"phx_reply"') &&
          payload.includes('"status":"ok"') &&
          payload.includes("realtime:")
        )
          resolve();
      });
    });
  });
}

/** Alice's board with Bob already on it as an editor. */
const bobJoins = test.extend<{ bob: Page }>({
  bob: async ({ page, board, session }, provide) => {
    const link = await createInviteLink(await openMembers(page));
    await page.keyboard.press("Escape");
    await provide(await joinAsBob(session, link, board));
  },
});

bobJoins(
  "a change made by one member appears for the other without reloading",
  async ({ page: alice, bob }) => {
    const aliceActions = trackServerActions(alice);
    const bobActions = trackServerActions(bob);

    await test.step("Alice adds a card; Bob sees it", async () => {
      const composer = await addCards(alice, "To do", ["Added by Alice"]);
      await composer.press("Escape");
      await aliceActions.settled(1);
      await expect(cardLink(bob, "Added by Alice")).toBeVisible(LIVE);
    });

    await test.step("Bob adds a card in another column; Alice sees it", async () => {
      const composer = await addCards(bob, "In progress", ["Added by Bob"]);
      await composer.press("Escape");
      await bobActions.settled(1);
      await expect(
        column(alice, "In progress").getByRole("link", { name: "Added by Bob" }),
      ).toBeVisible(LIVE);
    });
  },
);

bobJoins("members see who else is viewing the board", async ({ page: alice, bob, board }) => {
  const aliceViewing = alice.getByRole("list", { name: "Viewing now" });
  const bobViewing = bob.getByRole("list", { name: "Viewing now" });

  await expect(aliceViewing.getByRole("img", { name: BOB_NAME })).toBeVisible(LIVE);
  await expect(bobViewing.getByRole("img", { name: ALICE_NAME })).toBeVisible(LIVE);
  // You never appear in your own list.
  await expect(aliceViewing.getByRole("img", { name: ALICE_NAME })).toHaveCount(0);

  await bob.goto("/boards");
  await expect(aliceViewing).toBeHidden(LIVE);
  await expect(boardHeading(alice)).toHaveText(board.title);
});

bobJoins(
  "a removed member is sent to the boards list with a notice",
  async ({ page: alice, bob, board }) => {
    const dialog = await openMembers(alice);
    await dialog.getByRole("button", { name: `Remove ${BOB_NAME}` }).click();
    await alice
      .getByRole("alertdialog", { name: `Remove ${BOB_NAME}?` })
      .getByRole("button", { name: "Remove member" })
      .click();
    await expect(memberRow(dialog, BOB_NAME)).toHaveCount(0);

    await expect(bob).toHaveURL("/boards", LIVE);
    // `.first()`: in dev React Strict Mode runs the notice's effect twice, so two identical toasts show.
    await expect(
      bob.getByText(`You no longer have access to “${board.title}”`).first(),
    ).toBeVisible(LIVE);
  },
);

bobJoins(
  "an open card closes when someone else deletes it, but not when archived",
  async ({ page: alice, bob }) => {
    const target = "Card under review";
    const aliceActions = trackServerActions(alice);
    const composer = await addCards(alice, "To do", [target]);
    await composer.press("Escape");
    await aliceActions.settled(1);

    await cardLink(bob, target).click({ timeout: LIVE.timeout });
    const modal = bob.getByRole("dialog", { name: target });
    await expect(modal).toBeVisible();

    await test.step("Alice archives it: Bob's modal stays open", async () => {
      await cardLink(alice, target).click();
      await alice
        .getByRole("dialog", { name: target })
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      await expect(alice.getByRole("button", { name: "Archived cards (1)" })).toBeVisible();
      // Bob's open modal turns read-only ("archived") instead of closing.
      await expect(
        modal.getByText("This card is archived and not shown on the board."),
      ).toBeVisible(LIVE);
      await expect(modal).toBeVisible();
      await expect(bob.getByText("That card no longer exists.")).toHaveCount(0);
    });

    await test.step("Alice deletes it permanently: Bob's modal closes with a notice", async () => {
      await alice.getByRole("button", { name: "Archived cards (1)" }).click();
      await alice
        .getByRole("dialog", { name: "Archived cards" })
        .getByRole("button", { name: "Delete permanently" })
        .click();
      await alice
        .getByRole("alertdialog", { name: `Delete “${target}” permanently?` })
        .getByRole("button", { name: "Delete permanently" })
        .click();

      await expect(modal).toBeHidden(LIVE);
      await expect(bob.getByText("That card no longer exists.")).toBeVisible(LIVE);
    });
  },
);

bobJoins(
  "a board deleted by its owner sends the other member to the boards list with a notice",
  async ({ page: alice, bob, board }) => {
    await deleteOpenBoard(alice);

    // Not a 404: same redirect and notice as a removed member. The flag param is stripped.
    await expect(bob).toHaveURL("/boards", LIVE);
    await expect(
      bob.getByText(`You no longer have access to “${board.title}”`).first(),
    ).toBeVisible(LIVE);
    await expect(bob.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
  },
);

test("the same user's second tab updates live, and the first tab keeps working", async ({
  page: tabA,
  board,
}) => {
  // Same browser context: same signed-in user, so the change is not "someone else's".
  // Only tab A edits: a tab that just made its own change deliberately ignores broadcasts
  // from the same user for a couple of seconds (see OWN_CHANGE_WINDOW_MS), so a two-way
  // exchange would be timing-dependent.
  const tabB = await tabA.context().newPage();
  const tabBJoined = channelJoined(tabB);
  await tabB.goto(board.path);
  await expect(boardHeading(tabB)).toHaveText(board.title);
  // A broadcast sent before tab B has joined its channel would be missed for good.
  await tabBJoined;
  const actionsA = trackServerActions(tabA);

  await test.step("a card added in tab A appears in tab B", async () => {
    const composer = await addCards(tabA, "To do", ["Added in tab A"]);
    await composer.press("Escape");
    await actionsA.settled(1);
    await expect(cardLink(tabB, "Added in tab A")).toBeVisible(LIVE);
    await expect(cardLink(tabA, "Added in tab A")).toBeVisible();
  });

  await test.step("tab A keeps working: a second card shows in both tabs", async () => {
    const composer = await addCards(tabA, "Done", ["Second from tab A"]);
    await composer.press("Escape");
    await actionsA.settled(2);
    await expect(cardLink(tabA, "Second from tab A")).toBeVisible();
    await expect(cardLink(tabA, "Added in tab A")).toBeVisible();
    await expect(column(tabB, "Done").getByRole("link", { name: "Second from tab A" })).toBeVisible(
      LIVE,
    );
  });
});

test("a crafted access-lost link shows no notice", async ({ page }) => {
  await page.goto("/boards?left=Your%20session%20expired");
  await expect(page).toHaveURL("/boards");
  await expect(page.getByRole("heading", { level: 1, name: "Your boards" })).toBeVisible();
  await expect(page.getByText("Your session expired")).toHaveCount(0);
  await expect(page.getByText("You no longer have access")).toHaveCount(0);
});
