# 0015. Reviewing and accepting AI subtask proposals

- **Status:** accepted
- **Date:** 2026-09-28

## Context

[ADR 0014](0014-ai-decomposition-layer.md) streams a subtask proposal for a card but saves
nothing. Delivery 4 adds the other half: a human reviews the proposal and only what they
confirm is saved. Three constraints shape it:

- The `card_subtasks` INSERT policy forces `source = 'manual'` for clients, so rows marked
  `source = 'ai'` need a server-side write path.
- Every model call costs money. Before this delivery the decompose route only required that
  the caller could _see_ the card, so a viewer could spend tokens on a proposal they can never
  save.
- A model error mid-stream arrives as HTTP 200 with an empty body (ADR 0014), so the UI can't
  rely on the status code to detect failure.

## Decision

The user reviews the proposal in the card modal, and a Server Action saves only the subtasks
they kept, through a dedicated RPC.

- **RPC:** `public.accept_ai_subtasks(p_card_id, p_subtasks jsonb)` is a thin SECURITY DEFINER
  wrapper around `private.accept_ai_subtasks`, which does the work
  ([ADR 0007](0007-date-only-due-dates-and-internal-schema.md): definer internals live in
  `private`). It checks, before inserting anything:
  - the caller is signed in and not an anonymous demo user;
  - the caller is owner or editor of the card's board (`has_board_role`). A missing card and a
    forbidden card give the same error on purpose;
  - the card is not archived;
  - the payload is 1–8 `{title, estimate}` objects with the table's own limits.

  It inserts the rows in one statement with `source = 'ai'` and `created_by = auth.uid()`,
  after the card's existing subtasks: each new position is the last key plus one character
  (`'1'`..`'8'`), which stays a valid fractional-indexing key and sorts after everything
  already there. The card row is locked, so two concurrent accepts can't compute the same
  positions. The existing trigger still caps a card at 100 subtasks.

- **Route:** `POST /api/cards/[cardId]/decompose` now also requires owner or editor (403 for
  viewers), so only people who can save a proposal can pay for one.
- **Server Action:** `acceptAiSubtasks` (`src/lib/subtasks/actions.ts`) validates its input
  with `acceptProposalSchema`, which reuses the proposal's own limits, calls the RPC as the
  user through `runBoardAction`, and maps error codes to messages safe to show.
- **Review UI:** `AiSubtaskSuggestions` in the card's Subtasks section uses
  `experimental_useObject` from `@ai-sdk/react`.
  - Rows render as they stream. At the end every row is checked, and titles and estimates are
    editable.
  - Stop aborts the request and keeps what arrived. Closing the card also aborts it.
  - An empty or schema-invalid final object is an error with Retry, whatever the status code.
  - Saving is optimistic and rolls back on failure. Nothing is written before "Add N
    subtasks".
  - The button is hidden when `AI_DECOMPOSITION_ENABLED` is off (only that boolean reaches the
    client), for viewers and on archived cards. For demo users it is disabled with an
    explanation.
  - Pure logic (availability, selection validity, payload, optimistic rows) lives in
    `src/lib/ai/review.ts` with unit tests.
- **Dependency:** `@ai-sdk/react` is pinned to the exact release that depends on the installed
  `ai` version (3.0.296 for `ai@6.0.293`), so the lockfile keeps a single copy of `ai`. The two
  must be upgraded together.

### What `source = 'ai'` means

The RPC is granted to `authenticated`, so an owner or editor can call it directly from the
browser (`supabase.rpc`) with titles they wrote themselves. We accept this: `source = 'ai'`
means **"saved through the accept-a-reviewed-proposal flow"**, not proof that the model wrote
the text. Acceptance metrics built on it are best-effort. It is not a privilege escalation:
it only works on boards where the caller can already add the same rows as `manual`. This
supersedes the stronger wording in the comments of the `card_subtasks` migration ("acceptance
metrics cannot be forged"), which is already applied and is not edited.

## Alternatives considered

- **Server-persisted proposals:** store each proposal server-side when the stream ends (an
  `ai_proposals` table) and accept it by id plus the indices the user kept. This is the only
  option that proves the text came from the model, and it would give a real acceptance rate
  (proposed vs kept). Deferred: it needs a new table with RLS, changes to the streaming route,
  and a decision on how edited titles relate to the stored proposal. Revisit if AI metrics
  start to matter (v0.4 evals and observability).
- **Grant the RPC only to `service_role` and call it with an admin client:** hides the RPC from
  the browser, but puts the service role key in the app's runtime, where a bug would bypass
  RLS everywhere. Too much blast radius for a metrics label.
- **Accept through the existing `createSubtask` action, once per row:** can't write
  `source = 'ai'` because of the INSERT policy, and saving 8 rows would not be atomic.

## Consequences

- AI-proposed subtasks reach the database only after explicit confirmation, validated twice
  (Zod in the action, the same checks again in the RPC), atomically.
- Viewers no longer trigger model calls. Demo users still can't; their quota is delivery 5.
- Positions of repeatedly accepted batches grow by one character per accept. Keys stay
  valid, and a later manual reorder rewrites a row's key anyway.
- E2E tests mock the decompose route in the browser (`page.route`) and save through the real
  action and RPC. Stop in the middle of a stream isn't covered: a mocked response arrives in
  one piece.
- Production keeps `AI_DECOMPOSITION_ENABLED` off until delivery 5 adds per-user quotas.
