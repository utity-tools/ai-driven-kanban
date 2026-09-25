import { CheckIcon, SparklesIcon, XIcon } from "lucide-react";

const COLUMNS = [
  { title: "To do", cards: ["Design the onboarding flow", "Write API contract"] },
  { title: "In progress", cards: ["Add drag and drop"] },
  { title: "Done", cards: ["Set up auth", "Row Level Security"] },
];

const PROPOSALS = ["Split the checkout form into steps", "Validate the payload with Zod"];

/**
 * Decorative illustration of a board with a pending AI proposal. Hidden from
 * assistive technology: the feature list says the same thing in words.
 */
export function BoardPreview() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border bg-muted/40 p-3 shadow-sm select-none sm:p-4"
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {COLUMNS.map((column) => (
          <div key={column.title} className="grid content-start gap-2 rounded-xl bg-muted p-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">{column.title}</p>
            {column.cards.map((card) => (
              <div
                key={card}
                className="rounded-lg border bg-card px-2 py-1.5 text-xs leading-snug text-card-foreground shadow-xs"
              >
                {card}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-dashed border-foreground/25 bg-card p-3 sm:mt-4">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <SparklesIcon className="size-3.5" />
          AI proposal · waiting for your review
        </p>
        <ul className="mt-2 grid gap-1.5">
          {PROPOSALS.map((proposal) => (
            <li
              key={proposal}
              className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs"
            >
              <span className="truncate">{proposal}</span>
              <span className="flex shrink-0 gap-1 text-muted-foreground">
                <CheckIcon className="size-3.5" />
                <XIcon className="size-3.5" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
