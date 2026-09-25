"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";

import { renameColumn } from "@/lib/boards/actions";
import { describeDue } from "@/lib/boards/due-date";
import { COLUMN_TITLE_MAX } from "@/lib/boards/schemas";
import type { ColumnView } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

import { useBoard } from "./board-context";
import { CardComposer } from "./card-composer";
import { CardFace } from "./card-face";
import { ColumnMenu } from "./column-menu";
import { InlineEdit } from "./inline-edit";
import { SortableCard } from "./sortable-card";

/** Classes of each column's `<li>` in the columns list. */
export const COLUMN_ITEM_CLASS = "flex w-68 shrink-0 snap-start scroll-ml-4";

/**
 * Columns side by side, scrolling horizontally (with snap points on touch
 * screens). Columns and cards are ordered lists: order is meaningful.
 */
export function ColumnsList({ children }: { children: ReactNode }) {
  return (
    <ol
      aria-label="Columns"
      className="relative flex flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 sm:snap-none"
    >
      {children}
    </ol>
  );
}

type Props = {
  column: ColumnView;
  onDelete?: () => void;
  /**
   * `"static"`: read-only or editable, no drag and drop (viewers).
   * `"sortable"`: cards can be dragged (inside the board's DndContext).
   * `"preview"`: the copy shown in the drag overlay: nothing interactive.
   */
  mode?: "static" | "sortable" | "preview";
  /** The column's drag handle, shown before the title. */
  dragHandle?: ReactNode;
};

export function BoardColumn({ column, onDelete, mode = "static", dragHandle }: Props) {
  const { boardId, boardPath, today, serverToday, permissions, mutate } = useBoard();
  const headingId = `column-${column.id}`;
  const count = column.cards.length;
  const preview = mode === "preview";
  const canEdit = permissions.canEdit && !preview;

  const cards = (
    <ol aria-label={`${column.title} cards`} className="grid gap-2">
      {column.cards.map((card) => {
        const due = describeDue(card, today, serverToday);
        return mode === "sortable" ? (
          <SortableCard key={card.id} boardPath={boardPath} card={card} due={due} />
        ) : (
          <li key={card.id}>
            <CardFace boardPath={boardPath} card={card} due={due} preview={preview} />
          </li>
        );
      })}
    </ol>
  );

  return (
    <section
      aria-labelledby={preview ? undefined : headingId}
      className="flex max-h-full w-full flex-col gap-2 rounded-xl bg-muted/70 p-2 dark:bg-muted/40"
    >
      <header
        className={cn(
          "flex min-h-7 items-center pr-0.5",
          dragHandle ? "gap-1.5 pl-0.5" : "gap-2 pl-1.5",
        )}
      >
        {dragHandle}
        <h2
          id={preview ? undefined : headingId}
          className={cn("min-w-0 flex-1 truncate text-sm font-semibold", dragHandle && "pl-1")}
        >
          {canEdit ? (
            <InlineEdit
              value={column.title}
              label="Column title"
              hint="Rename column"
              maxLength={COLUMN_TITLE_MAX}
              onSave={(title) =>
                mutate({ type: "renameColumn", columnId: column.id, title }, () =>
                  renameColumn({ boardId, columnId: column.id, title }),
                )
              }
            />
          ) : (
            column.title
          )}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
          <span className="sr-only">{count === 1 ? " card" : " cards"}</span>
        </span>
        {canEdit && onDelete ? <ColumnMenu title={column.title} onDelete={onDelete} /> : null}
      </header>
      {count === 0 ? (
        permissions.canEdit ? null : (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No cards yet
          </p>
        )
      ) : mode === "sortable" ? (
        <SortableContext
          id={`cards-${column.id}`}
          items={column.cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards}
        </SortableContext>
      ) : (
        cards
      )}
      {canEdit ? <CardComposer columnId={column.id} columnTitle={column.title} /> : null}
    </section>
  );
}
