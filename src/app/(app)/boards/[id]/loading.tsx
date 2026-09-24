import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [3, 2, 4, 1];

export default function BoardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-5 pt-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading board…
      </span>
      <div className="grid gap-2 px-4" aria-hidden>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="flex gap-3 overflow-hidden px-4" aria-hidden>
        {COLUMNS.map((cards, column) => (
          <div
            key={column}
            className="grid w-68 shrink-0 gap-2 rounded-xl bg-muted/70 p-2 dark:bg-muted/40"
          >
            <Skeleton className="m-1.5 h-4 w-24 bg-background/60" />
            {Array.from({ length: cards }, (_, card) => (
              <Skeleton key={card} className="h-20 rounded-lg bg-background/60" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
