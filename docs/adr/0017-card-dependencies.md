# 0017. Card dependencies: an acyclic graph enforced in Postgres, "done" columns

- **Status:** accepted
- **Date:** 2026-09-29

## Context

v0.3 adds dependencies ("card A blocks card B") so the board can show blocked cards and
bottlenecks, and so the AI can later propose dependencies for review. Three questions had to be
answered first:

- **What depends on what?** Cards or subtasks. Subtasks are a checklist inside one card; the
  board, where people look at the flow of work, is made of cards.
- **When does a blocker stop blocking?** Cards have no status column: their state is their
  column (ADR 0004), and columns are free-form and can be renamed or reordered.
- **Where are the invariants enforced?** The app talks to Supabase from the browser and from
  Server Actions, so a cycle check in application code alone can be bypassed or raced.

## Decision

Dependencies are **edges between cards of the same board**, stored in
`public.card_dependencies (board_id, blocker_card_id, blocked_card_id)`, and a blocker stops
blocking when it is in a column **explicitly marked as done** (`board_columns.is_done`) or is
archived.

- **Same board, by construction:** denormalised `board_id` with two composite FKs to
  `cards(id, board_id)`, the pattern of `card_labels` (ADR 0004). Deleting either card deletes
  the edge.
- **Authorization:** members read; owners and editors insert and delete; `created_by` is forced
  to the caller. Rows are **immutable** (no UPDATE grant or policy): an edge is changed by
  deleting it and inserting a new one, so only INSERT needs guarding.
- **Invariants in a BEFORE INSERT trigger** (`internal.check_card_dependency`):
  - acyclic: an edge `blocker -> blocked` is rejected if `blocked` already reaches `blocker`
    (recursive walk), SQLSTATE `DEP01`;
  - at most 20 blockers per card, SQLSTATE `DEP02`, which also bounds the walk;
  - a per-board transaction advisory lock serialises inserts, so two concurrent inserts
    (`A -> B` and `B -> A`) cannot both pass the check.
    Self-dependencies fail a CHECK constraint (23514) and duplicates the primary key (23505).
- **SECURITY INVOKER, not DEFINER:** every edge a walk can reach is on the new edge's board, and
  the trigger first locks the blocked card `FOR KEY SHARE`, which applies the cards UPDATE policy.
  So it only proceeds for owners and editors, who can read every edge of the board; everyone else
  is rejected by RLS right after, with a permission error rather than a cycle error. DEFINER would
  add nothing and could read edges the caller cannot.
- **"Done" columns:** `is_done boolean not null default false`, any number per board, editable by
  owners and editors. Existing columns titled "Done" were backfilled; default and demo boards
  create their Done column marked.
- **Graph logic in `src/lib/graph`:** pure functions (`wouldCreateCycle`, `findCycle`,
  `blockedCardIds`, `bottlenecks`) with unit tests. The UI uses `wouldCreateCycle` to hide
  options the database would reject; "blocked" and "bottleneck" are derived on read, not stored.

## Alternatives considered

- **Dependencies between subtasks:** finer-grained, but invisible on the board and mostly
  within one card, where the checklist order already expresses sequence.
- **The last column counts as done:** no schema change, but it breaks as soon as someone adds an
  "Archive" or "Won't do" column at the end.
- **A blocker never stops blocking** until the edge is deleted: simplest, but then "blocked" means
  "has a dependency", which says nothing useful.
- **Cycle check only in the app (or only in `src/lib/graph`):** bypassable from the browser and
  racy between two editors.
- **SECURITY DEFINER trigger in `private`:** see above; broader visibility with no benefit.
- **Storing a `blocked` flag on cards:** it would have to be recomputed on every move, archive,
  column toggle and edge change; deriving it from the edges and columns is cheap at board size.

## Consequences

- The app maps `DEP01` / `DEP02` to messages without parsing error text.
- A card moved into or out of a done column changes what is blocked without touching any
  dependency row; the UI must recompute after moves and column edits.
- The advisory lock makes dependency inserts on one board sequential, which is fine at human
  pace. In REPEATABLE READ or SERIALIZABLE the walk would use the transaction's first snapshot:
  PostgREST uses READ COMMITTED, but a future RPC with a stricter isolation level must not rely
  on the trigger alone.
- `card_dependencies` is not in the Realtime publication yet (v0.3 Realtime delivery).
- AI-proposed dependencies (later in v0.3) will go through the same table and trigger, so the
  model can never introduce a cycle.
