import { type BoardView, describeDue } from "@/lib/boards/view-model";

import { CardFace } from "./card-face";

type Props = { view: BoardView; boardPath: string; now: Date };

/**
 * Columns side by side, scrolling horizontally (with snap points on touch
 * screens). Columns and cards are ordered lists: order is meaningful.
 */
export function BoardColumns({ view, boardPath, now }: Props) {
  return (
    <ol
      aria-label="Columns"
      className="relative flex flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 sm:snap-none"
    >
      {view.columns.map((column) => {
        const headingId = `column-${column.id}`;
        const count = column.cards.length;
        return (
          <li key={column.id} className="flex w-68 shrink-0 snap-start scroll-ml-4">
            <section
              aria-labelledby={headingId}
              className="flex max-h-full w-full flex-col gap-2 rounded-xl bg-muted/70 p-2 dark:bg-muted/40"
            >
              <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1">
                <h2 id={headingId} className="truncate text-sm font-semibold">
                  {column.title}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count}
                  <span className="sr-only">{count === 1 ? " card" : " cards"}</span>
                </span>
              </header>
              {count === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  No cards yet
                </p>
              ) : (
                <ol aria-label={`${column.title} cards`} className="grid gap-2">
                  {column.cards.map((card) => (
                    <li key={card.id}>
                      <CardFace boardPath={boardPath} card={card} due={describeDue(card, now)} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </li>
        );
      })}
    </ol>
  );
}
