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
import { CSS } from "@dnd-kit/utilities";
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

// Columns only collide with columns (cards are disabled as drop targets while
// a column is dragged); cards use the corners, which suits stacked lists.
const collisionDetection: CollisionDetection = (args) =>
  args.active.data.current?.type === "column" ? closestCenter(args) : closestCorners(args);

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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(BoardKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const display = layout ? applyLayout(view, layout) : view;

  function handleDragStart({ active }: DragStartEvent) {
    const initial = layoutOf(view);
    session.current = { view, initial, layout: initial };
    setLayout(initial);
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
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
    const dragged = active.rect.current.translated;
    const after = dragged !== null && dragged.top > over.rect.top + over.rect.height / 2;
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
      return movedMessage(current.view, projected, id) || undefined;
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
        <ColumnsList>
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
