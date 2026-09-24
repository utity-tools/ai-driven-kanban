/** Search param that holds the id of the card open in the card modal. */
export const CARD_PARAM = "card";

type SearchInput = string | URLSearchParams;

function toParams(search: SearchInput): URLSearchParams {
  return new URLSearchParams(search);
}

function join(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** URL of the board with `cardId` open, keeping any other search params. */
export function cardHref(pathname: string, search: SearchInput, cardId: string): string {
  const params = toParams(search);
  params.set(CARD_PARAM, cardId);
  return join(pathname, params);
}

/** URL of the board with the card modal closed, keeping any other search params. */
export function hrefWithoutCard(pathname: string, search: SearchInput): string {
  const params = toParams(search);
  params.delete(CARD_PARAM);
  return join(pathname, params);
}

/** The open card id from the search params, or `null` when none (or blank). */
export function selectedCardId(search: SearchInput): string | null {
  const value = toParams(search).get(CARD_PARAM)?.trim();
  return value ? value : null;
}

/**
 * Marker stored in `history.state` on entries pushed when a card is opened from
 * the board. Closing such an entry goes Back (so Back and Close behave the same
 * and history doesn't grow); entries without it (direct link, reload of a
 * shared URL) are replaced instead, so closing never leaves the app.
 */
export const OPENED_FROM_BOARD_KEY = "kanbanCardOpenedFromBoard";

export function wasOpenedFromBoard(historyState: unknown): boolean {
  return (
    typeof historyState === "object" &&
    historyState !== null &&
    (historyState as Record<string, unknown>)[OPENED_FROM_BOARD_KEY] === true
  );
}
