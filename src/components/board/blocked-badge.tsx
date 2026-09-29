import { LockIcon } from "lucide-react";

import { blockedByLabel } from "@/lib/boards/copy";

/** Lock shown on a card that waits on unresolved blockers. Nothing when `count` is 0. */
export function BlockedBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = blockedByLabel(count);

  return (
    <span
      title={label}
      className="inline-flex h-5 items-center gap-1 rounded-sm bg-amber-100 px-1 text-xs font-medium text-amber-900 tabular-nums dark:bg-amber-400/20 dark:text-amber-100"
    >
      <LockIcon className="size-3.5" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
