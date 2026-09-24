# 0007. Date-only due dates, and an `internal` schema for invoker helpers

- **Status:** accepted
- **Date:** 2026-09-24

## Context

**Due dates.** Cards stored `due_at timestamptz`, and the board view formatted it in UTC. A
date picked as "Oct 2" could show as Oct 1 or Oct 3 depending on the viewer's time zone.
Engineering tools such as Linear and Jira use date-only due dates; times belong to calendars.

**Shared SQL helpers.** The default columns (To do / In progress / Done) were defined twice: in
`handle_new_user()` (security definer, runs at sign-up) and `create_board()` (security invoker,
runs as the user). A shared helper had to work under both. The existing `private` schema is
closed to API roles on purpose (ADR 0006), and `public` would expose the helper as an API
endpoint.

## Decision

**Due dates are calendar dates:** `cards.due_on date` replaces `due_at`.

- "Due Oct 2" means due until the end of Oct 2 **in the viewer's time zone**.
- Existing values were converted with their UTC calendar date.
- A check keeps years between 2000 and 9999.
- Status is day-based and computed on the client, because only the browser knows the viewer's
  "today":
  - `done` when `completed_at` is set;
  - `overdue` before today;
  - `due-soon` for today or tomorrow;
  - `upcoming` otherwise.

**New `internal` schema for SECURITY INVOKER helpers**, e.g. `internal.add_default_columns()`:

- `authenticated` has `USAGE`; `anon` and `public` have nothing.
- It is not exposed by the API.
- Functions are not executable unless explicitly granted.
- Only SECURITY INVOKER functions are allowed there, and a pgTAP test enforces it: a helper runs
  with the caller's rights, so under `create_board()` normal RLS applies, and under the sign-up
  trigger it runs as the table owner.

| Schema     | Holds                                              | API roles                                   |
| ---------- | -------------------------------------------------- | ------------------------------------------- |
| `public`   | tables, policies, RPCs the app calls               | exposed through the API, RLS on every table |
| `internal` | SECURITY INVOKER helpers shared by functions       | `USAGE` for `authenticated`; not exposed    |
| `private`  | SECURITY DEFINER internals (e.g. metadata parsing) | no access at all                            |

## Alternatives considered

- **Keep `timestamptz` and store "end of day":** whose end of day? It still depends on a time zone
  chosen when writing.
- **Store the user's time zone in `profiles` and compute status on the server:** more moving
  parts, and wrong when people travel. Can be added later for emails or reminders.
- **SECURITY DEFINER helper in `private`:** any caller could then add columns to any board.
- **Helper in `public`:** becomes a callable RPC and part of the generated types.

## Consequences

- The migration is a breaking change for any deployment that still selects `due_at` against
  staging. App code and migration ship in the same PR.
- Due-date badges render on the client (after hydration), so they are not in the initial HTML.
- `internal` must never be added to the API's exposed schemas in any Supabase project.
- `completed_at` can still be set without a due date; the UI only offers "Done" when a date exists.
