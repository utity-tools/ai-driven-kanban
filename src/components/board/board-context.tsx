"use client";

import { createContext, use } from "react";

import type { ActionResult } from "@/lib/boards/action-result";
import type { BoardUpdate } from "@/lib/boards/board-updates";
import type { BoardPermissions } from "@/lib/boards/permissions";
import type { BoardView } from "@/lib/boards/view-model";

export type MutateOptions = {
  /** Runs after the server confirmed the change (e.g. an "Undo" toast). */
  onSuccess?: () => void;
};

export type BoardContextValue = {
  /** The board with pending optimistic changes applied. */
  view: BoardView;
  boardId: string;
  boardPath: string;
  permissions: BoardPermissions;
  /** Request time, from the server. */
  now: Date;
  /**
   * The viewer's local date ("YYYY-MM-DD"): due-date status is relative to it.
   * `null` on the server and during hydration (see useToday).
   */
  today: string | null;
  /** The server's (UTC) date: only used to format due dates while `today` is unknown. */
  serverToday: string;
  /**
   * Runs a Server Action in a transition. `update` is applied to `view` at
   * once and dropped when the action ends (the fresh server board replaces
   * it); on failure the user gets a toast and the UI is back to the server state.
   */
  mutate: (
    update: BoardUpdate | null,
    action: () => Promise<ActionResult>,
    options?: MutateOptions,
  ) => void;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const value = use(BoardContext);
  if (!value) throw new Error("useBoard must be used inside <BoardWorkspace>.");
  return value;
}
