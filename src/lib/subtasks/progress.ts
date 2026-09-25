import { formatPoints } from "./estimates";
import { type Subtask, isDone } from "./subtask";

type Countable = Pick<Subtask, "completedAt" | "estimate">;

export type SubtaskProgress = {
  done: number;
  total: number;
  /** Sum of the estimates (unestimated subtasks count 0). */
  totalPoints: number;
  /** Points of the done subtasks. */
  donePoints: number;
  /** Points of the subtasks still open. */
  remainingPoints: number;
  /** Share of subtasks done, 0-100, rounded down so 100 means all done. */
  percent: number;
};

export function subtaskProgress(subtasks: readonly Countable[]): SubtaskProgress {
  let done = 0;
  let totalPoints = 0;
  let donePoints = 0;
  for (const subtask of subtasks) {
    const points = subtask.estimate ?? 0;
    totalPoints += points;
    if (isDone(subtask)) {
      done += 1;
      donePoints += points;
    }
  }
  const total = subtasks.length;
  return {
    done,
    total,
    totalPoints,
    donePoints,
    remainingPoints: totalPoints - donePoints,
    percent: total === 0 ? 0 : Math.floor((done / total) * 100),
  };
}

/** "2/4 · 5 of 10 pts", or "2/4" when nothing is estimated. */
export function progressSummary(progress: SubtaskProgress): string {
  const count = `${progress.done}/${progress.total}`;
  if (progress.totalPoints === 0) return count;
  return `${count} · ${progress.donePoints} of ${formatPoints(progress.totalPoints)}`;
}

/**
 * The same, spelled out for assistive tech: "2 of 4 subtasks done. 5 of 10
 * story points done, 5 remaining."
 */
export function progressDescription(progress: SubtaskProgress): string {
  const noun = progress.total === 1 ? "subtask" : "subtasks";
  const count = `${progress.done} of ${progress.total} ${noun} done.`;
  if (progress.totalPoints === 0) return count;
  return `${count} ${progress.donePoints} of ${progress.totalPoints} story points done, ${progress.remainingPoints} remaining.`;
}
