import { CheckIcon, ClockIcon } from "lucide-react";

import { DUE_STATUS_LABEL, type DueInfo } from "@/lib/boards/due-date";
import { cn } from "@/lib/utils";

const STYLES: Record<DueInfo["status"], string> = {
  overdue: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
  "due-soon": "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100",
  done: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200",
  upcoming: "bg-secondary text-secondary-foreground",
  // Before the viewer's date is known (server render, hydration): neutral, no claim.
  unknown: "bg-secondary text-secondary-foreground",
};

/**
 * Due date with its status: red when overdue, amber when due soon (today or
 * tomorrow), green with a check when done, neutral otherwise (and for the
 * instant before the viewer's local date is known, see useToday). The status is also spelled out for
 * screen readers (and visibly when `showStatus`), never conveyed by colour alone.
 */
export function DueBadge({
  due,
  showStatus = false,
  className,
}: {
  due: DueInfo;
  showStatus?: boolean;
  className?: string;
}) {
  const Icon = due.status === "done" ? CheckIcon : ClockIcon;
  const status = DUE_STATUS_LABEL[due.status];

  return (
    <span
      data-due-status={due.status}
      title={status}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap",
        STYLES[due.status],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className={showStatus ? undefined : "sr-only"}>{status}: </span>
      <time dateTime={due.dueOn}>{due.text}</time>
    </span>
  );
}
