export const DEFAULT_AFTER_LOGIN_PATH = "/boards";

// Any origin works: it only anchors relative resolution so we can compare origins.
const BASE = "http://internal.invalid";

/**
 * Returns a safe, same-origin relative path to redirect to after auth, or the
 * fallback. Rejects absolute URLs, protocol-relative URLs (`//evil.com`),
 * backslash tricks (`/\evil.com`), control characters and anything that would
 * resolve to another origin.
 */
export function sanitizeNextPath(
  value: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN_PATH,
): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Browsers treat "\" like "/", and strip tabs/newlines from URLs.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
