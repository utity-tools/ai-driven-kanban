import { DEFAULT_AFTER_LOGIN_PATH } from "./redirect";

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";

const AUTH_PAGES = new Set([LOGIN_PATH, SIGNUP_PATH]);
const PUBLIC_PATHS = new Set(["/", LOGIN_PATH, SIGNUP_PATH]);
const PUBLIC_PREFIXES = ["/auth/"];

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.has(normalise(pathname));
}

export function isPublicPath(pathname: string): boolean {
  const path = normalise(pathname);
  return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => `${path}/`.startsWith(prefix));
}

/** Builds `/login?next=<path>` so the user returns where they were going. */
export function loginPathWithNext(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `${LOGIN_PATH}?${params.toString()}`;
}

/**
 * Decides whether the proxy should redirect. Returns the target path (with
 * query) or `null` to let the request through. Pure so it can be unit tested.
 */
export function getAuthRedirect(input: {
  pathname: string;
  search: string;
  isSignedIn: boolean;
}): string | null {
  const { pathname, search, isSignedIn } = input;

  if (isSignedIn && isAuthPage(pathname)) return DEFAULT_AFTER_LOGIN_PATH;
  if (!isSignedIn && !isPublicPath(pathname)) return loginPathWithNext(`${pathname}${search}`);
  return null;
}
