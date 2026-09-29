/** Search param on /boards that carries the title of a board the viewer lost access to. */
export const ACCESS_LOST_PARAM = "left";

const TITLE_MAX = 120;

/** `/boards` URL that makes the boards page announce the lost access. */
export function accessLostHref(title: string): string {
  const params = new URLSearchParams({ [ACCESS_LOST_PARAM]: title.slice(0, TITLE_MAX) });
  return `/boards?${params.toString()}`;
}

/** Message for the notice; `null` when the param is absent or blank. Plain text only. */
export function accessLostMessage(param: string | string[] | undefined): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  const title = value?.trim().slice(0, TITLE_MAX);
  return title ? `You no longer have access to “${title}”` : null;
}
