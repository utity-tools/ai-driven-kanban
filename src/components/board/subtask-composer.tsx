"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { type FocusEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeTitle } from "@/lib/boards/schemas";
import { SUBTASK_LIMIT_ERROR, SUBTASK_TITLE_MAX, canAddSubtask } from "@/lib/subtasks/schemas";

type Props = {
  /** How many subtasks the card has (the database caps it). */
  count: number;
  /** Called with the normalised, non-empty title. */
  onAdd: (title: string) => void;
};

/**
 * "Add a subtask" at the bottom of the checklist. Enter adds and keeps the
 * field open (and focused) for the next one; Escape, the close button or
 * leaving the form closes it (Escape doesn't also close the card modal).
 */
export function SubtaskComposer({ count, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const refocusOpener = useRef(false);
  const full = !canAddSubtask(count);

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
    if (!input || full) return;
    const title = normalizeTitle(input.value);
    if (!title) return;
    input.value = "";
    input.focus();
    setAnnouncement(`Added subtask ${title}.`);
    onAdd(title);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) close(false);
  }

  return (
    <div className="grid">
      {full ? (
        <p className="text-sm text-muted-foreground">{SUBTASK_LIMIT_ERROR}</p>
      ) : open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onBlur={handleBlur}
          className="flex items-center gap-1"
        >
          <Input
            ref={inputRef}
            // The user just asked to write a subtask.
            autoFocus
            aria-label="New subtask title"
            maxLength={SUBTASK_TITLE_MAX}
            placeholder="Add a subtask…"
            enterKeyHint="enter"
            onKeyDown={handleKeyDown}
            className="h-8 flex-1"
          />
          {/* preventDefault on mousedown keeps focus in the field (Safari doesn't focus buttons). */}
          <Button type="submit" size="sm" onMouseDown={(event) => event.preventDefault()}>
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel adding a subtask"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => close(true)}
          >
            <XIcon aria-hidden />
          </Button>
        </form>
      ) : (
        <Button
          ref={openerRef}
          variant="ghost"
          size="sm"
          data-add-subtask-trigger=""
          onClick={() => setOpen(true)}
          className="justify-self-start text-muted-foreground hover:bg-foreground/5"
        >
          <PlusIcon aria-hidden />
          Add a subtask
        </Button>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
