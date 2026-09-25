"use client";

import { GripVerticalIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Button>, "children" | "aria-label"> & {
  /** Accessible name, e.g. "Move card Fix login". */
  label: string;
};

/**
 * Grip button that picks up a card or a column. With the keyboard: Space or
 * Enter picks it up, arrows move it, Space/Enter drops it, Escape cancels.
 * `touch-action: none` so a drag started here never scrolls the page.
 */
export function DragHandle({ label, className, ...props }: Props) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      {...props}
      aria-label={label}
      title={label}
      className={cn(
        "cursor-grab touch-none text-muted-foreground aria-pressed:cursor-grabbing",
        className,
      )}
    >
      <GripVerticalIcon aria-hidden />
    </Button>
  );
}
