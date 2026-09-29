"use client";

import { GitForkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { holdsUpLabel } from "@/lib/boards/copy";
import { topBottlenecks } from "@/lib/boards/dependencies";

import { useBoard } from "./board-context";
import { CardLink } from "./card-link";

/**
 * "Bottlenecks" button of the board header (every member sees it): the cards
 * that hold up the most unresolved cards. Hidden when nothing is held up.
 */
export function BottlenecksPanel() {
  const { view, boardPath } = useBoard();
  const items = topBottlenecks(view);
  if (items.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <GitForkIcon aria-hidden />
        Bottlenecks
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Bottlenecks</PopoverTitle>
          <PopoverDescription>Cards that hold up the most unfinished work.</PopoverDescription>
        </PopoverHeader>
        <ul aria-label="Bottlenecks" className="grid gap-1.5">
          {items.map((item) => (
            <li key={item.cardId} className="grid gap-0.5">
              <CardLink
                boardPath={boardPath}
                cardId={item.cardId}
                className="w-fit rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {item.title}
              </CardLink>
              <span className="text-xs text-muted-foreground">
                {holdsUpLabel(item.blockedCount)}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
