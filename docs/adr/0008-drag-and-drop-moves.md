# 0008. Drag and drop: the server computes positions from neighbour hints

- **Status:** accepted
- **Date:** 2026-09-25

## Context

Cards and columns are ordered by fractional-indexing keys (`position`, `COLLATE "C"`). Drag and
drop has to turn "I dropped this card between A and B" into a new key, while:

- the client's board may be stale (another tab or member moved, archived or restored cards);
- archived cards keep their position in the column, so a restored card goes back to its place.
  The client doesn't see them in the column, but a new key must not collide with theirs;
- any client can POST to a Server Action, so the input can't be trusted.

## Decision

The client sends **neighbour hints**, not a position: `moveCard({ boardId, cardId, columnId,
previousId, nextId })` and `moveColumn({ boardId, columnId, previousId, nextId })`, where the ids
are the items the user dropped between (`null` at either end). The server reads the current
siblings (for cards: every card of the destination column, archived ones included) and calls
`positionForMove` (`src/lib/boards/positions.ts`):

- if `previousId` is still there, the key goes between it and its **real** successor;
- otherwise, if `nextId` is still there, between its real predecessor and it;
- otherwise (including an empty destination), after the last sibling.

The result is always a valid key, so a stale view never fails a move. At worst the item lands next
to the neighbour that still exists. Only the moved row is updated. The composite foreign key
`(column_id, board_id)` stops a card from moving to another board's column, and RLS stops viewers.

The UI shows the move at once with `useOptimistic`. It runs the same `positionForMove` over the
cards it can see, and the server's answer replaces that state. dnd-kit keeps the order of ids
during a drag. On drop, one optimistic update and one Server Action carry the final neighbours; a
drop back on the original place sends nothing.

## Alternatives considered

- **Client computes the key and sends it:** simpler, but the client doesn't see archived cards and
  may be stale, so keys could collide or go out of order, and the server would have to trust or
  re-check them anyway.
- **Integer positions, renumbering the column on each move:** writes every card of the column per
  move and conflicts badly between concurrent members.
- **A Postgres RPC doing the read and write in one transaction:** atomic, but two concurrent
  moves into the same gap only produce equal keys, which the `id` tie-break already orders. It
  isn't worth another SECURITY boundary for now.

## Consequences

- Moves stay cheap (one read and one update) and don't renumber anything.
- Concurrent moves into the same gap can produce equal keys. Order then falls back to `id` (same
  rule in SQL and in `compareByPosition`), and `positionForMove` handles ties without throwing.
- Keys grow slowly when items are repeatedly dropped into the same gap. If that ever matters, a
  rebalance job can rewrite the keys of one column.
- When Realtime lands (v0.3), other members' moves arrive as new positions. The same
  neighbour-hint model keeps concurrent drags safe.
