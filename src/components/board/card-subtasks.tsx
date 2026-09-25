"use client";

import type { CardDetail } from "@/lib/boards/view-model";
import {
  createSubtask,
  deleteSubtask,
  renameSubtask,
  setSubtaskCompleted,
  setSubtaskEstimate,
} from "@/lib/subtasks/actions";
import { subtaskProgress } from "@/lib/subtasks/progress";
import { neighborSubtaskId, nextSubtaskPosition } from "@/lib/subtasks/reorder";

import { useBoard } from "./board-context";
import { SortableSubtaskList } from "./sortable-subtask-list";
import { SubtaskComposer } from "./subtask-composer";
import { type SubtaskHandlers, SubtaskItem } from "./subtask-item";
import { SubtaskProgress } from "./subtask-progress";

type Props = {
  card: Pick<CardDetail, "id" | "subtasks">;
  /** Owners and editors on an active card; everyone else gets a read-only list. */
  editable: boolean;
};

/**
 * The card modal's checklist: progress, the subtasks (check, rename,
 * estimate, delete and reorder for editors) and the composer. Every change is
 * optimistic; the fresh board from the Server Action replaces it.
 */
export function CardSubtasks({ card, editable }: Props) {
  const { boardId, mutate } = useBoard();
  const cardId = card.id;
  const { subtasks } = card;

  const handlers: SubtaskHandlers = {
    onToggle(subtask, completed) {
      mutate(
        {
          type: "setSubtaskCompleted",
          cardId,
          subtaskId: subtask.id,
          completedAt: completed ? new Date().toISOString() : null,
        },
        () => setSubtaskCompleted({ boardId, cardId, subtaskId: subtask.id, completed }),
      );
    },
    onRename(subtask, title) {
      mutate({ type: "renameSubtask", cardId, subtaskId: subtask.id, title }, () =>
        renameSubtask({ boardId, cardId, subtaskId: subtask.id, title }),
      );
    },
    onEstimate(subtask, estimate) {
      mutate({ type: "setSubtaskEstimate", cardId, subtaskId: subtask.id, estimate }, () =>
        setSubtaskEstimate({ boardId, cardId, subtaskId: subtask.id, estimate }),
      );
    },
    onDelete(subtask) {
      // The row (and its focused button) goes away: move focus to a neighbour
      // first, or to "Add a subtask".
      const neighbor = neighborSubtaskId(
        subtasks.map((s) => s.id),
        subtask.id,
      );
      const target = neighbor
        ? document.querySelector<HTMLElement>(
            `[data-subtask-id="${neighbor}"] [data-subtask-checkbox]`,
          )
        : document.querySelector<HTMLElement>("[data-add-subtask-trigger]");
      target?.focus();
      mutate({ type: "deleteSubtask", cardId, subtaskId: subtask.id }, () =>
        deleteSubtask({ boardId, cardId, subtaskId: subtask.id }),
      );
    },
  };

  function add(title: string) {
    const subtask = {
      id: crypto.randomUUID(),
      title,
      estimate: null,
      position: nextSubtaskPosition(subtasks),
      completedAt: null,
      source: "manual" as const,
    };
    mutate({ type: "addSubtask", cardId, subtask }, () =>
      createSubtask({ boardId, cardId, subtaskId: subtask.id, title }),
    );
  }

  if (!editable && subtasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No subtasks.</p>;
  }

  return (
    <div className="grid gap-2">
      {subtasks.length > 0 ? <SubtaskProgress progress={subtaskProgress(subtasks)} /> : null}
      {editable ? (
        <SortableSubtaskList cardId={cardId} subtasks={subtasks} handlers={handlers} />
      ) : subtasks.length > 0 ? (
        <ul aria-label="Subtasks" className="grid">
          {subtasks.map((subtask) => (
            <li key={subtask.id} data-subtask-id={subtask.id}>
              <SubtaskItem subtask={subtask} />
            </li>
          ))}
        </ul>
      ) : null}
      {editable ? <SubtaskComposer count={subtasks.length} onAdd={add} /> : null}
    </div>
  );
}
