"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createColumn } from "@/lib/boards/actions";
import { nextColumnPosition } from "@/lib/boards/board-updates";
import { COLUMN_TITLE_MAX, normalizeTitle } from "@/lib/boards/schemas";

import { useBoard } from "./board-context";

/**
 * "+ Add column" at the end of the board. Works like the card composer: Enter
 * adds the column and keeps the field open for the next one; Escape, the
 * close button or clicking elsewhere closes it.
 */
export function AddColumn() {
  const { view, boardId, mutate } = useBoard();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const refocusOpener = useRef(false);
  const inputId = useId();

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
    const input = inputRef.current;
    if (!input) return;
    const title = normalizeTitle(input.value);
    if (!title) return;

    input.value = "";
    input.focus();
    const column = { id: crypto.randomUUID(), title, position: nextColumnPosition(view) };
    setAnnouncement(`Added column ${title}.`);
    mutate({ type: "addColumn", column }, () =>
      createColumn({ boardId, columnId: column.id, title }),
    );
    // The new column is inserted before this one: keep the field in view.
    requestAnimationFrame(() => input.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) close(false);
  }

  return (
    <div className="grid rounded-xl bg-muted/40 p-2 dark:bg-muted/25">
      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onBlur={handleBlur}
          className="grid gap-2"
        >
          <label htmlFor={inputId} className="sr-only">
            Title for a new column
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            // The user just asked to name a column.
            autoFocus
            maxLength={COLUMN_TITLE_MAX}
            placeholder="Enter a column title…"
            autoComplete="off"
            onKeyDown={handleKeyDown}
            className="bg-card dark:bg-card"
          />
          <div className="flex items-center gap-1">
            <Button type="submit" size="sm" onMouseDown={(event) => event.preventDefault()}>
              Add column
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel adding a column"
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
          data-add-column-trigger=""
          onClick={() => setOpen(true)}
          className="justify-start text-muted-foreground hover:bg-foreground/5"
        >
          <PlusIcon aria-hidden />
          Add column
        </Button>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
