"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { normalizeTitle } from "@/lib/boards/schemas";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  /** Accessible name of the text field, e.g. "Board title". */
  label: string;
  maxLength: number;
  /** Called with the normalised new value, only when it changed and isn't empty. */
  onSave: (value: string) => void;
  /** Tooltip and accessible description of the display button, e.g. "Rename board". */
  hint: string;
  /** Wrap long values instead of truncating them with an ellipsis. */
  multiline?: boolean;
  /** Classes shared by the button and the field (font size, weight). */
  className?: string;
};

/**
 * A title that turns into a text field when clicked (or activated with the
 * keyboard). Enter or leaving the field saves; Escape cancels. After Enter or
 * Escape focus returns to the title, so keyboard users stay in place.
 *
 * Render it inside the heading it edits: the button's text stays the
 * heading's accessible name.
 */
export function InlineEdit({
  value,
  label,
  maxLength,
  onSave,
  hint,
  multiline = false,
  className,
}: Props) {
  const [editing, setEditing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  // Enter/Escape unmount the field, which may also fire blur: finish only once.
  const finished = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  function finish(input: HTMLInputElement, save: boolean, returnFocus: boolean) {
    if (finished.current) return;
    finished.current = true;
    const next = normalizeTitle(input.value);
    if (save && next && next !== value) onSave(next);
    refocus.current = returnFocus;
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      finish(event.currentTarget, true, true);
    } else if (event.key === "Escape") {
      // Cancel the edit only; don't also close a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      finish(event.currentTarget, false, true);
    }
  }

  if (editing) {
    return (
      <Input
        // Focus moves into the field the user just asked to edit.
        autoFocus
        aria-label={label}
        defaultValue={value}
        maxLength={maxLength}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleKeyDown}
        onBlur={(event) => finish(event.currentTarget, true, false)}
        className={cn("-mx-1.5 h-auto px-1.5 py-0.5", className)}
        style={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: "inherit" }}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      title={hint}
      onClick={() => {
        finished.current = false;
        setEditing(true);
      }}
      className={cn(
        "-mx-1.5 max-w-full cursor-text rounded-md border border-transparent px-1.5 py-0.5 text-left outline-none hover:bg-foreground/5 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        multiline ? "break-words whitespace-normal" : "truncate",
        className,
      )}
    >
      {value}
    </button>
  );
}
