import { CheckIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ThinkingMark } from "@/components/brand/thinking-mark";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { title: "To do", cards: ["Create login API", "Design the users database schema"] },
  { title: "In progress", cards: ["Add drag and drop"] },
  { title: "Done", cards: ["Set up auth", "Enable Row Level Security"] },
];

const ACCEPTED = "Split the checkout form into steps";
const DISCARDED = "Validate the payload with Zod";

const cardClass =
  "rounded-lg border bg-card px-2 py-1.5 text-xs leading-snug text-card-foreground shadow-xs";

/**
 * A row that fades in and out with the preview loop (see the `preview-*` keyframes) while
 * keeping its space, so the frame never changes height. `className` holds its resting state
 * and its animation: with reduced motion the animation is off and the resting state shows.
 */
function LoopRow({ className, children }: { className: string; children: ReactNode }) {
  return <div className={cn("motion-reduce:animate-none", className)}>{children}</div>;
}

function Proposal({
  title,
  iconClass,
  className,
}: {
  title: string;
  iconClass: { ack?: string; nack?: string };
  className: string;
}) {
  return (
    <LoopRow className={className}>
      <div className="pt-1.5">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs">
          <span className="truncate">{title}</span>
          <span className="flex shrink-0 gap-1 text-muted-foreground">
            <CheckIcon className={cn("size-3.5 motion-reduce:animate-none", iconClass.ack)} />
            <XIcon className={cn("size-3.5 motion-reduce:animate-none", iconClass.nack)} />
          </span>
        </div>
      </div>
    </LoopRow>
  );
}

/**
 * Decorative illustration of the product in the hero frame, as a 6s loop: the AI thinks, two
 * proposals stream into the review box, the first is acked and lands in To do as a card, the
 * second is discarded. With reduced motion it shows the end state (the acked card in To do).
 * Hidden from assistive technology: the page says the same thing in words.
 */
export function BoardPreview() {
  return (
    <div aria-hidden="true" className="select-none">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {COLUMNS.map((column) => (
          <div key={column.title} className="grid content-start gap-2 rounded-xl bg-muted p-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">{column.title}</p>
            {column.cards.map((card) => (
              <div key={card} className={cardClass}>
                {card}
              </div>
            ))}
            {column.title === "To do" ? (
              // Its slot is always there (empty until it lands), so the column never grows.
              <LoopRow className="animate-preview-landed">
                <div className={cn(cardClass, "border-ai-line")}>{ACCEPTED}</div>
              </LoopRow>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-dashed border-ai-line bg-card p-3 sm:mt-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ai-foreground">
          <ThinkingMark size={16} />
          Proposed · waiting for your review
        </p>
        <div className="mt-0.5">
          <Proposal
            title={ACCEPTED}
            iconClass={{ ack: "animate-preview-ack" }}
            className="animate-preview-accepted opacity-0"
          />
          <Proposal
            title={DISCARDED}
            iconClass={{ nack: "animate-preview-nack" }}
            className="animate-preview-discarded"
          />
        </div>
      </div>
    </div>
  );
}
