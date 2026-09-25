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

/**
 * What the `openDemo` Server Action tells the landing page: open a path, or
 * restart with a fresh anonymous sign-in (no session, or an expired demo whose
 * user was deleted while its JWT is still valid).
 */
export type OpenDemoResult = { status: "open"; path: string } | { status: "restart" };

/**
 * Decides `openDemo`'s answer. `signOut` is set when a demo session has no
 * board left (its user was cleaned up), so the stale session is cleared before
 * the browser signs in again.
 */
export function decideOpenDemo(
  visitor: Visitor,
  demoBoardId: string | null,
): { result: OpenDemoResult; signOut: boolean } {
  switch (visitor) {
    case "member":
      return { result: { status: "open", path: DEFAULT_AFTER_LOGIN_PATH }, signOut: false };
    case "signed-out":
      return { result: { status: "restart" }, signOut: false };
    case "demo":
      return demoBoardId
        ? { result: { status: "open", path: demoBoardPath(demoBoardId) }, signOut: false }
        : { result: { status: "restart" }, signOut: true };
  }
}

export type LaunchDemoDeps = {
  /** Anonymous sign-in, run in the browser so the Auth rate limit sees the visitor's IP. */
  signInAnonymously: () => Promise<{ ok: boolean }>;
  openDemo: () => Promise<OpenDemoResult>;
};

/**
 * Client-side demo flow, returning the path to navigate to. Signed-out
 * visitors sign in first; an existing demo session is reused and, if it turns
 * out to be expired, replaced by one fresh sign-in. Never signs in more than
 * once, so a misbehaving server can't make it loop. Any failure (rate limit,
 * anonymous sign-ins disabled, network) ends at `DEMO_ERROR_PATH`.
 */
export async function launchDemo(
  deps: LaunchDemoDeps,
  options: { hasDemoSession: boolean },
): Promise<string> {
  try {
    let signedIn = false;
    if (!options.hasDemoSession) {
      if (!(await deps.signInAnonymously()).ok) return DEMO_ERROR_PATH;
      signedIn = true;
    }

    let result = await deps.openDemo();
    if (result.status === "restart" && !signedIn) {
      if (!(await deps.signInAnonymously()).ok) return DEMO_ERROR_PATH;
      result = await deps.openDemo();
    }
    return result.status === "open" ? result.path : DEMO_ERROR_PATH;
  } catch {
    return DEMO_ERROR_PATH;
  }
}
