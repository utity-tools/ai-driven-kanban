"use client";

import { EllipsisIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GENERIC_ERROR } from "@/lib/boards/action-result";
import { deleteBoard } from "@/lib/boards/actions";
import { boardDeletionSummary } from "@/lib/boards/copy";
import { cardCount } from "@/lib/boards/view-model";

import { useBoard } from "./board-context";

/** Board-level actions. Only rendered for owners (the only ones who can delete a board). */
export function BoardMenu() {
  const { view, boardId } = useBoard();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteBoard({ boardId });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Board deleted");
        router.replace("/boards");
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Board actions" />}
        >
          <EllipsisIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2Icon aria-hidden />
            Delete board…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              Delete “{view.board.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {boardDeletionSummary({
                columns: view.columns.length,
                cards: cardCount(view) + view.archivedCards.length,
              })}
            </AlertDialogDescription>
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
              {pending ? "Deleting…" : "Delete board"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
