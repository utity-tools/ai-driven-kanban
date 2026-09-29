# 0019. Realtime: change notices broadcast from the database, clients refetch

- **Status:** accepted
- **Date:** 2026-09-29

## Context

With invitations (ADR 0018) several people can work on one board. Until now each browser only
saw its own changes (optimistic updates, then the Server Action's fresh board) and other people's
changes after a reload. The board state comes from the server (`getBoardView`) and the client
layers `useOptimistic` on top; any live-update design has to fit that model and must not bypass
the authorization model (ADR 0004).

## Decision

The database **broadcasts a minimal change notice** on a **private channel per board**, and
clients **refetch the board** (`router.refresh()`) when one arrives. Presence on the same channel
shows who is viewing the board.

- **Notices:** statement-level AFTER triggers on the board tables (`boards`, `board_members`,
  `board_columns`, `cards`, `board_labels`, `card_labels`, `card_assignees`, `card_subtasks`,
  `card_dependencies`) call `realtime.send` with `{table, op}` on topic `board:<id>`, event
  `change`. One message per board, table and operation per statement, so bulk moves and foreign
  key cascades do not flood the channel. **No row data** is sent: clients refetch through RLS.
  `board_invites` (owner-only) and board inserts are not broadcast.
- **Best effort:** the trigger function never fails the user's write; a broadcast error becomes a
  warning. Notices are hints, the rows are the truth, and clients catch up on reconnect and when
  the tab becomes visible again.
- **Authorization:** Realtime Authorization policies on `realtime.messages`: members of the board
  (any role) can receive broadcast and presence and track their own presence on `board:<id>`;
  **no client can send a broadcast**. The topic is parsed by a pure helper that returns null for
  anything but `board:<uuid>`, so a malformed topic is denied, never an error. The trigger
  function is SECURITY DEFINER in `private` (it must send even after the writer lost access, e.g.
  leaving a board); the topic parser is SECURITY INVOKER in `internal` (ADR 0007).
- **Client:** a hook joins the private channel, coalesces notices into one debounced refresh
  (at most one in flight), refreshes on reconnect and on tab focus, redirects to `/boards` with a
  notice when the viewer lost access, and closes an open card that was deleted. Optimistic
  updates are unaffected: a refresh only replaces the base view.
- **Presence:** each client tracks its user id; the header shows the other members viewing now
  (one entry per user across tabs), with names and avatars taken from the board's member list.
- **Supabase settings:** Realtime "Allow public access" must be off on hosted projects, so only
  private (authorized) channels exist.

## Alternatives considered

- **Postgres Changes (`supabase_realtime` publication):** the usual tutorial approach, but DELETE
  events cannot be filtered by board (every subscriber gets every board's deletes, primary keys
  only), and RLS is evaluated per subscriber per change, which scales poorly.
- **Row-level `realtime.broadcast_changes`:** sends whole rows (more data to authorize and keep
  consistent) and one message per row.
- **Applying payloads to client state:** fewer requests, but duplicates the server's view logic in
  the client and risks drift with optimistic updates. Refetching one board is cheap at this scale.
- **Polling:** simple, but slow to show changes and wasteful when nothing happens.

## Consequences

- Every change costs each viewer one board refetch (debounced). Fine for boards of a few hundred
  cards; revisit with incremental updates if boards grow large.
- A removed member keeps receiving notices (never data) until their client leaves the channel,
  because authorization is checked when joining. The client redirects on the next notice.
- Profile changes (names, avatars) are not broadcast.
- CI's E2E job now starts the Realtime service.
