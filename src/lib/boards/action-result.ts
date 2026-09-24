/** What every board Server Action returns. Errors are safe to show as they are. */
export type ActionResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };

export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const SIGNED_OUT_ERROR = "Your session has expired. Sign in again.";
export const FORBIDDEN_ERROR = "You don't have permission to change this board.";
/** An update/delete matched no rows: gone, or hidden/forbidden by RLS (indistinguishable). */
export const NOT_FOUND_ERROR = "This no longer exists, or you don't have permission to change it.";

type DbError = { code?: string | undefined } | null | undefined;

/**
 * Maps a Postgres/PostgREST error to a message for users. Only the error code
 * is inspected; raw messages are never forwarded, so internals don't leak.
 * `overrides` lets an action phrase a code for its own context.
 */
export function friendlyDbError(
  error: DbError,
  overrides: Partial<Record<string, string>> = {},
): string {
  const code = error?.code ?? "";
  const override = overrides[code];
  if (override) return override;

  switch (code) {
    case "42501": // insufficient_privilege: RLS WITH CHECK or a missing grant
      return FORBIDDEN_ERROR;
    case "23503": // foreign_key_violation: the parent row is gone
      return NOT_FOUND_ERROR;
    case "23514": // check_violation
      return "That value isn't allowed. Check its length and try again.";
    case "PGRST301": // JWT expired / invalid
    case "PGRST303":
      return SIGNED_OUT_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

export function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
