import { ListChecksIcon } from "lucide-react";

import { subtaskProgress } from "@/lib/subtasks/progress";
import type { Subtask } from "@/lib/subtasks/subtask";
import { cn } from "@/lib/utils";

/**
 * Checklist count on a card face ("2/4"), green once every subtask is done.
 * Nothing when the card has no subtasks. The count is spelled out for screen
 * readers, and "done" is never conveyed by colour alone (the text says it).
 */
export function SubtaskBadge({ subtasks }: { subtasks: readonly Subtask[] }) {
  if (subtasks.length === 0) return null;
  const { done, total } = subtaskProgress(subtasks);
  const complete = done === total;
  const description = `Subtasks: ${done} of ${total} done`;

  return (
    <span
      title={description}
      data-subtasks-complete={complete || undefined}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm px-1 text-xs font-medium tabular-nums",
        complete && "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200",
      )}
    >
      <ListChecksIcon className="size-3.5" aria-hidden />
      <span aria-hidden>
        {done}/{total}
      </span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
