import { AlignLeftIcon } from "lucide-react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import type { DueInfo } from "@/lib/boards/due-date";
import type { CardSummary } from "@/lib/boards/view-model";

import { CardLink } from "./card-link";
import { DueBadge } from "./due-badge";
import { LabelList } from "./label-chip";
import { AvatarStack } from "./user-avatar";

const MAX_CARD_ASSIGNEES = 3;

type Props = {
  boardPath: string;
  card: CardSummary;
  due: DueInfo | null;
  /** Drag and drop: the link is the keyboard handle (Space picks the card up). */
  linkRef?: Ref<HTMLAnchorElement>;
  /** Drag and drop: id of the screen-reader instructions. */
  linkDescribedBy?: string;
  /** Static copy for the drag overlay: no link, not focusable. */
  preview?: boolean;
};

/**
 * A card on the board. The title is the link that opens the modal; its
 * `::after` covers the whole card so the card is clickable anywhere while
 * the link's accessible name stays just the title.
 */
export function CardFace({
  boardPath,
  card,
  due,
  linkRef,
  linkDescribedBy,
  preview = false,
}: Props) {
  const hasDescription = Boolean(card.description?.trim());
  const hasFooter = due !== null || hasDescription || card.assignees.length > 0;

  return (
    <article
      data-card-id={preview ? undefined : card.id}
      className={cn(
        "relative grid gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-colors hover:bg-muted/60 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        preview && "bg-card hover:bg-card",
      )}
    >
      <LabelList labels={card.labels} />
      <h3 className="text-sm leading-snug font-medium break-words">
        {preview ? (
          card.title
        ) : (
          <CardLink
            ref={linkRef}
            aria-describedby={linkDescribedBy}
            boardPath={boardPath}
            cardId={card.id}
            className="outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            {card.title}
          </CardLink>
        )}
      </h3>
      {hasFooter ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            {due ? <DueBadge due={due} /> : null}
            {hasDescription ? (
              <span title="Has a description">
                <AlignLeftIcon className="size-4" aria-hidden />
                <span className="sr-only">Has a description</span>
              </span>
            ) : null}
          </div>
          <AvatarStack
            people={card.assignees}
            max={MAX_CARD_ASSIGNEES}
            size="sm"
            label="Assignees"
          />
        </div>
      ) : null}
    </article>
  );
}
