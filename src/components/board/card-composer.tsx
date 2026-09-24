"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCard } from "@/lib/boards/actions";
import { nextCardPosition } from "@/lib/boards/board-updates";
import { CARD_TITLE_MAX, normalizeTitle } from "@/lib/boards/schemas";

import { useBoard } from "./board-context";

type Props = { columnId: string; columnTitle: string };

/**
 * Trello-style inline composer at the bottom of a column. Enter adds the card
 * and keeps the composer open (and focused) for the next one; Escape, the
 * close button or clicking elsewhere closes it. Titles are single-line, so
 * Enter always submits. Empty input does nothing.
 */
export function CardComposer({ columnId, columnTitle }: Props) {
  const { view, boardId, mutate } = useBoard();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const refocusOpener = useRef(false);
  const labelId = useId();

  useEffect(() => {
    if (!open && refocusOpener.current) {
      refocusOpener.current = false;
      openerRef.current?.focus();
    }
  }, [open]);

  function close(returnFocus: boolean) {
    refocusOpener.current = returnFocus;
    setOpen(false);
  }

  function submit() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const title = normalizeTitle(textarea.value);
    if (!title) return;

    textarea.value = "";
    textarea.focus();
    const card = {
      id: crypto.randomUUID(),
      columnId,
      title,
      position: nextCardPosition(view, columnId),
    };
    setAnnouncement(`Added card ${title}.`);
    mutate({ type: "addCard", card }, () =>
      createCard({ boardId, columnId, cardId: card.id, title }),
    );
    // Keep the composer in view as the column grows.
    requestAnimationFrame(() => textarea.scrollIntoView({ block: "nearest" }));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    // Clicking or tabbing away closes the composer; moving within it doesn't.
    if (!event.currentTarget.contains(event.relatedTarget)) close(false);
  }

  return (
    <div className="grid">
      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onBlur={handleBlur}
          className="grid gap-2"
        >
          <span id={labelId} className="sr-only">
            Title for a new card in {columnTitle}
          </span>
          <Textarea
            ref={textareaRef}
            // The user just asked to write a card.
            autoFocus
            aria-labelledby={labelId}
            rows={2}
            maxLength={CARD_TITLE_MAX}
            placeholder="Enter a title for this card…"
            onKeyDown={handleKeyDown}
            className="min-h-14 resize-none bg-card shadow-xs dark:bg-card"
          />
          <div className="flex items-center gap-1">
            {/* preventDefault on mousedown keeps focus in the textarea (Safari doesn't focus buttons). */}
            <Button type="submit" size="sm" onMouseDown={(event) => event.preventDefault()}>
              Add card
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel adding a card"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => close(true)}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        </form>
      ) : (
        <Button
          ref={openerRef}
          variant="ghost"
          size="sm"
          data-add-card-trigger=""
          onClick={() => setOpen(true)}
          className="justify-start text-muted-foreground hover:bg-foreground/5"
        >
          <PlusIcon aria-hidden />
          Add a card
        </Button>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
