import { compareByPosition } from "@/lib/boards/ordering";
import type { Tables } from "@/lib/db/types";

import { type Estimate, toEstimate } from "./estimates";

export type SubtaskSource = "manual" | "ai";

/** A checklist item of a card, as the UI uses it. */
export type Subtask = {
  id: string;
  title: string;
  estimate: Estimate | null;
  /** Fractional-indexing key, ordered like cards (see ordering.ts). */
  position: string;
  /** When it was checked; `null` = not done. */
  completedAt: string | null;
  /** Who proposed it: typed by a user, or an accepted AI proposal. */
  source: SubtaskSource;
};

/** The columns the board query selects (see queries.ts). */
export type SubtaskRow = Pick<
  Tables<"card_subtasks">,
  "id" | "title" | "estimate" | "position" | "completed_at" | "source"
>;

export function toSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    title: row.title,
    estimate: toEstimate(row.estimate),
    position: row.position,
    completedAt: row.completed_at,
    source: row.source === "ai" ? "ai" : "manual",
  };
}

/** Rows in checklist order (position, then id), whatever order they arrive in. */
export function toSubtasks(rows: readonly SubtaskRow[]): Subtask[] {
  return rows.map(toSubtask).sort(compareByPosition);
}

export function isDone(subtask: Pick<Subtask, "completedAt">): boolean {
  return subtask.completedAt !== null;
}
