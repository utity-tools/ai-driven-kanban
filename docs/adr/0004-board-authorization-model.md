# 0004. Board authorization model: membership roles, enforced in Postgres

- **Status:** accepted
- **Date:** 2026-09-24

## Context

v0.1 introduces boards, columns, cards, labels and assignees. The app talks to Supabase from
the browser and from Server Actions, so authorization must hold even if application code is
wrong: it has to live in the database.

Collaboration is on the roadmap (the AI as a "team member", Realtime in v0.3), so the model must
support several people per board without rewriting every policy later.

## Decision

- **Membership table with roles:** `board_members(board_id, user_id, role)` with roles `owner`,
  `editor` and `viewer`. v0.1's UI only uses `owner`, but every policy is already role-based.
- **One helper for every policy:** `has_board_role(board_id, roles[])`, `security definer` with an
  empty `search_path`, so policies on `board_members` do not recurse.
- **Permissions:** members read; owners and editors write content; owners manage membership and
  delete the board; viewers are read-only; `anon` has no privileges at all.
- **The creator is always an owner.** `boards.owner_id` is the creator; a trigger adds them as an
  owner member and another trigger prevents removing or demoting them, or removing the last owner.
  This keeps `INSERT … RETURNING` working (the select policy also checks `owner_id`, because
  the membership row is created by an AFTER trigger) and makes "last owner" impossible to break.
- **Denormalised `board_id` plus composite foreign keys** on child tables: policies check
  membership with one indexed lookup (no joins), and the database guarantees a card, its column,
  its labels and its assignees all belong to the same board.
- **Privileges tightened beyond RLS:**
  - `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` are revoked from API roles. Supabase grants
    them by default, and `TRUNCATE` bypasses RLS.
  - Column-level `UPDATE` grants only. RLS decides which rows can be updated, not which columns,
    so without this an editor could rewrite `owner_id`, `board_id` or `created_by`.

## Alternatives considered

- **Owner-only boards (no membership table):** simpler for v0.1, but adding collaborators later
  would mean migrating data and rewriting every policy.
- **Authorization in application code:** one missed check exposes data; the browser can query
  Supabase directly.
- **Joins in policies instead of denormalised `board_id`:** slower on every row and harder to
  filter Realtime subscriptions by board.

## Consequences

- Every new table must enable RLS, repeat the privilege revokes and use column-level update
  grants (see AGENTS.md). pgTAP tests cover each policy.
- The creator cannot leave their own board, and there is no ownership transfer yet. Both need a
  later migration.
- Deleting the creator's account deletes their boards, even if other owners exist
  (`boards.owner_id` cascades). Acceptable for v0.1; revisit with ownership transfer.
- Cards cannot move between boards (`board_id` is not updatable).
