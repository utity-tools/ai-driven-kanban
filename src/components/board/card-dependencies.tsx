"use client";

import { ArchiveIcon, CircleCheckIcon, CircleDashedIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addCardDependency, removeCardDependency } from "@/lib/boards/actions";
import { MAX_BLOCKERS, type DependencyLink } from "@/lib/boards/dependencies";

import { BlockerPicker } from "./blocker-picker";
import { useBoard } from "./board-context";
import { CardLink } from "./card-link";

type Props = {
  cardId: string;
  blockedBy: DependencyLink[];
  blocks: DependencyLink[];
  /** Owners and editors on an active card; everyone else gets read-only lists. */
  editable: boolean;
};

/**
 * The card modal's dependencies: the cards that block this one ("Blocked by",
 * with "Add blocker") and the cards it blocks ("Blocks"). Both are
 * optimistic; the database still rejects cycles and more than 20 blockers,
 * and the error shows as a toast.
 */
export function CardDependencies({ cardId, blockedBy, blocks, editable }: Props) {
  const { boardId, boardPath, mutate } = useBoard();

  function add(blockerId: string) {
    mutate({ type: "addDependency", blockerId, blockedId: cardId }, () =>
      addCardDependency({ boardId, blockerCardId: blockerId, blockedCardId: cardId }),
    );
  }

  function remove(blockerId: string, blockedId: string, button: HTMLElement) {
    // The row (and its focused button) goes away: move focus to a neighbour, else to "Add blocker".
    const row = button.closest("li");
    const neighbor = row?.nextElementSibling ?? row?.previousElementSibling;
    const target =
      neighbor?.querySelector<HTMLElement>("[data-remove-dependency]") ??
      button.closest('[role="dialog"]')?.querySelector<HTMLElement>("[data-add-blocker-trigger]");
    target?.focus();
    mutate({ type: "removeDependency", blockerId, blockedId }, () =>
      removeCardDependency({ boardId, blockerCardId: blockerId, blockedCardId: blockedId }),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <h4 className="text-sm font-medium">Blocked by</h4>
        <DependencyList
          label="Blocked by"
          empty="No card blocks this one."
          links={blockedBy}
          boardPath={boardPath}
          onRemove={editable ? (link, button) => remove(link.cardId, cardId, button) : undefined}
        />
        {editable ? (
          blockedBy.length >= MAX_BLOCKERS ? (
            <p className="text-sm text-muted-foreground">
              A card can have at most {MAX_BLOCKERS} blockers.
            </p>
          ) : (
            <div>
              <BlockerPicker cardId={cardId} onPick={add} />
            </div>
          )
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <h4 className="text-sm font-medium">Blocks</h4>
        <DependencyList
          label="Blocks"
          empty="This card doesn't block any other card."
          links={blocks}
          boardPath={boardPath}
          onRemove={editable ? (link, button) => remove(cardId, link.cardId, button) : undefined}
        />
      </div>
    </div>
  );
}

function DependencyList({
  label,
  empty,
  links,
  boardPath,
  onRemove,
}: {
  label: string;
  empty: string;
  links: DependencyLink[];
  boardPath: string;
  onRemove?: (link: DependencyLink, button: HTMLElement) => void;
}) {
  if (links.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <ul aria-label={label} className="grid gap-1">
      {links.map((link) => (
        <li
          key={link.cardId}
          className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm"
        >
          <div className="grid min-w-0 flex-1 gap-0.5">
            <CardLink
              boardPath={boardPath}
              cardId={link.cardId}
              className="rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {link.title}
            </CardLink>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{link.columnTitle}</span>
              <span
                className="inline-flex items-center gap-1"
                data-resolved={link.resolved}
                data-state={link.state}
              >
                {link.state === "done" ? (
                  <CircleCheckIcon
                    className="size-3.5 text-green-700 dark:text-green-400"
                    aria-hidden
                  />
                ) : link.state === "archived" ? (
                  <ArchiveIcon className="size-3.5" aria-hidden />
                ) : (
                  <CircleDashedIcon className="size-3.5" aria-hidden />
                )}
                {link.state === "done"
                  ? "Done"
                  : link.state === "archived"
                    ? "Archived"
                    : "Pending"}
              </span>
            </span>
          </div>
          {onRemove ? (
            <Button
              variant="ghost"
              size="icon-xs"
              data-remove-dependency=""
              aria-label={`Remove dependency on ${link.title}`}
              title="Remove dependency"
              onClick={(event) => onRemove(link, event.currentTarget)}
              className="text-muted-foreground hover:text-destructive"
            >
              <XIcon aria-hidden />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
