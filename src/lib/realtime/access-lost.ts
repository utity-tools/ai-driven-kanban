/** Search param on /boards that flags a redirect caused by lost access. */
export const ACCESS_LOST_PARAM = "left";

const STORAGE_KEY = "kanban:access-lost-title";
const TITLE_MAX = 120;

/** `/boards` URL that makes the boards page announce the lost access. No user text in it. */
export const ACCESS_LOST_HREF = `/boards?${ACCESS_LOST_PARAM}=1`;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Remembers the board title for the notice shown after the redirect. Never throws. */
export function rememberAccessLost(title: string, storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, title.slice(0, TITLE_MAX));
  } catch {
    // Storage unavailable: the redirect still happens, without the notice.
  }
}

/** Reads and clears the remembered title; `null` when there is none. Never throws. */
export function takeAccessLostMessage(
  storage: StorageLike | null = defaultStorage(),
): string | null {
  try {
    const title = storage?.getItem(STORAGE_KEY)?.trim().slice(0, TITLE_MAX);
    storage?.removeItem(STORAGE_KEY);
    return title ? `You no longer have access to “${title}”` : null;
  } catch {
    return null;
  }
}
