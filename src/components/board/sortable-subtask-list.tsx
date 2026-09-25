"use client";

import {
  DndContext,
  type DragEndEvent,
  type Modifier,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type KeyboardEvent, useId, useState } from "react";

import { moveSubtask } from "@/lib/subtasks/actions";
import {
  SUBTASK_MOVE_INSTRUCTIONS,
  keyboardMoveIndex,
  neighborsForMove,
  subtaskMovedMessage,
} from "@/lib/subtasks/reorder";
import type { Subtask } from "@/lib/subtasks/subtask";
import { cn } from "@/lib/utils";

import { useBoard } from "./board-context";
import { DragHandle } from "./drag-handle";
import { type SubtaskHandlers, SubtaskItem } from "./subtask-item";

/** A checklist only reorders up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const modifiers = [verticalOnly];

type Props = {
  cardId: string;
  subtasks: readonly Subtask[];
  handlers: SubtaskHandlers;
};

/**
 * The editable checklist. Each row has a grip button to reorder it:
 * - mouse or touch: drag the grip (dnd-kit; a 5px move or a long press);
 * - keyboard: with the grip focused, the up and down arrows move the subtask
 *   one place, Home and End to the top and bottom. Focus stays on the grip
 *   and the new position is announced.
 *
 * Why not dnd-kit's keyboard sensor, as on the board: it listens on the
 * document, and the modal stops arrow keys from leaving it (they drive its
 * composite widgets), so a pick-up-and-move drag can't work in here.
 *
 * Every move is one optimistic update and one Server Action with the new
 * neighbours; only the moved subtask gets a new position.
 */
export function SortableSubtaskList({ cardId, subtasks, handlers }: Props) {
  const { boardId, mutate } = useBoard();
  const dndId = useId();
  const instructionsId = useId();
  const [announcement, setAnnouncement] = useState("");
  const ids = subtasks.map((subtask) => subtask.id);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function move(subtaskId: string, toIndex: number): boolean {
    const neighbors = neighborsForMove(ids, subtaskId, toIndex);
    if (!neighbors) return false;
    mutate({ type: "moveSubtask", cardId, subtaskId, ...neighbors }, () =>
      moveSubtask({ boardId, cardId, subtaskId, ...neighbors }),
    );
    return true;
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over) move(String(active.id), ids.indexOf(String(over.id)));
  }

  function handleKey(event: KeyboardEvent, subtaskId: string) {
    const toIndex = keyboardMoveIndex(event.key, ids.indexOf(subtaskId), ids.length);
    if (toIndex === null) return;
    // Arrows would otherwise scroll the modal.
    event.preventDefault();
    if (!move(subtaskId, toIndex)) return;
    const moved = ids.filter((id) => id !== subtaskId);
    moved.splice(toIndex, 0, subtaskId);
    setAnnouncement(subtaskMovedMessage(subtasks, moved, subtaskId));
  }

  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={modifiers}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul aria-label="Subtasks" className="grid">
            {subtasks.map((subtask) => (
              <SortableSubtask
                key={subtask.id}
                subtask={subtask}
                handlers={handlers}
                instructionsId={instructionsId}
                onHandleKeyDown={(event) => handleKey(event, subtask.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p id={instructionsId} hidden>
        {SUBTASK_MOVE_INSTRUCTIONS}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function SortableSubtask({
  subtask,
  handlers,
  instructionsId,
  onHandleKeyDown,
}: {
  subtask: Subtask;
  handlers: SubtaskHandlers;
  instructionsId: string;
  onHandleKeyDown: (event: KeyboardEvent) => void;
}) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: subtask.id });

  return (
    <li
      ref={setNodeRef}
      data-subtask-id={subtask.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative rounded-md bg-popover motion-reduce:transition-none!",
        isDragging && "z-10 shadow-md ring-1 ring-foreground/10",
      )}
    >
      <SubtaskItem
        subtask={subtask}
        handlers={handlers}
        handle={
          <DragHandle
            ref={setActivatorNodeRef}
            {...listeners}
            // The pointer drag doesn't need focus; the keyboard path is onKeyDown.
            onKeyDown={onHandleKeyDown}
            aria-describedby={instructionsId}
            data-subtask-handle=""
            data-dragging={isDragging || undefined}
            label={`Move subtask ${subtask.title}`}
            className="mt-0.5"
          />
        }
      />
    </li>
  );
}

/**
 * Escape during a pointer drag of a subtask cancels the drag (dnd-kit); the
 * card modal must not close too.
 */
export function isSubtaskDragActive(): boolean {
  return document.querySelector("[data-subtask-handle][data-dragging]") !== null;
}
