import { z } from "zod";

import { DEFAULT_AFTER_LOGIN_PATH } from "./redirect";
import type { CurrentUser } from "./user";

/** How long anonymous demo users and their boards are kept before cleanup. */
export const DEMO_RETENTION_DAYS = 7;

export const DEMO_ERROR_CODE = "demo";
/** Where `startDemo` sends visitors when the demo cannot be started. */
export const DEMO_ERROR_PATH = `/?${new URLSearchParams({ error: DEMO_ERROR_CODE }).toString()}`;

/**
 * Who is looking at the landing page, which decides its call to action and
 * what `startDemo` does:
 * - `signed-out`: sign in anonymously, then open the demo board.
 * - `demo`: already an anonymous user; reopen their demo board.
 * - `member`: a permanent account; go to their boards, never start a demo.
 */
export type Visitor = "signed-out" | "demo" | "member";

export function visitorKind(user: Pick<CurrentUser, "isAnonymous"> | null): Visitor {
  if (!user) return "signed-out";
  return user.isAnonymous ? "demo" : "member";
}

/** Path of the demo board, or the boards list when the id is missing or not a UUID. */
export function demoBoardPath(boardId: string | null | undefined): string {
  return boardId && z.uuid().safeParse(boardId).success
    ? `/boards/${boardId}`
    : DEFAULT_AFTER_LOGIN_PATH;
}

/** Messages for `/?error=<code>`. Only known codes are shown; nothing is echoed. */
const LANDING_PAGE_ERRORS: Record<string, string> = {
  [DEMO_ERROR_CODE]:
    "We couldn't start the demo right now. Please wait a moment and try again, or create a free account.",
};

export function landingPageErrorMessage(code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(LANDING_PAGE_ERRORS, code)
    ? LANDING_PAGE_ERRORS[code]
    : undefined;
}
