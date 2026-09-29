export const INVITE_PATH = "/invite";

/** Path of the invite page. The token is a secret: only ever put it in this path. */
export function invitePath(token: string): string {
  return `${INVITE_PATH}/${token}`;
}

/** Absolute invite URL; without a known origin, the path (resolve it in the browser). */
export function inviteUrl(origin: string | null, token: string): string {
  const path = invitePath(token);
  return origin ? `${origin}${path}` : path;
}
