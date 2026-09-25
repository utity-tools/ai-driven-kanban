"use client";

import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { DueInfo } from "@/lib/boards/due-date";
import type { CardSummary } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

import { CardFace } from "./card-face";

type Props = { boardPath: string; card: CardSummary; due: DueInfo | null };

/**
 * A card editors can drag. With the mouse or touch the whole card is the drag
 * source (a 5px move or a long press starts the drag, so a click or a tap
 * still opens the card). With the keyboard the card's link is the handle:
 * Space picks the card up, while Enter keeps opening it (see
 * BoardKeyboardSensor). No extra button, so a card stays a single tab stop.
 */
export function SortableCard({ boardPath, card, due }: Props) {
  const { active } = useDndContext();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card" },
    // While a column is dragged, cards are not drop targets.
    disabled: { draggable: false, droppable: active?.data.current?.type === "column" },
  });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("motion-reduce:transition-none!", isDragging && "opacity-40")}
    >
      <CardFace
        boardPath={boardPath}
        card={card}
        due={due}
        linkRef={setActivatorNodeRef}
        // Only the instructions: the link keeps its role and name.
        linkDescribedBy={attributes["aria-describedby"]}
      />
    </li>
  );
}
