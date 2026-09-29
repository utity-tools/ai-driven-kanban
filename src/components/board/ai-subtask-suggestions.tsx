"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { SparklesIcon, SquareIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { QUOTA_REMAINING_HEADER, parseQuotaRemaining, quotaRemainingMessage } from "@/lib/ai/quota";
import {
  EMPTY_PROPOSAL_ERROR,
  type ReviewItem,
  addSubtasksLabel,
  decompositionErrorMessage,
  optimisticAiSubtasks,
  reviewSelection,
  reviewTitleError,
  streamedSubtasks,
  toAcceptPayload,
  toReviewItems,
} from "@/lib/ai/review";
import { decompositionProposalSchema } from "@/lib/ai/schemas";
import { formatPoints, spellPoints } from "@/lib/subtasks/estimates";
import { acceptAiSubtasks } from "@/lib/subtasks/actions";
import { SUBTASK_TITLE_MAX } from "@/lib/subtasks/schemas";
import type { Subtask } from "@/lib/subtasks/subtask";
import { cn } from "@/lib/utils";

import { useBoard } from "./board-context";
import { SubtaskEstimatePicker } from "./subtask-estimate-picker";

type Props = {
  cardId: string;
  /** The card's current checklist: new rows go after it, and it caps the selection. */
  subtasks: readonly Subtask[];
  /** Whether "Suggest with AI" may show; an open panel stays whatever this says. */
  available: boolean;
};

type Phase = "idle" | "streaming" | "review" | "error";

/**
 * "Suggest with AI" in the card's Subtasks section: streams a proposal from
 * the decompose route, then lets the user review it (every row checked by
 * default; titles and estimates editable) before anything is saved. Nothing
 * reaches the database until "Add N subtasks".
 *
 * Focus: starting moves it to the "AI suggestions" heading; when the control
 * that had focus goes away (Stop, Retry) it returns there; closing the review
 * returns it to "Suggest with AI".
 */
export function AiSubtaskSuggestions({ cardId, subtasks, available }: Props) {
  const { boardId, mutate } = useBoard();
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const headingId = useId();
  // Daily suggestions left, known after the first request (ADR 0016); null until then.
  const [remaining, setRemaining] = useState<number | null>(null);
  const quotaHintId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  // Focus fallback when the opener is gone (an accept can hide it by filling the card).
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef<"heading" | "opener" | "restore" | null>(null);

  const { object, submit, stop, clear } = useObject({
    api: `/api/cards/${cardId}/decompose`,
    schema: decompositionProposalSchema,
    async fetch(input, init) {
      const response = await fetch(input, init);
      // 429: the daily quota (the caller's or the global one) is spent until midnight UTC.
      const left =
        response.status === 429
          ? 0
          : parseQuotaRemaining(response.headers.get(QUOTA_REMAINING_HEADER));
      if (left !== null) setRemaining(left);
      return response;
    },
    onFinish({ object: proposal }) {
      // An empty body (the model failed mid-stream) or an invalid object both end here.
      const streamed = proposal ? streamedSubtasks(proposal) : [];
      if (streamed.length === 0) {
        fail(EMPTY_PROPOSAL_ERROR);
        return;
      }
      go("review");
      setItems(toReviewItems(streamed, () => crypto.randomUUID()));
      setAnnouncement(
        `${streamed.length} ${streamed.length === 1 ? "subtask" : "subtasks"} suggested. Review them before adding.`,
      );
    },
    onError(requestError) {
      fail(decompositionErrorMessage(requestError));
    },
  });

  // useObject doesn't abort on unmount: closing the card stops generation (and its cost).
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    const target = focusAfterRender.current;
    focusAfterRender.current = null;
    if (target === "heading") headingRef.current?.focus();
    else if (target === "opener") (openerRef.current ?? rootRef.current)?.focus();
    else if (target === "restore" && !panelRef.current?.contains(document.activeElement)) {
      // The focused control (Stop, Retry, Add) was unmounted.
      headingRef.current?.focus();
    }
  }, [phase]);

  /** Changes phase, keeping focus in the panel if it was there. */
  function go(next: Phase) {
    if (panelRef.current?.contains(document.activeElement)) focusAfterRender.current = "restore";
    setPhase(next);
  }

  function fail(message: string) {
    go("error");
    setError(message);
    setAnnouncement(message);
  }

  function start() {
    const fromIdle = phase === "idle";
    go("streaming");
    if (fromIdle) focusAfterRender.current = "heading";
    setError(null);
    setSaveError(null);
    setItems([]);
    setAnnouncement("Generating subtasks…");
    submit({});
  }

  function stopStreaming() {
    stop();
    const streamed = streamedSubtasks(object);
    if (streamed.length === 0) {
      close("Stopped. No subtasks were suggested.");
      return;
    }
    focusAfterRender.current = "heading";
    setPhase("review");
    setItems(toReviewItems(streamed, () => crypto.randomUUID()));
    setAnnouncement(`Stopped. Review the ${streamed.length} suggested so far.`);
  }

  function close(message: string) {
    clear();
    focusAfterRender.current = "opener";
    setPhase("idle");
    setItems([]);
    setError(null);
    setSaveError(null);
    setAnnouncement(message);
  }

  function update(key: string, change: Partial<Omit<ReviewItem, "key">>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }

  const selection = reviewSelection(items, subtasks.length);

  function accept() {
    if (!selection.canSubmit || saving) return;
    const payload = toAcceptPayload(boardId, cardId, items);
    const added = optimisticAiSubtasks(subtasks, payload.subtasks, () => crypto.randomUUID());
    setSaving(true);
    setSaveError(null);
    setAnnouncement("Adding subtasks…");
    mutate({ type: "addSubtasks", cardId, subtasks: added }, () => acceptAiSubtasks(payload), {
      onSuccess() {
        setSaving(false);
        close(`Added ${added.length} ${added.length === 1 ? "subtask" : "subtasks"}.`);
      },
      onError(message) {
        setSaving(false);
        setSaveError(message);
        setAnnouncement(message);
      },
    });
  }

  const streaming = phase === "streaming";
  const streamed = streaming ? streamedSubtasks(object) : [];

  const exhausted = remaining === 0;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label="AI suggestions for subtasks"
      className="grid gap-1 outline-none"
    >
      {phase === "idle" ? (
        available ? (
          <div className="grid justify-items-start gap-1">
            <Button
              ref={openerRef}
              variant="outline"
              size="sm"
              // aria-disabled, not disabled: closing the review returns focus here.
              aria-disabled={exhausted || undefined}
              aria-describedby={remaining !== null ? quotaHintId : undefined}
              className={cn(exhausted && "cursor-not-allowed opacity-50")}
              onClick={exhausted ? undefined : start}
            >
              <SparklesIcon aria-hidden />
              Suggest with AI
            </Button>
            {remaining !== null ? (
              <p id={quotaHintId} className="text-xs text-muted-foreground">
                {quotaRemainingMessage(remaining)}
              </p>
            ) : null}
          </div>
        ) : null
      ) : (
        <section
          ref={panelRef}
          aria-labelledby={headingId}
          aria-busy={streaming || saving}
          className="grid gap-3 rounded-lg border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4
              ref={headingRef}
              id={headingId}
              tabIndex={-1}
              className="flex items-center gap-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
            >
              <SparklesIcon aria-hidden />
              AI suggestions
            </h4>
            {streaming ? (
              <Button variant="outline" size="xs" onClick={stopStreaming}>
                <SquareIcon aria-hidden />
                Stop
              </Button>
            ) : null}
          </div>

          {streaming ? (
            <>
              <p className="text-sm text-muted-foreground" aria-hidden>
                Generating subtasks…
              </p>
              {streamed.length > 0 ? (
                <ul aria-label="Suggested subtasks" className="grid gap-1">
                  {streamed.map((subtask, index) => (
                    <li
                      // Streamed rows only grow at the end, so the index is stable here.
                      key={index}
                      className="flex min-h-8 items-start gap-2 py-1 text-sm leading-6"
                    >
                      <span className="min-w-0 flex-1 break-words">{subtask.title}</span>
                      {subtask.estimate !== null ? (
                        <Badge variant="secondary" className="mt-0.5 tabular-nums">
                          <span aria-hidden>{formatPoints(subtask.estimate)}</span>
                          <span className="sr-only">Estimate: {spellPoints(subtask.estimate)}</span>
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : phase === "error" ? (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <div className="flex gap-2">
                {exhausted ? null : (
                  <Button size="sm" onClick={start}>
                    Retry
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => close("Suggestions discarded.")}>
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Uncheck what you don&apos;t want and edit the rest. Nothing is saved until you add
                them.
              </p>
              <ul aria-label="Suggested subtasks" className="grid gap-2">
                {items.map((item, index) => (
                  <ReviewRow
                    key={item.key}
                    item={item}
                    number={index + 1}
                    disabled={saving}
                    onChange={(change) => update(item.key, change)}
                  />
                ))}
              </ul>
              {selection.problem && items.length > 0 ? (
                <p className="text-xs text-muted-foreground">{selection.problem}</p>
              ) : null}
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!selection.canSubmit || saving} onClick={accept}>
                  {addSubtasksLabel(selection.checkedCount)}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => close("Suggestions discarded.")}
                >
                  Discard
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {/* Always mounted, so every change is announced (a freshly mounted live region often isn't). */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function ReviewRow({
  item,
  number,
  disabled,
  onChange,
}: {
  item: ReviewItem;
  number: number;
  disabled: boolean;
  onChange: (change: Partial<Omit<ReviewItem, "key">>) => void;
}) {
  const errorId = useId();
  const name = `suggested subtask ${number}`;
  // Unchecked rows aren't saved, so their titles don't need to be valid.
  const titleError = item.checked ? reviewTitleError(item.title) : null;

  return (
    <li className="grid gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label={`Include ${name}`}
          checked={item.checked}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ checked })}
        />
        <Input
          aria-label={`Title of ${name}`}
          value={item.title}
          maxLength={SUBTASK_TITLE_MAX}
          disabled={disabled}
          aria-invalid={titleError !== null || undefined}
          aria-describedby={titleError ? errorId : undefined}
          onChange={(event) => onChange({ title: event.target.value })}
          className={cn("h-8 flex-1", !item.checked && "text-muted-foreground line-through")}
        />
        <SubtaskEstimatePicker
          estimate={item.estimate}
          subtaskTitle={name}
          onChange={(estimate) => onChange({ estimate })}
        />
      </div>
      {titleError ? (
        <p id={errorId} className="pl-6 text-xs text-destructive">
          {titleError}
        </p>
      ) : null}
    </li>
  );
}
