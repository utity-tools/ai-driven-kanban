"use client";

import { ChevronLeftIcon, PencilIcon, PlusIcon, TagIcon } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  attachLabel,
  createLabel,
  deleteLabel,
  detachLabel,
  updateLabel,
} from "@/lib/boards/actions";
import { labelCardCount } from "@/lib/boards/board-updates";
import { labelDeletionSummary } from "@/lib/boards/copy";
import {
  LABEL_COLORS,
  type LabelColor,
  isLabelColor,
  labelAccessibleName,
  labelColorClasses,
  labelColorName,
} from "@/lib/boards/label-colors";
import { LABEL_NAME_MAX, firstIssueMessage, labelNameSchema } from "@/lib/boards/schemas";
import type { CardDetail, Label } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

import { useBoard } from "./board-context";

type Screen =
  | { name: "list" }
  | { name: "create" }
  | { name: "edit"; label: Label }
  | { name: "delete"; label: Label };

/**
 * "Labels" button of the card modal. The popover lists the board's labels
 * with a checkbox each (attach/detach) and an edit button; it also creates,
 * edits and deletes board labels, one screen at a time. Focus moves to the
 * first field of each screen and back to the button that led there.
 */
export function LabelPicker({ card }: { card: Pick<CardDetail, "id" | "labels"> }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "list" });
  const listRef = useRef<HTMLDivElement>(null);
  // What to focus when the list screen comes back (a CSS selector inside it).
  const focusOnList = useRef<string | null>(null);

  useEffect(() => {
    if (screen.name !== "list" || !focusOnList.current) return;
    const target = listRef.current?.querySelector<HTMLElement>(focusOnList.current);
    focusOnList.current = null;
    target?.focus();
  }, [screen]);

  function backToList(focus: string) {
    focusOnList.current = focus;
    setScreen({ name: "list" });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setScreen({ name: "list" });
      }}
    >
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <TagIcon aria-hidden />
        Labels
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        {screen.name === "list" ? (
          <div ref={listRef} className="contents">
            <LabelList
              card={card}
              onCreate={() => setScreen({ name: "create" })}
              onEdit={(label) => setScreen({ name: "edit", label })}
            />
          </div>
        ) : screen.name === "delete" ? (
          <DeleteLabel
            label={screen.label}
            onCancel={() => setScreen({ name: "edit", label: screen.label })}
            onDeleted={() => backToList("[data-create-label]")}
          />
        ) : (
          <LabelForm
            key={screen.name === "edit" ? screen.label.id : "create"}
            cardId={card.id}
            label={screen.name === "edit" ? screen.label : null}
            onBack={() =>
              backToList(
                screen.name === "edit"
                  ? `[data-edit-label="${screen.label.id}"]`
                  : "[data-create-label]",
              )
            }
            onDelete={(label) => setScreen({ name: "delete", label })}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function LabelList({
  card,
  onCreate,
  onEdit,
}: {
  card: Pick<CardDetail, "id" | "labels">;
  onCreate: () => void;
  onEdit: (label: Label) => void;
}) {
  const { view } = useBoard();
  const attached = new Set(card.labels.map((label) => label.id));

  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Labels</PopoverTitle>
      </PopoverHeader>
      {view.labels.length === 0 ? (
        <p className="text-muted-foreground">This board has no labels yet.</p>
      ) : (
        <ul aria-label="Board labels" className="grid gap-1">
          {view.labels.map((label) => (
            <li key={label.id} className="flex items-center gap-1">
              <LabelOption cardId={card.id} label={label} checked={attached.has(label.id)} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit label ${labelAccessibleName(label)}`}
                data-edit-label={label.id}
                onClick={() => onEdit(label)}
              >
                <PencilIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" data-create-label="" onClick={onCreate}>
        <PlusIcon aria-hidden />
        Create a label
      </Button>
    </>
  );
}

function LabelOption({
  cardId,
  label,
  checked,
}: {
  cardId: string;
  label: Label;
  checked: boolean;
}) {
  const { boardId, mutate } = useBoard();
  const nameId = useId();

  function toggle(attach: boolean) {
    const input = { boardId, cardId, labelId: label.id };
    if (attach) {
      mutate({ type: "attachLabel", cardId, labelId: label.id }, () => attachLabel(input));
    } else {
      mutate({ type: "detachLabel", cardId, labelId: label.id }, () => detachLabel(input));
    }
  }

  return (
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-0.5 pl-1">
      <Checkbox aria-labelledby={nameId} checked={checked} onCheckedChange={toggle} />
      <LabelBar label={label} id={nameId} />
    </label>
  );
}

/** A wide coloured bar with the label's name (or its colour, for assistive tech). */
function LabelBar({ label, id }: { label: Label; id?: string }) {
  const classes = labelColorClasses(label.color);
  const name = label.name.trim();
  return (
    <span
      id={id}
      className={cn(
        "flex h-7 min-w-0 flex-1 items-center truncate rounded-md px-2 text-sm font-medium",
        name ? classes.chip : classes.swatch,
      )}
    >
      {name || <span className="sr-only">{labelAccessibleName(label)}</span>}
    </span>
  );
}

function LabelForm({
  cardId,
  label,
  onBack,
  onDelete,
}: {
  cardId: string;
  /** `null` creates a label (attached to the card). */
  label: Label | null;
  onBack: () => void;
  onDelete: (label: Label) => void;
}) {
  const { boardId, mutate } = useBoard();
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<LabelColor>(
    label && isLabelColor(label.color) ? label.color : "green",
  );
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const errorId = useId();
  const title = label ? "Edit label" : "Create a label";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = labelNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(firstIssueMessage(parsed.error));
      return;
    }
    const next = { name: parsed.data, color };

    if (label) {
      if (next.name !== label.name || next.color !== label.color) {
        const updated = { ...label, ...next };
        mutate({ type: "updateLabel", label: updated }, () =>
          updateLabel({ boardId, labelId: label.id, ...next }),
        );
      }
    } else {
      const created = { id: crypto.randomUUID(), ...next };
      mutate({ type: "addLabel", label: created, cardId }, () =>
        createLabel({ boardId, labelId: created.id, cardId, ...next }),
      );
    }
    onBack();
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <PopoverHeader className="flex-row items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Back to labels"
          onClick={onBack}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>

      <div aria-hidden className="flex rounded-md bg-muted p-3">
        <LabelBar label={{ id: "preview", name, color }} />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
        <Input
          id={nameId}
          value={name}
          maxLength={LABEL_NAME_MAX}
          autoFocus
          autoComplete="off"
          placeholder="Optional"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Colour</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLORS.map((option) => (
            <label key={option} className="relative flex cursor-pointer">
              <input
                type="radio"
                name={`${nameId}-color`}
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                aria-label={labelColorName(option)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                title={labelColorName(option)}
                className={cn(
                  "h-7 w-full rounded-md ring-offset-2 ring-offset-popover peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring",
                  labelColorClasses(option).swatch,
                )}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-between gap-2">
        <Button type="submit" size="sm">
          {label ? "Save" : "Create"}
        </Button>
        {label ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(label)}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function DeleteLabel({
  label,
  onCancel,
  onDeleted,
}: {
  label: Label;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const { view, boardId, mutate } = useBoard();
  const count = labelCardCount(view, label.id);

  function confirm() {
    mutate({ type: "deleteLabel", labelId: label.id }, () =>
      deleteLabel({ boardId, labelId: label.id }),
    );
    onDeleted();
  }

  return (
    <div className="grid gap-3">
      <PopoverHeader>
        <PopoverTitle>Delete label “{labelAccessibleName(label)}”?</PopoverTitle>
        <PopoverDescription>{labelDeletionSummary(count)}</PopoverDescription>
      </PopoverHeader>
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" size="sm" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={confirm}>
          Delete label
        </Button>
      </div>
    </div>
  );
}
