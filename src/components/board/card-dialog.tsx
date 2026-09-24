"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hrefWithoutCard, selectedCardId, wasOpenedFromBoard } from "@/lib/boards/card-url";
import type { CardDetail } from "@/lib/boards/view-model";

import { CardDetails } from "./card-details";

type Shown = { id: string; card: CardDetail | null };

/**
 * The card modal. Its open state IS the URL (`?card=<id>`), so reload, share
 * and Back all work. Opening pushes a history entry (see CardLink); closing
 * goes Back when that entry was pushed from the board, and otherwise (direct
 * link, reload) replaces the URL without the param so closing never leaves
 * the app.
 *
 * Delivery 4 makes this editable: `CardDetails` is the piece that will turn
 * into a form; this component only owns URL state.
 */
export function CardDialog({ cards }: { cards: CardDetail[] }) {
  const searchParams = useSearchParams();
  const cardId = selectedCardId(searchParams);
  const card = cardId === null ? null : (cards.find((c) => c.id === cardId) ?? null);

  // Keep showing the last card while the close animation runs (the URL has
  // already dropped the param by then).
  const [shown, setShown] = useState<Shown | null>(null);
  if (cardId !== null && (shown?.id !== cardId || shown.card !== card)) {
    setShown({ id: cardId, card });
  }

  function close() {
    if (wasOpenedFromBoard(window.history.state)) {
      window.history.back();
    } else {
      window.history.replaceState(
        null,
        "",
        hrefWithoutCard(window.location.pathname, window.location.search),
      );
    }
  }

  return (
    <Dialog
      open={cardId !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-xl">
        {shown?.card ? (
          <CardDetails card={shown.card} />
        ) : (
          <DialogHeader>
            <DialogTitle className="text-lg">Card not found</DialogTitle>
            <DialogDescription>
              This card doesn&apos;t exist on this board, or it has been archived.
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
