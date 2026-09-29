"use client";

import { CircleCheckIcon, EllipsisIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Per-column actions (keyboard: Enter/Space opens, arrows move, Escape closes). */
export function ColumnMenu({
  title,
  isDone,
  onToggleDone,
  onDelete,
}: {
  title: string;
  isDone: boolean;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for column ${title}`}
            data-column-menu-trigger=""
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuItem onClick={onToggleDone}>
          <CircleCheckIcon aria-hidden />
          {isDone ? "Unmark as done column" : "Mark as done column"}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon aria-hidden />
          Delete column…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
