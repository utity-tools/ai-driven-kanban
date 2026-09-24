"use client";

import { useState } from "react";

import { renameColumn } from "@/lib/boards/actions";
import { COLUMN_TITLE_MAX } from "@/lib/boards/schemas";
import { describeDue } from "@/lib/boards/due-date";
import type { ColumnView } from "@/lib/boards/view-model";

import { AddColumn } from "./add-column";
import { useBoard } from "./board-context";
import { CardComposer } from "./card-composer";
import { CardFace } from "./card-face";
import { ColumnMenu } from "./column-menu";
import { DeleteColumnDialog } from "./delete-column-dialog";
import { InlineEdit } from "./inline-edit";

/**
 * Columns side by side, scrolling horizontally (with snap points on touch
 * screens). Columns and cards are ordered lists: order is meaningful.
 */
export function BoardColumns() {
  const { view, permissions } = useBoard();
  const [columnToDelete, setColumnToDelete] = useState<string | null>(null);

  if (view.columns.length === 0 && !permissions.canEdit) {
    return (
      <div className="mx-4 grid place-items-center gap-1 rounded-xl border border-dashed px-4 py-16 text-center">
        <h2 className="font-medium">This board has no columns yet</h2>
        <p className="text-sm text-muted-foreground">
          Columns and cards will appear here once they are added.
        </p>
      </div>
    );
  }

  return (
    <>
      <ol
        aria-label="Columns"
        className="relative flex flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 sm:snap-none"
      >
        {view.columns.map((column) => (
          <li
            key={column.id}
            data-column-id={column.id}
            className="flex w-68 shrink-0 snap-start scroll-ml-4"
          >
            <BoardColumn column={column} onDelete={() => setColumnToDelete(column.id)} />
          </li>
        ))}
        {permissions.canEdit ? (
          <li className="w-68 shrink-0 snap-start scroll-ml-4">
            <AddColumn />
          </li>
        ) : null}
      </ol>
      {permissions.canEdit ? (
        <DeleteColumnDialog columnId={columnToDelete} onClose={() => setColumnToDelete(null)} />
      ) : null}
    </>
  );
}

function BoardColumn({ column, onDelete }: { column: ColumnView; onDelete: () => void }) {
  const { boardId, boardPath, today, serverToday, permissions, mutate } = useBoard();
  const headingId = `column-${column.id}`;
  const count = column.cards.length;

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-h-full w-full flex-col gap-2 rounded-xl bg-muted/70 p-2 dark:bg-muted/40"
    >
      <header className="flex min-h-7 items-center gap-2 pr-0.5 pl-1.5">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {permissions.canEdit ? (
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
        {permissions.canEdit ? <ColumnMenu title={column.title} onDelete={onDelete} /> : null}
      </header>
      {count === 0 ? (
        permissions.canEdit ? null : (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No cards yet
          </p>
        )
      ) : (
        <ol aria-label={`${column.title} cards`} className="grid gap-2">
          {column.cards.map((card) => (
            <li key={card.id}>
              <CardFace
                boardPath={boardPath}
                card={card}
                due={describeDue(card, today, serverToday)}
              />
            </li>
          ))}
        </ol>
      )}
      {permissions.canEdit ? (
        <CardComposer columnId={column.id} columnTitle={column.title} />
      ) : null}
    </section>
  );
}
