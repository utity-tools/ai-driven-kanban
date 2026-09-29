"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { SparklesIcon, SquareIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CANDIDATE_IDS_HEADER,
  decodeCandidateIds,
  proposeDependencies,
  resolveCandidates,
} from "@/lib/ai/dependency-proposals";
import {
  type DependencyReviewItem,
  EMPTY_DEPENDENCY_PROPOSAL_ERROR,
  NO_DEPENDENCIES_MESSAGE,
  addBlockersLabel,
  dependencyReviewSelection,
  toDependencyAcceptPayload,
  toDependencyReviewItems,
} from "@/lib/ai/dependency-review";
import { QUOTA_REMAINING_HEADER, parseQuotaRemaining, quotaRemainingMessage } from "@/lib/ai/quota";
import { decompositionErrorMessage } from "@/lib/ai/review";
import { dependencyProposalSchema } from "@/lib/ai/schemas";
import { acceptAiDependencies } from "@/lib/boards/actions";
import type { BoardView } from "@/lib/boards/view-model";
import { cn } from "@/lib/utils";

import { useBoard } from "./board-context";

type Props = {
  cardId: string;
  /** How many blockers the card has: it caps the selection. */
  blockerCount: number;
};

type Phase = "idle" | "streaming" | "review" | "empty" | "error";

/**
 * "Suggest with AI" in the card's "Blocked by" list: streams a proposal from
 * the suggest route, then lets the user review it (every row checked by
 * default; rows can only be kept or dropped) before anything is saved.
 * Nothing reaches the database until "Add N blockers".
 *
 * Focus works as in AiSubtaskSuggestions: starting moves it to the "AI
 * suggestions" heading; when the control that had focus goes away (Stop,
 * Retry) it returns there; closing the review returns it to "Suggest with AI".
 */
export function AiDependencySuggestions({ cardId, blockerCount }: Props) {
  const { view, boardId, mutate } = useBoard();
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<DependencyReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // The ids the model saw, in reference order, from the response header.
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Callbacks of useObject may outlive a render: read the latest board and ids through refs.
  const viewRef = useRef(view);
  const idsRef = useRef<string[]>([]);
  useEffect(() => {
    viewRef.current = view;
  });

  const headingId = useId();
  const quotaHintId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useRef<"heading" | "opener" | "restore" | null>(null);

  function proposals(partial: Parameters<typeof proposeDependencies>[0], complete: boolean) {
    // Latest board and ids, for callbacks that outlive a render.
    return proposalsFor(cardId, viewRef.current, idsRef.current, partial, complete);
  }

  const { object, submit, stop, clear } = useObject({
    api: `/api/cards/${cardId}/dependencies/suggest`,
    schema: dependencyProposalSchema,
    async fetch(input, init) {
      const response = await fetch(input, init);
      // 429: the daily quota (the caller's or the global one) is spent until midnight UTC.
      const left =
        response.status === 429
          ? 0
          : parseQuotaRemaining(response.headers.get(QUOTA_REMAINING_HEADER));
      if (left !== null) setRemaining(left);
      const ids = decodeCandidateIds(response.headers.get(CANDIDATE_IDS_HEADER));
      idsRef.current = ids;
      setCandidateIds(ids);
      return response;
    },
    onFinish({ object: proposal }) {
      // An empty body (the model failed mid-stream) or an invalid object both end here.
      if (!proposal) {
        fail(EMPTY_DEPENDENCY_PROPOSAL_ERROR);
        return;
      }
      const valid = proposals(proposal, true);
      if (valid.length === 0) {
        go("empty");
        setAnnouncement(NO_DEPENDENCIES_MESSAGE);
        return;
      }
      go("review");
      setItems(toDependencyReviewItems(valid, () => crypto.randomUUID()));
      setAnnouncement(
        `${valid.length} ${valid.length === 1 ? "blocker" : "blockers"} suggested. Review them before adding.`,
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
    else if (target === "opener") openerRef.current?.focus();
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
    idsRef.current = [];
    setCandidateIds([]);
    setAnnouncement("Looking for blockers…");
    submit({});
  }

  function stopStreaming() {
    stop();
    const valid = proposals(object, false);
    if (valid.length === 0) {
      close("Stopped. No blockers were suggested.");
      return;
    }
    focusAfterRender.current = "heading";
    setPhase("review");
    setItems(toDependencyReviewItems(valid, () => crypto.randomUUID()));
    setAnnouncement(`Stopped. Review the ${valid.length} suggested so far.`);
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

  function toggle(key: string, checked: boolean) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, checked } : item)));
  }

  const selection = dependencyReviewSelection(items, blockerCount);

  function accept() {
    if (!selection.canSubmit || saving) return;
    const payload = toDependencyAcceptPayload(boardId, cardId, items);
    setSaving(true);
    setSaveError(null);
    setAnnouncement("Adding blockers…");
    mutate(
      { type: "addAiDependencies", blockerIds: payload.blockerIds, blockedId: cardId },
      () => acceptAiDependencies(payload),
      {
        onSuccess() {
          setSaving(false);
          const count = payload.blockerIds.length;
          close(`Added ${count} ${count === 1 ? "blocker" : "blockers"}.`);
        },
        onError(message) {
          setSaving(false);
          setSaveError(message);
          setAnnouncement(message);
        },
      },
    );
  }

  const streaming = phase === "streaming";
  // Recomputed each render while streaming; `candidateIds` only triggers the render once known.
  const streamed =
    streaming && candidateIds.length > 0
      ? proposalsFor(cardId, view, candidateIds, object, false)
      : [];
  const exhausted = remaining === 0;

  return (
    <div className="grid gap-1">
      {phase === "idle" ? (
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
            Suggest blockers with AI
          </Button>
          {remaining !== null ? (
            <p id={quotaHintId} className="text-xs text-muted-foreground">
              {quotaRemainingMessage(remaining)}
            </p>
          ) : null}
        </div>
      ) : (
        <section
          ref={panelRef}
          aria-labelledby={headingId}
          aria-busy={streaming || saving}
          className="grid gap-3 rounded-lg border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h5
              ref={headingRef}
              id={headingId}
              tabIndex={-1}
              className="flex items-center gap-1.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
            >
              <SparklesIcon aria-hidden />
              AI blocker suggestions
            </h5>
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
                Looking for blockers…
              </p>
              {streamed.length > 0 ? (
                <ul aria-label="Suggested blockers" className="grid gap-2">
                  {streamed.map((proposal) => (
                    <li key={proposal.blockerId} className="grid gap-0.5 text-sm">
                      <ProposalText proposal={proposal} />
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
          ) : phase === "empty" ? (
            <>
              <p className="text-sm text-muted-foreground">{NO_DEPENDENCIES_MESSAGE}</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => close("Suggestions discarded.")}>
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Uncheck the cards that don&apos;t block this one. Nothing is saved until you add
                them.
              </p>
              <ul aria-label="Suggested blockers" className="grid gap-2">
                {items.map((item) => (
                  <li key={item.key} className="flex items-start gap-2">
                    <Checkbox
                      aria-label={`Include ${item.title} as a blocker`}
                      checked={item.checked}
                      disabled={saving}
                      onCheckedChange={(checked) => toggle(item.key, checked)}
                      className="mt-1"
                    />
                    <div
                      className={cn(
                        "grid min-w-0 flex-1 gap-0.5 text-sm",
                        !item.checked && "text-muted-foreground",
                      )}
                    >
                      <ProposalText proposal={item} />
                    </div>
                  </li>
                ))}
              </ul>
              {selection.problem && items.length > 0 ? (
                <p className="text-xs text-muted-foreground">{selection.problem}</p>
              ) : null}
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!selection.canSubmit || saving} onClick={accept}>
                  {addBlockersLabel(selection.checkedCount)}
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

function proposalsFor(
  targetId: string,
  view: BoardView,
  ids: readonly string[],
  partial: Parameters<typeof proposeDependencies>[0],
  complete: boolean,
) {
  return proposeDependencies(
    partial,
    {
      targetId,
      candidates: resolveCandidates(view, ids),
      dependencies: view.dependencies,
    },
    { complete },
  );
}

function ProposalText({
  proposal,
}: {
  proposal: { title: string; columnTitle: string; rationale: string };
}) {
  return (
    <>
      <span className="font-medium break-words">{proposal.title}</span>
      <span className="text-xs text-muted-foreground">{proposal.columnTitle}</span>
      {proposal.rationale ? <span className="break-words">{proposal.rationale}</span> : null}
    </>
  );
}
