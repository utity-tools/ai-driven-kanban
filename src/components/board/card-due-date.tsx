"use client";

import { CalendarIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setCardCompleted, setCardDueDate } from "@/lib/boards/actions";
import {
  MAX_DUE_YEAR,
  MIN_DUE_YEAR,
  formatDueDate,
  fromDateOnly,
  toDateOnly,
} from "@/lib/boards/due-date";
import type { CardDetail } from "@/lib/boards/view-model";

import { useBoard } from "./board-context";

type CardDates = Pick<CardDetail, "id" | "dueOn" | "completedAt">;

const START_MONTH = new Date(MIN_DUE_YEAR, 0);
const END_MONTH = new Date(MAX_DUE_YEAR, 11);

/**
 * "Due date" button of the card modal: a popover with a calendar (arrow keys,
 * Page Up/Down, Home/End: react-day-picker's grid navigation) and "Remove".
 * Picking a day saves it and closes the popover; focus goes back to the button.
 */
export function DueDatePicker({ card }: { card: CardDates }) {
  const { boardId, today, serverToday, mutate } = useBoard();
  const [open, setOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const selected = card.dueOn ? fromDateOnly(card.dueOn) : undefined;

  function save(dueOn: string | null) {
    setOpen(false);
    if (dueOn === card.dueOn) return;
    mutate({ type: "setDueDate", cardId: card.id, dueOn }, () =>
      setCardDueDate({ boardId, cardId: card.id, dueOn }),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={
              card.dueOn
                ? `Due date: ${formatDueDate(card.dueOn, today ?? serverToday)}`
                : "Due date"
            }
          />
        }
      >
        <CalendarIcon aria-hidden />
        Due date
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto"
        // Start on the selected day (or today): react-day-picker makes that day the
        // grid's only tabbable button.
        initialFocus={() =>
          calendarRef.current?.querySelector<HTMLElement>('[role="grid"] button[tabindex="0"]') ??
          true
        }
      >
        <PopoverHeader>
          <PopoverTitle>Due date</PopoverTitle>
        </PopoverHeader>
        <div ref={calendarRef}>
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            startMonth={START_MONTH}
            endMonth={END_MONTH}
            onSelect={(date) => save(toDateOnly(date))}
            className="p-0"
          />
        </div>
        {card.dueOn ? (
          <Button variant="outline" size="sm" onClick={() => save(null)}>
            Remove
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** "Done" checkbox shown next to the due date (sets or clears completed_at). */
export function DoneCheckbox({ card }: { card: CardDates }) {
  const { boardId, mutate } = useBoard();
  const labelId = useId();

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox
        aria-labelledby={labelId}
        checked={card.completedAt !== null}
        onCheckedChange={(completed) =>
          mutate(
            {
              type: "setCompleted",
              cardId: card.id,
              completedAt: completed ? new Date().toISOString() : null,
            },
            () => setCardCompleted({ boardId, cardId: card.id, completed }),
          )
        }
      />
      <span id={labelId}>Done</span>
    </label>
  );
}
