"use client";

import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pluralize } from "@/lib/boards/copy";
import { blockerCandidates, filterCandidates } from "@/lib/boards/dependencies";

import { useBoard } from "./board-context";

/**
 * "Add blocker" button of the Dependencies section: a popover with a search
 * field over the cards that can become a blocker (never the card itself, an
 * existing blocker, or one that would close a cycle). Choosing one adds it
 * and closes the popover; Escape closes it and returns focus to the button.
 */
export function BlockerPicker({
  cardId,
  onPick,
}: {
  cardId: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <PopoverTrigger render={<Button variant="outline" size="sm" data-add-blocker-trigger="" />}>
        <PlusIcon aria-hidden />
        Add blocker
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <CandidateList
          cardId={cardId}
          onPick={(id) => {
            setOpen(false);
            onPick(id);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Search field and list. Mounted only while the popover is open, so candidates are computed on demand and the query starts empty. */
function CandidateList({ cardId, onPick }: { cardId: string; onPick: (id: string) => void }) {
  const { view } = useBoard();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const candidates = blockerCandidates(view, cardId);
  const matches = filterCandidates(candidates, query);

  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        Search cards
      </label>
      <Input
        id={inputId}
        type="search"
        autoComplete="off"
        placeholder="Search cards"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p role="status" className="sr-only">
        {pluralize(matches.length, "card")} found
      </p>
      {candidates.length === 0 ? (
        <p className="text-muted-foreground">No other cards can block this one.</p>
      ) : matches.length === 0 ? (
        <p className="text-muted-foreground">No cards match “{query.trim()}”.</p>
      ) : (
        <ul
          aria-label="Cards that can block this one"
          className="grid max-h-60 gap-0.5 overflow-y-auto"
        >
          {matches.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => onPick(candidate.id)}
                className="grid w-full gap-0.5 rounded-md px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="break-words">{candidate.title}</span>
                <span className="text-xs text-muted-foreground">{candidate.columnTitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
