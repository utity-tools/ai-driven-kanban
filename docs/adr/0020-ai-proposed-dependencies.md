# 0020. AI-proposed dependencies: reviewed proposals saved with a `source`

- **Status:** accepted
- **Date:** 2026-09-29

## Context

Card dependencies (ADR 0017) are added by hand through the blocker picker. v0.3 closes with the
AI proposing which cards of the board block the open card, following the same rule as subtasks
(ADR 0014, 0015): the model only proposes, a person reviews, and nothing is saved without their
confirmation. We also want accepted dependencies to be **marked as AI in the card**, which needs
the origin to be stored, and a column clients can set freely would make that mark meaningless.

## Decision

A **"Suggest blockers with AI"** action in the card's "Blocked by" section streams a proposal
that the user reviews; accepted blockers are saved through an RPC that is the only way to write
`card_dependencies.source = 'ai'`.

- **Scope:** only the open card (the target). Board-wide suggestions are out of scope.
- **Prompt (`dependencies-v1`):** the target card and up to 100 candidate cards (active, in
  board order, excluding the target, its current blockers and every card downstream of it). All
  card text is untrusted and delimited; titles and columns are forced onto one line so they
  cannot forge candidate lines. Candidates are sent as **short refs** (`c1`, `c2`, …) instead of
  UUIDs: fewer tokens, no mistyped ids, and an invented ref simply fails to map back. The Zod
  output is at most 10 `{ blocker, rationale }` pairs; an empty list is a valid answer.
- **Route** `POST /api/cards/[cardId]/dependencies/suggest` mirrors the decompose route: feature
  flag, owner/editor only, same daily quota (ADR 0016). Archived cards, no candidates and a card
  already at 20 blockers answer 409 **before** quota is reserved. The candidates are built on the
  server, and their ids are returned in the `X-Candidate-Ids` header in ref order, so the client
  maps refs against the exact snapshot the model saw even if Realtime (ADR 0019) changes the board
  mid-stream.
- **Filtering** is pure (`src/lib/ai/dependency-proposals.ts`): the server only uses it to build
  the candidates; the client maps the streamed refs and drops unknown refs, the target,
  duplicates, archived cards, existing blockers and cycle-closing blockers, capping the list by
  the remaining room under 20. The accept RPC is the authoritative final check. Checking each
  proposal against the existing graph is enough: every new edge points at the same target, so a
  cycle can use at most one new edge and the batch cannot close a cycle among its own proposals.
- **Saving:** `public.accept_ai_dependencies(p_card_id, p_blocker_ids uuid[])`, a thin
  SECURITY DEFINER wrapper over `private.accept_ai_dependencies`, validates all-or-nothing (1–10
  distinct active blockers of the same board, not already blocking the card) and inserts with
  `source = 'ai'`; the existing trigger still rejects cycles and the 20-blocker cap. The insert
  policy on `card_dependencies` forces `source = 'manual'` for every other insert, and no column
  is updatable.
- **Meaning of `'ai'`:** as for subtasks (ADR 0015), it means "saved through the
  accept-a-reviewed-proposal flow", not proof that the model chose it: an owner/editor could call
  the RPC directly with ids of their choosing. That is not a privilege escalation (they could add
  the same edges as manual), so the mark and any metric built on it are best-effort.
- **UI:** the review panel mirrors the subtask one (all checked, uncheck to drop, Add/Discard/Stop,
  quota hint); an "AI" marker, shared with subtasks, shows on dependencies with `source = 'ai'`
  in "Blocked by" and "Blocks". Board card faces are unchanged.

## Alternatives considered

- **No `source` column, save like manual dependencies:** no migration and a simpler deploy, but
  the origin would be lost for good and the card could not show which blockers came from the AI.
- **Client inserts with `source = 'ai'` directly:** trivial, but any member could label anything
  as AI, making the mark meaningless.
- **UUIDs in the prompt:** no mapping step, but ~10x the tokens per candidate and a real risk of
  the model mistyping an id.
- **Client recomputes the candidate order from its own board view:** no header, but a Realtime
  refresh during the stream could shift positions and map a ref to the wrong card.
- **Board-wide suggestions:** more useful for planning, but a larger prompt and review UI;
  deferred.

## Consequences

- Accepted AI dependencies are visible as such and can later feed evals (acceptance rate).
- The accept RPC rejects existing edges and archived blockers, so the client must filter them out
  first; a board change during review surfaces as "The board changed… Try again."
- There is no eval dataset for `dependencies-v1` yet; it belongs to the v0.4 evals work.
- Deploying requires approving the production migration (ADR 0013).
