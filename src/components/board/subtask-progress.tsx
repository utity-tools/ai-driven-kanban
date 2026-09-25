import { Progress } from "@/components/ui/progress";
import {
  type SubtaskProgress as Progression,
  progressDescription,
  progressSummary,
} from "@/lib/subtasks/progress";

/**
 * "2/4 · 5 of 10 pts" with a bar. The bar is a progressbar whose value text
 * spells everything out, so the abbreviated summary is hidden from assistive
 * tech rather than read twice.
 */
export function SubtaskProgress({ progress }: { progress: Progression }) {
  const description = progressDescription(progress);
  return (
    <div className="flex items-center gap-3">
      <p aria-hidden className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {progressSummary(progress)}
      </p>
      <Progress
        value={progress.percent}
        aria-label="Subtask progress"
        getAriaValueText={() => description}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
