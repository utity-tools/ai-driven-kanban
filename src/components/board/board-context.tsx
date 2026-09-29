"use client";

import { createContext, use } from "react";

import type { ActionResult } from "@/lib/boards/action-result";
import type { BoardUpdate } from "@/lib/boards/board-updates";
import type { BoardPermissions } from "@/lib/boards/permissions";
import type { BoardView, Person } from "@/lib/boards/view-model";
import type { PendingInvite } from "@/lib/invites/pending";

/** Who is looking at the board, for the Members dialog. */
export type Membership = {
  userId: string;
  /** Anonymous demo accounts cannot invite people or join boards. */
  isDemo: boolean;
  /** The board's creator (boards.owner_id): always an owner, cannot leave. */
  creatorId: string;
  /** Invites that can still be used; empty unless the viewer is an owner. */
  pendingInvites: PendingInvite[];
};

export type MutateOptions = {
  /** Runs after the server confirmed the change (e.g. an "Undo" toast). */
  onSuccess?: () => void;
  /**
   * Runs with the safe error message when the action fails, instead of the
   * default error toast (for UIs that show the error in place).
   */
  onError?: (error: string) => void;
};

export type BoardContextValue = {
  /** The board with pending optimistic changes applied. */
  view: BoardView;
  /** Unresolved blocker count per blocked card, computed once for the whole board. */
  blockerCounts: ReadonlyMap<string, number>;
  boardId: string;
  boardPath: string;
  permissions: BoardPermissions;
  membership: Membership;
  /** Whether AI subtask suggestions are switched on for this deployment. */
  aiDecompositionEnabled: boolean;
  /** Other members viewing the board right now (realtime presence). */
  viewers: Person[];
  /** Live updates are down for now; the board still works but won't auto-refresh. */
  realtimePaused: boolean;
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
  /**
   * Runs a board-changing Server Action that does not go through `mutate`
   * (delete/leave board, delete column...), so the realtime echo of our own
   * change is recognised. Settles when the action does, also on failure. `exits`: the
   * action takes the viewer off the board (leave, delete), which navigates by itself.
   */
  trackLocalMutation: <T>(fn: () => Promise<T>, options?: { exits?: boolean }) => Promise<T>;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const value = use(BoardContext);
  if (!value) throw new Error("useBoard must be used inside <BoardWorkspace>.");
  return value;
}
