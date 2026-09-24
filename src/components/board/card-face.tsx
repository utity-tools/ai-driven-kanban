import { AlignLeftIcon } from "lucide-react";

import type { CardSummary, DueInfo } from "@/lib/boards/view-model";

import { CardLink } from "./card-link";
import { DueBadge } from "./due-badge";
import { LabelList } from "./label-chip";
import { AvatarStack } from "./user-avatar";

const MAX_CARD_ASSIGNEES = 3;

type Props = { boardPath: string; card: CardSummary; due: DueInfo | null };

/**
 * A card on the board. The title is the link that opens the modal; its
 * `::after` covers the whole card so the card is clickable anywhere while
 * the link's accessible name stays just the title.
 */
export function CardFace({ boardPath, card, due }: Props) {
  const hasDescription = Boolean(card.description?.trim());
  const hasFooter = due !== null || hasDescription || card.assignees.length > 0;

  return (
    <article
      data-card-id={card.id}
      className="relative grid gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-colors hover:bg-muted/60 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50"
    >
      <LabelList labels={card.labels} />
      <h3 className="text-sm leading-snug font-medium break-words">
        <CardLink
          boardPath={boardPath}
          cardId={card.id}
          className="outline-none after:absolute after:inset-0 after:rounded-lg"
        >
          {card.title}
        </CardLink>
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
