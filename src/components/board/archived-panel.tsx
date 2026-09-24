"use client";

import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { type MouseEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { deleteCard, restoreCard } from "@/lib/boards/actions";
import { formatTimestampDate } from "@/lib/boards/due-date";
import type { ArchivedCard } from "@/lib/boards/view-model";

import { useBoard } from "./board-context";

/**
 * Archived cards, from the board header. Owners and editors can restore a
 * card or delete it permanently (the only way to delete a card).
 */
export function ArchivedPanel() {
  const { view, boardId, permissions, now, mutate } = useBoard();
  const cards = view.archivedCards;
  const columnTitles = new Map(view.columns.map((c) => [c.id, c.title]));
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The card stays set while the dialog animates closed, so its title doesn't blank out.
  const [toDelete, setToDelete] = useState<ArchivedCard | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const deleted = useRef(false);

  /** The clicked item is about to leave the list: move focus to a neighbour first. */
  function focusNeighbour(event: MouseEvent<HTMLElement>) {
    const item = event.currentTarget.closest("li");
    const neighbour = item?.nextElementSibling ?? item?.previousElementSibling;
    const button = neighbour?.querySelector<HTMLButtonElement>("button");
    if (button) button.focus();
    else titleRef.current?.focus();
  }

  function handleRestore(event: MouseEvent<HTMLElement>, card: ArchivedCard) {
    focusNeighbour(event);
    mutate(
      { type: "restoreCard", cardId: card.id },
      () => restoreCard({ boardId, cardId: card.id }),
      {
        onSuccess: () => toast.success(`Restored “${card.title}”`),
      },
    );
  }

  function handleDelete(card: ArchivedCard) {
    startDelete(async () => {
      let result;
      try {
        result = await deleteCard({ boardId, cardId: card.id });
      } catch {
        result = { ok: false as const, error: GENERIC_ERROR };
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      deleted.current = true;
      toast.success(`Deleted “${card.title}”`);
      startDelete(() => setConfirmOpen(false));
    });
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" aria-label={`Archived cards (${cards.length})`} />
        }
      >
        <ArchiveIcon aria-hidden />
        Archived
        <span className="rounded-sm bg-muted px-1 text-xs tabular-nums" aria-hidden>
          {cards.length}
        </span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
            Archived cards
          </SheetTitle>
          <SheetDescription>
            {permissions.canEdit
              ? "Restore a card to put it back in its column. Deleting a card is permanent."
              : "Cards that were taken off the board."}
          </SheetDescription>
        </SheetHeader>

        {cards.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No archived cards.</p>
        ) : (
          <ul aria-label="Archived cards" className="grid gap-2 overflow-y-auto p-4">
            {cards.map((card) => {
              const titleId = `archived-${card.id}`;
              return (
                <li key={card.id} className="grid gap-2 rounded-lg border bg-card p-3">
                  <div className="grid gap-0.5">
                    <p id={titleId} className="text-sm font-medium break-words">
                      {card.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      From {columnTitles.get(card.columnId) ?? "a deleted column"} · archived{" "}
                      <time dateTime={card.archivedAt}>
                        {formatTimestampDate(card.archivedAt, now)}
                      </time>
                    </p>
                  </div>
                  {permissions.canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-describedby={titleId}
                        onClick={(event) => handleRestore(event, card)}
                      >
                        <ArchiveRestoreIcon aria-hidden />
                        Restore
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-describedby={titleId}
                        onClick={() => {
                          deleted.current = false;
                          setToDelete(card);
                          setConfirmOpen(true);
                        }}
                      >
                        <Trash2Icon aria-hidden />
                        Delete permanently
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!deleting) setConfirmOpen(open);
          }}
        >
          <AlertDialogContent
            // After a delete the button that opened this dialog is gone.
            finalFocus={() => (deleted.current ? titleRef.current : true)}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="break-words">
                Delete “{toDelete?.title}” permanently?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The card and its description are deleted for good. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={deleting}
                // Keep focus on the button while it is busy (a disabled button drops focus).
                focusableWhenDisabled
                onClick={() => toDelete && handleDelete(toDelete)}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
