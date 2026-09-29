import type { BrowserContext, Locator, Page } from "@playwright/test";

import {
  ALICE_STORAGE_STATE,
  BOB,
  BOB_STORAGE_STATE,
  CAROL_STORAGE_STATE,
  expectLoginWithNext,
  signIn,
} from "./support/auth";
import { boardHeading, cardLink, column, expect, test as boardsTest } from "./support/boards";

// Members and invitations (v0.3): the Members dialog, single-use invite links
// and the /invite/<token> page.
//
// Isolation: the owner is Alice on a fresh board (support/boards.ts), so the
// seeded Demo board keeps its three members. Bob and Carol join or leave only
// that fresh board, each in a browser context of their own. Their saved
// sessions are only read, never signed out. Carol's read-only checks run on
// the Demo board without changing anything.
//
// Not covered: the "Link copied" clipboard button (it needs clipboard
// permissions the config does not grant), expired links (needs a clock
// change in the database), the 20-pending-invites cap (pgTAP covers it) and
// the race of two people joining with one link (pgTAP covers it).

const ALICE_NAME = "Alice Martin";
const BOB_NAME = "Bob Chen";
const TOKEN = /\/invite\/[A-Za-z0-9_-]{43}$/;

// --- Helpers ----------------------------------------------------------------

type OpenSession = (storageState?: string) => Promise<Page>;

/** `session` opens a page in a browser context of its own (signed in with `storageState`, or signed out); all are closed after the test. */
const test = boardsTest.extend<{ session: OpenSession }>({
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

test.use({ storageState: ALICE_STORAGE_STATE });

function membersDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Board members" });
}

async function openMembers(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Members", exact: true }).click();
  const dialog = membersDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Creates an invite link in the open Members dialog and returns its URL. */
async function createInviteLink(dialog: Locator, role?: "Editor" | "Viewer"): Promise<string> {
  if (role && role !== "Editor") {
    await dialog.getByRole("combobox", { name: "Invite role" }).click();
    await dialog.page().getByRole("option", { name: role }).click();
  }
  await dialog.getByRole("button", { name: "Create invite link" }).click();
  const input = dialog.getByLabel("Invite link");
  await expect(input).toHaveValue(TOKEN);
  return input.inputValue();
}

function pendingInvites(dialog: Locator): Locator {
  return dialog.getByRole("list", { name: "Pending invites" });
}

function memberRow(dialog: Locator, name: string): Locator {
  return dialog
    .getByRole("list", { name: "People with access" })
    .getByRole("listitem")
    .filter({ hasText: name });
}

/** Opens the invite link as Bob, joins, and ends on the board. Returns Bob's page. */
async function joinAsBob(
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

// --- Tests ------------------------------------------------------------------

test("an invite is accepted once: the member can edit and the link is spent", async ({
  page,
  board,
  session,
}) => {
  const dialog = await openMembers(page);
  const link = await createInviteLink(dialog, "Editor");
  await expect(pendingInvites(dialog).getByText("Editor link")).toBeVisible();

  const bob = await test.step("Bob opens the link and joins", async () => {
    const bobPage = await session(BOB_STORAGE_STATE);
    await bobPage.goto(link);
    const heading = bobPage.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(`invited you to join ${board.title} as Editor`);
    await bobPage.getByRole("button", { name: "Join board" }).click();
    await expect(bobPage).toHaveURL(board.path);
    await expect(boardHeading(bobPage)).toHaveText(board.title);
    return bobPage;
  });

  await test.step("Bob can add a card", async () => {
    await column(bob, "To do").getByRole("button", { name: "Add a card" }).click();
    const composer = bob.getByRole("textbox", { name: "Title for a new card in To do" });
    await composer.fill("Added by Bob");
    await composer.press("Enter");
    await expect(cardLink(bob, "Added by Bob")).toBeVisible();
    await expect(composer).toHaveValue("");
  });

  await test.step("the link now shows as used to a third person", async () => {
    const carol = await session(CAROL_STORAGE_STATE);
    await carol.goto(link);
    await expect(
      carol.getByRole("heading", { level: 1, name: "This invite has already been used" }),
    ).toBeVisible();
    await expect(carol.getByRole("link", { name: "Go to your boards" })).toBeVisible();
  });

  await test.step("the owner sees Bob as an Editor and no pending invite", async () => {
    await page.reload();
    const members = await openMembers(page);
    await expect(memberRow(members, BOB_NAME)).toBeVisible();
    await expect(members.getByRole("combobox", { name: `Role for ${BOB_NAME}` })).toContainText(
      "Editor",
    );
    await expect(members.getByText("No pending invites.")).toBeVisible();
  });
});

test("a signed-out visitor signs in and comes back to the invite", async ({
  board,
  boardPage,
  session,
}) => {
  const link = await createInviteLink(await openMembers(boardPage), "Viewer");
  const path = new URL(link).pathname;

  const visitor = await session();
  await visitor.goto(link);
  await expectLoginWithNext(visitor, path);

  await signIn(visitor, BOB);
  await expect(visitor).toHaveURL(path);
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText(
    `invited you to join ${board.title} as Viewer`,
  );
  await visitor.getByRole("button", { name: "Join board" }).click();
  await expect(visitor).toHaveURL(board.path);
  await expect(boardHeading(visitor)).toHaveText(board.title);
});

test("malformed and unknown tokens show the invalid page", async ({ page }) => {
  for (const token of ["A".repeat(43), "not-a-token", "A".repeat(200)]) {
    await page.goto(`/invite/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "This invite link is not valid" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your boards" })).toHaveAttribute(
      "href",
      "/boards",
    );
  }
});

test("an owner changes a role, removes a member and revokes an invite", async ({
  page,
  board,
  session,
}) => {
  const first = await createInviteLink(await openMembers(page));
  const bob = await joinAsBob(session, first, board);
  await page.reload();
  const dialog = await openMembers(page);
  const second = await createInviteLink(dialog);

  await test.step("promote Bob to Owner: he still cannot touch the creator", async () => {
    await dialog.getByRole("combobox", { name: `Role for ${BOB_NAME}` }).click();
    await page.getByRole("option", { name: "Owner" }).click();
    await expect(dialog.getByRole("combobox", { name: `Role for ${BOB_NAME}` })).toContainText(
      "Owner",
    );

    // Owner controls show up once Bob's board reloads with the new role.
    // Alice's change is optimistic, so reload until it has committed: only owners get
    // the "Board actions" menu.
    await expect(async () => {
      await bob.reload();
      await expect(bob.getByRole("button", { name: "Board actions" })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    const bobDialog = await openMembers(bob);
    await expect(
      bobDialog.getByRole("combobox", { name: `Role for ${ALICE_NAME}` }),
    ).toBeDisabled();
    await expect(bobDialog.getByRole("button", { name: `Remove ${ALICE_NAME}` })).toBeDisabled();
    await expect(bobDialog.getByText("The board's creator always stays an owner.")).toBeVisible();
    await bobDialog.getByRole("button", { name: "Close" }).click();
  });

  await test.step("change Bob to Viewer", async () => {
    await dialog.getByRole("combobox", { name: `Role for ${BOB_NAME}` }).click();
    await page.getByRole("option", { name: "Viewer" }).click();
    await expect(dialog.getByRole("combobox", { name: `Role for ${BOB_NAME}` })).toContainText(
      "Viewer",
    );
  });

  await test.step("remove Bob after confirming; the pending link is flagged", async () => {
    await dialog.getByRole("button", { name: `Remove ${BOB_NAME}` }).click();
    const confirm = page.getByRole("alertdialog", { name: `Remove ${BOB_NAME}?` });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(memberRow(dialog, BOB_NAME)).toBeVisible();

    await dialog.getByRole("button", { name: `Remove ${BOB_NAME}` }).click();
    await confirm.getByRole("button", { name: "Remove member" }).click();
    await expect(memberRow(dialog, BOB_NAME)).toHaveCount(0);
    await expect(dialog.getByRole("status").filter({ hasText: "was removed" })).toContainText(
      `${BOB_NAME} was removed. Invite links are not tied to a person`,
    );
  });

  await test.step("revoke the pending invite", async () => {
    await dialog.getByRole("button", { name: /^Revoke Editor invite expiring / }).click();
    await expect(page.getByText("Invite revoked")).toBeVisible();
    await expect(dialog.getByText("No pending invites.")).toBeVisible();
  });

  await test.step("the revoked link is no longer valid", async () => {
    const bob = await session(BOB_STORAGE_STATE);
    await bob.goto(second);
    await expect(
      bob.getByRole("heading", { level: 1, name: "This invite link is not valid" }),
    ).toBeVisible();
  });
});

test("a member leaves the board; the creator cannot", async ({ page, board, session }) => {
  const link = await createInviteLink(await openMembers(page));
  const bob = await joinAsBob(session, link, board);

  const dialog = await openMembers(bob);
  await expect(dialog.getByText("Only owners can change roles or invite people.")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Invite people" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Leave board" }).click();
  await bob
    .getByRole("alertdialog", { name: `Leave “${board.title}”?` })
    .getByRole("button", { name: "Leave board" })
    .click();
  await expect(bob).toHaveURL("/boards");
  await expect(bob.getByRole("main").getByRole("link", { name: board.title })).toHaveCount(0);

  await page.reload();
  const owner = await openMembers(page);
  await expect(memberRow(owner, BOB_NAME)).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Leave board" })).toHaveCount(0);
  await expect(
    owner.getByText("You created this board, so you can't leave it. Delete the board instead."),
  ).toBeVisible();
  await expect(owner.getByText("The board's creator always stays an owner.")).toBeVisible();
});

test.describe("viewer", () => {
  test("Carol sees the Demo board read-only", async ({ session }) => {
    const page = await session(CAROL_STORAGE_STATE);
    await page.goto("/boards");
    await page.getByRole("main").getByRole("link", { name: "Demo board" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Add a card" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add column" })).toHaveCount(0);

    const dialog = await openMembers(page);
    await expect(dialog.getByText("Only owners can change roles or invite people.")).toBeVisible();
    await expect(dialog.getByRole("list", { name: "People with access" })).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "Invite people" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Create invite link" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    const title = "Rate-limit the AI proposal endpoint";
    await cardLink(page, title).click();
    const card = page.getByRole("dialog", { name: title, exact: true });
    await expect(card.getByRole("button", { name: "Close" })).toBeVisible();
    // The seed has no dependencies and the section is hidden from viewers without any.
    await expect(card.getByRole("button", { name: "Add blocker" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /^Remove dependency/ })).toHaveCount(0);
  });
});

test("a demo visitor is asked to create an account to join", async ({ boardPage, session }) => {
  const link = await createInviteLink(await openMembers(boardPage));
  const path = new URL(link).pathname;

  const demo = await session();
  await demo.goto("/");
  await demo
    .getByRole("main")
    .getByRole("region", { name: "AI-Driven Kanban" })
    .getByRole("button", { name: "Try the demo" })
    .click();
  await expect(demo.getByRole("banner")).toContainText("Signed in as Demo visitor");
  await demo.goto(path);

  await expect(
    demo.getByRole("heading", { level: 1, name: "Create an account to join" }),
  ).toBeVisible();
  await expect(demo.getByRole("button", { name: "Join board" })).toHaveCount(0);
  await demo.getByRole("main").getByRole("button", { name: "Create an account" }).click();
  // The demo user is signed out first, then sign-up keeps the invite as `next`.
  await expect(demo).toHaveURL(`/signup?next=${encodeURIComponent(path)}`);
});
