"use client";

import { useRef, useState, useTransition } from "react";
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
import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { deleteColumn } from "@/lib/boards/actions";
import { columnCardCounts, neighborColumnId } from "@/lib/boards/board-updates";
import { columnDeletionSummary } from "@/lib/boards/copy";

import { useBoard } from "./board-context";

type Props = { columnId: string | null; onClose: () => void };

/**
 * Confirmation for deleting a column. Rendered once per board (not inside the
 * column) so it survives the column disappearing, and can then move focus to
 * a neighbouring column instead of losing it.
 */
export function DeleteColumnDialog({ columnId, onClose }: Props) {
  const { view, boardId } = useBoard();
  const column = view.columns.find((c) => c.id === columnId) ?? null;

  // Keep showing the last column while the dialog animates closed.
  const [shown, setShown] = useState(column);
  if (column !== null && column !== shown) setShown(column);

  const [pending, startTransition] = useTransition();
  const focusAfterDelete = useRef<string | null | undefined>(undefined);

  const counts = shown ? columnCardCounts(view, shown.id) : { total: 0, archived: 0 };

  function handleDelete() {
    if (!shown) return;
    const target = { columnId: shown.id, neighbor: neighborColumnId(view, shown.id) };
    startTransition(async () => {
      let result;
      try {
        result = await deleteColumn({ boardId, columnId: target.columnId });
      } catch {
        result = { ok: false as const, error: GENERIC_ERROR };
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      focusAfterDelete.current = target.neighbor;
      toast.success(`Deleted column “${shown.title}”`);
      startTransition(onClose);
    });
  }

  function finalFocus(): HTMLElement | boolean {
    const neighbor = focusAfterDelete.current;
    focusAfterDelete.current = undefined;
    if (neighbor === undefined) return true; // cancelled: back to the menu button
    return (
      (neighbor &&
        document.querySelector<HTMLElement>(
          `[data-column-id="${neighbor}"] [data-column-menu-trigger]`,
        )) ||
      document.querySelector<HTMLElement>("[data-add-column-trigger]") ||
      true
    );
  }

  return (
    <AlertDialog
      open={column !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Delete column “{shown?.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription>{columnDeletionSummary(counts)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
            // Keep focus on the button while it is busy (a disabled button drops focus).
            focusableWhenDisabled
          >
            {pending ? "Deleting…" : "Delete column"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
