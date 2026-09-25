"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archiveCard, restoreCard } from "@/lib/boards/actions";
import { neighborCardId } from "@/lib/boards/board-updates";
import { hrefWithoutCard, selectedCardId, wasOpenedFromBoard } from "@/lib/boards/card-url";
import { type CardDetail, buildCardDetails } from "@/lib/boards/view-model";

import { useBoard } from "./board-context";
import { CardDetails } from "./card-details";
import { isSubtaskDragActive } from "./sortable-subtask-list";

/**
 * The card modal. Its open state IS the URL (`?card=<id>`), so reload, share
 * and Back all work. Opening pushes a history entry (see CardLink); closing
 * goes Back when that entry was pushed from the board, and otherwise (direct
 * link, reload) replaces the URL without the param so closing never leaves
 * the app.
 *
 * Archived cards open read-only (with Restore); archiving from here closes
 * the modal and moves focus to a neighbouring card, since the card itself
 * leaves the board.
 */
export function CardDialog() {
  const { view, boardId, mutate } = useBoard();
  const searchParams = useSearchParams();
  const cardId = selectedCardId(searchParams);

  // Keep showing the last card while the close animation runs (the URL has
  // already dropped the param by then).
  const [lastId, setLastId] = useState<string | null>(null);
  if (cardId !== null && cardId !== lastId) setLastId(cardId);
  const shownId = cardId ?? lastId;
  const card =
    shownId === null ? null : (buildCardDetails(view).find((c) => c.id === shownId) ?? null);

  // Where focus goes when the modal closes after archiving (the card is gone).
  const focusAfterArchive = useRef<{ columnId: string; neighbor: string | null } | null>(null);

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

  function restore(target: CardDetail) {
    mutate({ type: "restoreCard", cardId: target.id }, () =>
      restoreCard({ boardId, cardId: target.id }),
    );
  }

  function archive(target: CardDetail) {
    focusAfterArchive.current = {
      columnId: target.columnId,
      neighbor: neighborCardId(view, target.id),
    };
    mutate(
      { type: "archiveCard", cardId: target.id, archivedAt: new Date().toISOString() },
      () => archiveCard({ boardId, cardId: target.id }),
      {
        onSuccess: () =>
          toast.success(`Archived “${target.title}”`, {
            action: { label: "Undo", onClick: () => restore(target) },
          }),
      },
    );
    close();
  }

  function finalFocus(): HTMLElement | boolean {
    const target = focusAfterArchive.current;
    focusAfterArchive.current = null;
    if (!target) return true; // back to the card link that opened the modal
    return (
      (target.neighbor &&
        document.querySelector<HTMLElement>(`[data-card-id="${target.neighbor}"] a`)) ||
      document.querySelector<HTMLElement>(
        `[data-column-id="${target.columnId}"] [data-add-card-trigger]`,
      ) ||
      true
    );
  }

  return (
    <Dialog
      open={cardId !== null}
      onOpenChange={(open, details) => {
        if (open) return;
        // Escape while dragging a subtask only cancels the drag.
        if (details.reason === "escape-key" && isSubtaskDragActive()) {
          details.cancel();
          return;
        }
        close();
      }}
    >
      <DialogContent
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-xl"
      >
        {card ? (
          <CardDetails
            // Reset any open editor when switching cards.
            key={card.id}
            card={card}
            onArchive={archive}
            onRestore={restore}
          />
        ) : (
          <DialogHeader>
            <DialogTitle className="text-lg">Card not found</DialogTitle>
            <DialogDescription>
              This card doesn&apos;t exist on this board, or it has been deleted.
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
