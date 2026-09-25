"use client";

import { useState } from "react";

import { BoardColumn, COLUMN_ITEM_CLASS, ColumnsList } from "./board-column";
import { useBoard } from "./board-context";
import { DeleteColumnDialog } from "./delete-column-dialog";
import { SortableBoard } from "./sortable-board";

/**
 * The board's columns. Editors get drag and drop (SortableBoard); viewers get
 * the same markup without drag handles or sensors.
 */
export function BoardColumns() {
  const { view, permissions } = useBoard();
  const [columnToDelete, setColumnToDelete] = useState<string | null>(null);

  if (!permissions.canEdit) {
    if (view.columns.length === 0) {
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
      <ColumnsList>
        {view.columns.map((column) => (
          <li key={column.id} data-column-id={column.id} className={COLUMN_ITEM_CLASS}>
            <BoardColumn column={column} />
          </li>
        ))}
      </ColumnsList>
    );
  }

  return (
    <>
      <SortableBoard onDeleteColumn={setColumnToDelete} />
      <DeleteColumnDialog columnId={columnToDelete} onClose={() => setColumnToDelete(null)} />
    </>
  );
}
