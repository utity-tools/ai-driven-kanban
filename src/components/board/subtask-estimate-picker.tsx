"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ESTIMATES,
  type Estimate,
  formatPoints,
  spellPoints,
  toEstimate,
} from "@/lib/subtasks/estimates";
import { cn } from "@/lib/utils";

const NONE = "none";

type Props = {
  estimate: Estimate | null;
  /** The subtask's title, for the button's accessible name. */
  subtaskTitle: string;
  onChange: (estimate: Estimate | null) => void;
};

/**
 * Compact story-point picker: a small button ("3 pts", or "Estimate" when
 * unset) opening a menu of the Fibonacci values and "No estimate"
 * (keyboard: Enter/Space opens, arrows move, Enter picks, Escape closes).
 */
export function SubtaskEstimatePicker({ estimate, subtaskTitle, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Estimate for ${subtaskTitle}: ${estimate === null ? "none" : spellPoints(estimate)}`}
            className={cn(
              "shrink-0 tabular-nums",
              estimate === null
                ? "text-muted-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          />
        }
      >
        {estimate === null ? "Estimate" : formatPoints(estimate)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-36">
        <DropdownMenuRadioGroup
          value={estimate === null ? NONE : String(estimate)}
          onValueChange={(value: string) => {
            const next = value === NONE ? null : toEstimate(Number(value));
            if (next !== estimate) onChange(next);
          }}
        >
          {ESTIMATES.map((points) => (
            <DropdownMenuRadioItem key={points} value={String(points)} closeOnClick>
              {formatPoints(points)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={NONE} closeOnClick>
            No estimate
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
