"use client";

import { Suspense, startTransition, useOptimistic } from "react";
import { toast } from "sonner";

import { useToday } from "@/hooks/use-today";
import { type ActionResult, GENERIC_ERROR } from "@/lib/boards/action-result";
import { type BoardUpdate, applyBoardUpdate } from "@/lib/boards/board-updates";
import { toUtcDateOnly } from "@/lib/boards/due-date";
import type { BoardPermissions } from "@/lib/boards/permissions";
import type { BoardView } from "@/lib/boards/view-model";

import { BoardColumns } from "./board-columns";
import { BoardContext, type BoardContextValue, type MutateOptions } from "./board-context";
import { BoardHeader } from "./board-header";
import { CardDialog } from "./card-dialog";

type Props = {
  view: BoardView;
  /** ISO timestamp of the request. */
  now: string;
  permissions: BoardPermissions;
};

/**
 * The interactive board. The server renders the data (`view`, the user's
 * permissions); this component layers optimistic updates on top so edits show
 * up instantly, and every Server Action response brings the fresh board back.
 */
export function BoardWorkspace({ view, now, permissions }: Props) {
  const [optimisticView, applyOptimistic] = useOptimistic(view, applyBoardUpdate);
  const today = useToday();

  function mutate(
    update: BoardUpdate | null,
    action: () => Promise<ActionResult>,
    options?: MutateOptions,
  ) {
    startTransition(async () => {
      if (update) applyOptimistic(update);
      let result: ActionResult;
      try {
        result = await action();
      } catch {
        // Network failure or a new deployment: same message, the UI reverts.
        result = { ok: false, error: GENERIC_ERROR };
      }
      if (result.ok) options?.onSuccess?.();
      else toast.error(result.error);
    });
  }

  const value: BoardContextValue = {
    view: optimisticView,
    boardId: view.board.id,
    boardPath: `/boards/${view.board.id}`,
    permissions,
    now: new Date(now),
    today,
    serverToday: toUtcDateOnly(new Date(now)),
    mutate,
  };

  return (
    <BoardContext value={value}>
      <div className="flex flex-1 flex-col gap-5 pt-6">
        <BoardHeader />
        <BoardColumns />
        {/* The modal reads ?card= on the client, so opening a card needs no server round trip. */}
        <Suspense fallback={null}>
          <CardDialog />
        </Suspense>
      </div>
    </BoardContext>
  );
}
