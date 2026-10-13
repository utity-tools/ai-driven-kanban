"use client";

import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  useDndContext,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { useId, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { moveCard, moveColumn } from "@/lib/boards/actions";
import {
  type BoardLayout,
  applyLayout,
  columnIdOf,
  dropResult,
  isColumnId,
  layoutOf,
  moveInLayout,
} from "@/lib/boards/drag";
import {
  DRAG_INSTRUCTIONS,
  cancelledMessage,
  droppedMessage,
  movedMessage,
  pickedUpMessage,
} from "@/lib/boards/drag-announcements";
import { type ColumnSpan, pointerCandidateIds } from "@/lib/boards/drag-target";
import { describeDue } from "@/lib/boards/due-date";
import type { BoardView, ColumnView } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

import { AddColumn } from "./add-column";
import { BoardColumn, COLUMN_ITEM_CLASS, ColumnsList } from "./board-column";
import { useBoard } from "./board-context";
import { CardFace } from "./card-face";
import { DragHandle } from "./drag-handle";

/** What a drag needs outside React state: read by the screen-reader announcements. */
type DragSession = {
  /** The board when the drag started (titles for the announcements). */
  view: BoardView;
  /** Order when the drag started: a drop back there is a no-op. */
  initial: BoardLayout;
  /** Current order, including cards moved to another column while dragging. */
  layout: BoardLayout;
  /** Order of the last "is now in …" announcement: only real moves are announced. */
  announced: BoardLayout;
};

const [keyboardActivator] = KeyboardSensor.activators;

/**
 * The keyboard sensor, except that Enter on a card (its link) is left alone:
 * it opens the card. Space picks a card up; Space or Enter picks a column up
 * (from its grip button).
 */
class BoardKeyboardSensor extends KeyboardSensor {
  static override activators: typeof KeyboardSensor.activators = [
    {
      eventName: "onKeyDown",
      handler: (event, options, context) => {
        if (event.nativeEvent.code === "Enter" && context.active.data.current?.type === "card") {
          return false;
        }
        return keyboardActivator?.handler(event, options, context) ?? false;
      },
    },
  ];
}

/**
 * Columns only collide with columns (cards are disabled as drop targets while
 * a column is dragged). A card dragged by a pointer goes where the pointer is:
 * the column under it by x, then the closest card of that column to the
 * pointer (or the column itself if empty). The card's own rect is no guide on
 * a phone, where it is wider than the visible part of the next column, and
 * following the pointer keeps the target stable when column heights change.
 * Without a pointer (keyboard) or off the columns, the corners of the card
 * pick among the cards and empty columns.
 */
function collisionDetectionFor(
  current: BoardLayout | null,
  columnsList: HTMLElement | null,
): CollisionDetection {
  return (args) => {
    if (args.active.data.current?.type === "column") return closestCenter(args);

    const { pointerCoordinates, droppableContainers } = args;
    if (pointerCoordinates && current) {
      const spans = measureColumnSpans(columnsList);
      const candidates = pointerCandidateIds(current, spans, pointerCoordinates.x);
      if (candidates) {
        const { x, y } = pointerCoordinates;
        const ids = new Set(candidates);
        return closestCenter({
          ...args,
          collisionRect: { top: y, bottom: y, left: x, right: x, width: 0, height: 0 },
          droppableContainers: droppableContainers.filter((container) =>
            ids.has(String(container.id)),
          ),
        });
      }
    }
    return closestCorners(args);
  };
}

/**
 * Each column's horizontal extent, measured now from the DOM (viewport
 * coordinates, like the pointer's). Not from dnd-kit's rects: a column with
 * cards is not a drop target, so it has none, and the card just moved into a
 * column is not measured yet, which would hide that column for a moment and
 * send the card back (and forth).
 */
function measureColumnSpans(list: HTMLElement | null): ColumnSpan[] {
  if (!list) return [];
  return Array.from(list.querySelectorAll<HTMLElement>("[data-column-id]"), (node) => {
    const { left, right } = node.getBoundingClientRect();
    return { id: node.dataset.columnId ?? "", left, right };
  });
}

// Auto-scroll of the columns list while dragging. dnd-kit's defaults (a 20%
// edge band, acceleration 10) cover the whole visible sliver of the next column
// on a phone and fly to the last column in a blink. A 10% band on x leaves the
// sliver as a drop zone (only the very edge scrolls), and half the acceleration
// makes it a slow crawl. y keeps 20% for tall columns.
const autoScroll = { threshold: { x: 0.1, y: 0.2 }, acceleration: 5 };

// Items move between lists while dragging: keep their rects fresh.
const measuring = { droppable: { strategy: MeasuringStrategy.Always } };

/**
 * The editable board with drag and drop: cards within and across columns
 * (including empty ones), columns sideways. While dragging, the order lives in
 * local state; on drop one optimistic update and one Server Action carry the
 * new neighbours. Mouse drags start after 5px (so clicks still open cards),
 * touch drags after a short press (so the board still scrolls). Keyboard:
 * Space on a card's link, Space or Enter on a column's grip button.
 */
export function SortableBoard({ onDeleteColumn }: { onDeleteColumn: (columnId: string) => void }) {
  const { view, boardId, boardPath, today, serverToday, mutate } = useBoard();
  const dndId = useId();
  const reducedMotion = useReducedMotion();
  const [layout, setLayout] = useState<BoardLayout | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const session = useRef<DragSession | null>(null);
  // The columns list element (a callback ref): the collision measures its columns.
  const [columnsList, setColumnsList] = useState<HTMLOListElement | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(BoardKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const display = layout ? applyLayout(view, layout) : view;
  // What is on screen (including cards added by others mid-drag), which is
  // also what decides which columns are drop targets.
  const collisionDetection = collisionDetectionFor(layout ? layoutOf(display) : null, columnsList);

  function handleDragStart({ active }: DragStartEvent) {
    const initial = layoutOf(view);
    session.current = { view, initial, layout: initial, announced: initial };
    setLayout(initial);
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over, activatorEvent, delta }: DragOverEvent) {
    const current = session.current;
    if (!current || !over) return;
    const id = String(active.id);
    const overId = String(over.id);
    // Within a list, dnd-kit shifts the items visually; only a card changing
    // column needs to move in the state (so the target list makes room).
    if (isColumnId(current.layout, id)) return;
    const from = columnIdOf(current.layout, id);
    const to = columnIdOf(current.layout, overId);
    if (from === null || to === null || from === to) return;
    // Entering over a card: after it when the pointer (or, with the keyboard,
    // the dragged card's top) is below the card's middle.
    const middle = over.rect.top + over.rect.height / 2;
    const start = getEventCoordinates(activatorEvent);
    const dragged = active.rect.current.translated;
    const after = start ? start.y + delta.y > middle : dragged !== null && dragged.top > middle;
    current.layout = moveInLayout(current.layout, id, overId, { after });
    setLayout(current.layout);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = session.current;
    setLayout(null);
    setActiveId(null);
    if (!current) return;
    const id = String(active.id);
    if (over) current.layout = moveInLayout(current.layout, id, String(over.id));

    const result = dropResult(current.initial, current.layout, id);
    if (!result) return;
    const { previousId, nextId } = result;
    if (result.type === "moveCard") {
      const { cardId, columnId } = result;
      mutate(result, () => moveCard({ boardId, cardId, columnId, previousId, nextId }));
    } else {
      const { columnId } = result;
      mutate(result, () => moveColumn({ boardId, columnId, previousId, nextId }));
    }
  }

  function handleDragCancel() {
    setLayout(null);
    setActiveId(null);
  }

  // Called by dnd-kit right after the matching handler above, so the session
  // already holds the order to describe.
  const announcements: Announcements = {
    onDragStart({ active }) {
      const current = session.current;
      return current ? pickedUpMessage(current.view, current.layout, String(active.id)) : undefined;
    },
    onDragOver({ active, over }) {
      const current = session.current;
      if (!current || !over) return undefined;
      const id = String(active.id);
      const projected = moveInLayout(current.layout, id, String(over.id));
      const message = movedMessage(current.view, current.announced, projected, id);
      if (!message) return undefined;
      current.announced = projected;
      return message;
    },
    onDragEnd({ active }) {
      const current = session.current;
      return current ? droppedMessage(current.view, current.layout, String(active.id)) : undefined;
    },
    onDragCancel({ active }) {
      const current = session.current;
      return current
        ? cancelledMessage(current.view, current.initial, String(active.id))
        : undefined;
    },
  };

  const activeCard = activeId
    ? display.columns.flatMap((column) => column.cards).find((card) => card.id === activeId)
    : undefined;
  const activeColumn = activeId
    ? display.columns.find((column) => column.id === activeId)
    : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={measuring}
      autoScroll={autoScroll}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
    >
      <SortableContext
        id="columns"
        items={display.columns.map((column) => column.id)}
        strategy={horizontalListSortingStrategy}
      >
        <ColumnsList ref={setColumnsList} dragging={activeId !== null}>
          {display.columns.map((column) => (
            <SortableColumn
              key={column.id}
              column={column}
              onDelete={() => onDeleteColumn(column.id)}
            />
          ))}
          <li className="w-68 shrink-0 snap-start scroll-ml-4">
            <AddColumn />
          </li>
        </ColumnsList>
      </SortableContext>
      {/*
        Outside the columns list, and hidden from assistive tech: the live region speaks for it.
        No tilt: a rotated overlay changes the measured rect, and keyboard moves then pick the wrong neighbour.
      */}
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {activeCard ? (
          <div
            aria-hidden
            className="cursor-grabbing rounded-lg shadow-lg ring-1 ring-foreground/10"
          >
            <CardFace
              boardPath={boardPath}
              card={activeCard}
              due={describeDue(activeCard, today, serverToday)}
              preview
            />
          </div>
        ) : activeColumn ? (
          <div
            aria-hidden
            className="flex h-full cursor-grabbing items-start rounded-xl shadow-lg ring-1 ring-foreground/10"
          >
            <BoardColumn column={activeColumn} mode="preview" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableColumn({ column, onDelete }: { column: ColumnView; onDelete: () => void }) {
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
    id: column.id,
    data: { type: "column" },
    attributes: { roleDescription: "draggable column" },
    // While a card is dragged, a column is a drop target only when empty
    // (otherwise its cards are): that is how a card lands in an empty column.
    // It also keeps keyboard moves (which pick among all drop targets) on cards.
    disabled: {
      draggable: false,
      droppable: active?.data.current?.type === "card" && column.cards.length > 0,
    },
  });

  return (
    <li
      ref={setNodeRef}
      data-column-id={column.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        COLUMN_ITEM_CLASS,
        "motion-reduce:transition-none!",
        isDragging && "opacity-40",
      )}
    >
      <BoardColumn
        column={column}
        onDelete={onDelete}
        mode="sortable"
        dragHandle={
          <DragHandle
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            label={`Move column ${column.title}`}
          />
        }
      />
    </li>
  );
}
