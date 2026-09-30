import { CheckIcon } from "lucide-react";

import type { VisibleOutcome } from "@/lib/ai/visible-outcome";
import { cn } from "@/lib/utils";

/**
 * The AI panels' live region, always mounted so every change is announced (a freshly
 * mounted one often isn't). It is the only announcer: when there is an outcome to keep
 * on screen the same element turns visible, so it is read exactly once.
 */
export function AiStatus({
  announcement,
  outcome,
}: {
  announcement: string;
  outcome: VisibleOutcome | null;
}) {
  return (
    <p
      role="status"
      className={cn(
        outcome ? "flex items-center gap-1.5 text-xs" : "sr-only",
        outcome?.tone === "success" ? "text-success" : "text-muted-foreground",
      )}
    >
      {outcome?.tone === "success" ? <CheckIcon aria-hidden className="size-3.5 shrink-0" /> : null}
      {announcement}
    </p>
  );
}
