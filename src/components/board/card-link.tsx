"use client";

import type { MouseEvent, ReactNode } from "react";

import { OPENED_FROM_BOARD_KEY, cardHref } from "@/lib/boards/card-url";

type Props = { boardPath: string; cardId: string; className?: string; children: ReactNode };

/**
 * Link that opens the card modal. It is a real link to `?card=<id>` (works
 * without JS, can be opened in a new tab or copied), but a plain click only
 * pushes a history entry: Next.js syncs `useSearchParams` with it, so the modal
 * opens instantly without re-rendering the board on the server. The entry is
 * marked so closing the modal can go Back instead of adding another entry.
 */
export function CardLink({ boardPath, cardId, className, children }: Props) {
  const href = cardHref(boardPath, "", cardId);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return; // let the browser open a new tab/window
    }
    event.preventDefault();
    const url = cardHref(window.location.pathname, window.location.search, cardId);
    window.history.pushState({ [OPENED_FROM_BOARD_KEY]: true }, "", url);
  }

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
