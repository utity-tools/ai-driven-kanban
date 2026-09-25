"use client";

import { SparklesIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPoints, spellPoints } from "@/lib/subtasks/estimates";
import { SUBTASK_TITLE_MAX } from "@/lib/subtasks/schemas";
import { type Subtask, isDone } from "@/lib/subtasks/subtask";
import { cn } from "@/lib/utils";

import { InlineEdit } from "./inline-edit";
import { SubtaskEstimatePicker } from "./subtask-estimate-picker";

export type SubtaskHandlers = {
  onToggle: (subtask: Subtask, completed: boolean) => void;
  onRename: (subtask: Subtask, title: string) => void;
  onEstimate: (subtask: Subtask, estimate: Subtask["estimate"]) => void;
  onDelete: (subtask: Subtask) => void;
};

type Props = {
  subtask: Subtask;
  /** Editing controls; without them the row is read-only. */
  handlers?: SubtaskHandlers;
  /** Drag handle (sortable lists only). */
  handle?: ReactNode;
};

/**
 * One checklist row: done checkbox, title (click to rename), an "AI" marker
 * for accepted AI proposals, the estimate and a delete button. Read-only rows
 * keep the same layout with a read-only checkbox and a plain estimate.
 */
export function SubtaskItem({ subtask, handlers, handle }: Props) {
  const done = isDone(subtask);

  return (
    <div className="flex min-h-8 items-start gap-2 py-1">
      {handle}
      <Checkbox
        aria-label={subtask.title}
        checked={done}
        readOnly={!handlers}
        onCheckedChange={(checked) => handlers?.onToggle(subtask, checked)}
        data-subtask-checkbox=""
        className="mt-1"
      />
      <div
        className={cn(
          "min-w-0 flex-1 text-sm leading-6 break-words",
          done && "text-muted-foreground line-through",
        )}
      >
        {handlers ? (
          <InlineEdit
            value={subtask.title}
            label="Subtask title"
            hint="Rename subtask"
            maxLength={SUBTASK_TITLE_MAX}
            multiline
            // text-decoration doesn't reach into the (inline-block) button from its parent.
            className={done ? "line-through" : undefined}
            onSave={(title) => handlers.onRename(subtask, title)}
          />
        ) : (
          subtask.title
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {subtask.source === "ai" ? <AiMarker /> : null}
        {handlers ? (
          <SubtaskEstimatePicker
            estimate={subtask.estimate}
            subtaskTitle={subtask.title}
            onChange={(estimate) => handlers.onEstimate(subtask, estimate)}
          />
        ) : subtask.estimate !== null ? (
          <Badge variant="secondary" className="tabular-nums">
            <span aria-hidden>{formatPoints(subtask.estimate)}</span>
            <span className="sr-only">Estimate: {spellPoints(subtask.estimate)}</span>
          </Badge>
        ) : null}
        {handlers ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete subtask ${subtask.title}`}
            title="Delete subtask"
            onClick={() => handlers.onDelete(subtask)}
            className="text-muted-foreground hover:text-destructive"
          >
            <XIcon aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AiMarker() {
  return (
    <Badge variant="outline" title="Proposed by AI" className="text-muted-foreground">
      <SparklesIcon aria-hidden />
      <span aria-hidden>AI</span>
      <span className="sr-only">Proposed by AI</span>
    </Badge>
  );
}
