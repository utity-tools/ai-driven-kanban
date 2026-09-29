-- v0.3 delivery 4: Realtime. The database tells a board's open clients that something changed;
-- the clients refetch through the normal (RLS-protected) queries.
--
-- * Broadcast from the database, not Postgres Changes. Every write that changes what a board
--   shows sends one Realtime Broadcast message on the private channel `board:<board uuid>`:
--     event   'change'
--     payload { "table": <table name>, "op": "INSERT" | "UPDATE" | "DELETE" }
--   The payload carries NO row data: authorization for the data itself stays in the table
--   policies, which the refetch goes through. realtime.send() also adds an "id" key (a random
--   message uuid) to every payload; it is not row data.
--   Tables: boards (UPDATE, DELETE), board_members, board_columns, cards, board_labels,
--   card_labels, card_assignees, card_subtasks, card_dependencies (INSERT, UPDATE, DELETE).
--   Not broadcast: board_invites (owner-only; the members dialog fetches it when it opens),
--   boards INSERT (nobody can be subscribed to a board that did not exist yet), profiles and
--   the AI quota tables (not board state).
--   Membership: inserting, removing or changing the role of a member broadcasts too, so a
--   removed or demoted user's client refreshes and gets redirected / new permissions.
--   No table joins the supabase_realtime publication: Postgres Changes stays unused.
--
-- * Statement-level triggers with transition tables (private.broadcast_board_change):
--   one message per (board, table, operation) per statement, not per row, so a bulk move or
--   accepting 20 AI subtasks sends one message. Postgres fires the statement triggers of FK
--   cascades once per table for the whole top-level statement (deleting a column with 30
--   cards sends one cards DELETE, not 30). A table needs three triggers because transition
--   tables are only allowed on single-event triggers.
--   DELETEs on child tables are not broadcast for boards that no longer exist: deleting a
--   board sends a single boards DELETE instead of one message per cascaded table.
--
-- * Failure handling: a broadcast is a best-effort cache-invalidation hint; the database rows
--   are the source of truth and clients also refetch when they (re)subscribe. So a failing
--   broadcast must never roll back the user's write. realtime.send() already turns its own
--   errors into a WARNING (e.g. no messages partition for today); the trigger function also
--   wraps its whole body in an exception handler that downgrades any error to a WARNING.
--   Messages are inserted in the writing transaction, so a rolled-back write sends nothing.
--
-- * Why SECURITY DEFINER (schema private, ADR 0007): realtime.send() is SECURITY INVOKER and
--   inserts into realtime.messages. Run as the writing user it would hit the RLS policies
--   below, which on purpose do not let clients insert broadcast messages. As the owner
--   (postgres, BYPASSRLS) it can, and the "does the board still exist" check sees the board
--   even after the writer lost access (a member leaving). The function reads nothing but the
--   trigger's own transition tables and boards ids, and builds the payload from trigger
--   metadata only.
--
-- * Realtime Authorization (RLS on realtime.messages): Realtime checks these policies when a
--   client joins a private channel (it sets realtime.topic and the user's JWT claims, then
--   tries to read / write test rows as that user).
--   - Receive broadcast and presence on `board:<id>`: any member (owner, editor, viewer).
--   - Send presence (track) on `board:<id>`: any member.
--   - Send broadcast: nobody. Only the database sends board broadcasts (as the table owner).
--   - anon: nothing (policies are for authenticated only).
--   The row's topic must also equal realtime.topic() (defence in depth: Realtime only checks
--   rows of the channel being joined, but a session that sets realtime.topic by hand must not
--   read another board's messages through it).
--   The board id is parsed by internal.board_id_from_realtime_topic(), which returns null for
--   anything that is not exactly `board:<uuid>` (no cast error), and has_board_role(null, ...)
--   is false.
--   Clients must join with { config: { private: true } } and an authenticated session.

-- ---------------------------------------------------------------------------
-- Topic parsing
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER and pure, so it lives in internal (ADR 0007). Policies run it as the
-- querying user, so authenticated needs EXECUTE.
create function internal.board_id_from_realtime_topic(p_topic text)
returns uuid
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select case
    when p_topic ~ '^board:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
      then substr(p_topic, 7)::uuid
  end;
$$;

comment on function internal.board_id_from_realtime_topic(text) is
  'Board id of a Realtime topic "board:<uuid>"; null for any other topic (never raises).';

revoke execute on function internal.board_id_from_realtime_topic(text) from public, anon;
grant execute on function internal.board_id_from_realtime_topic(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Broadcast trigger
-- ---------------------------------------------------------------------------

create function private.broadcast_board_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Column of the table that holds the board id: 'board_id', or 'id' on boards.
  v_column text := tg_argv[0];
  v_board_ids uuid[];
  v_board_id uuid;
begin
  begin
    -- Transition tables (new_rows / old_rows) are only visible to dynamic SQL here, and only
    -- the ones this trigger's event defines.
    if tg_op = 'INSERT' then
      execute format('select array_agg(distinct %I) from new_rows', v_column)
        into v_board_ids;
    elsif tg_op = 'UPDATE' then
      execute format(
        'select array_agg(distinct b) from (select %1$I as b from new_rows '
        'union select %1$I from old_rows) s', v_column)
        into v_board_ids;
    else
      execute format('select array_agg(distinct %I) from old_rows', v_column)
        into v_board_ids;
    end if;

    -- A cascade from deleting the board itself: the boards DELETE broadcast covers it.
    if tg_op = 'DELETE' and tg_table_name <> 'boards' then
      select array_agg(b.id) into v_board_ids
      from public.boards b
      where b.id = any (v_board_ids);
    end if;

    foreach v_board_id in array coalesce(v_board_ids, '{}') loop
      perform realtime.send(
        jsonb_build_object('table', tg_table_name, 'op', tg_op),
        'change',
        'board:' || v_board_id::text,
        true
      );
    end loop;
  exception
    when others then
      -- Never fail the user's write because of a broadcast (see the migration header).
      raise warning 'broadcast_board_change on %.% (%): % (SQLSTATE %)',
        tg_table_schema, tg_table_name, tg_op, sqlerrm, sqlstate;
  end;

  return null;
end;
$$;

comment on function private.broadcast_board_change() is
  'AFTER ... FOR EACH STATEMENT trigger: sends one Realtime broadcast (event "change", payload '
  '{table, op}, no row data) on the private topic "board:<id>" per board touched by the '
  'statement. Argument: the column holding the board id. Never raises.';

revoke execute on function private.broadcast_board_change() from public, anon, authenticated;

-- boards: INSERT is not broadcast (nobody can be subscribed to a new board yet).
create trigger boards_broadcast_update
  after update on public.boards
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('id');
create trigger boards_broadcast_delete
  after delete on public.boards
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('id');

create trigger board_members_broadcast_insert
  after insert on public.board_members
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger board_members_broadcast_update
  after update on public.board_members
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger board_members_broadcast_delete
  after delete on public.board_members
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

create trigger board_columns_broadcast_insert
  after insert on public.board_columns
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger board_columns_broadcast_update
  after update on public.board_columns
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger board_columns_broadcast_delete
  after delete on public.board_columns
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

create trigger cards_broadcast_insert
  after insert on public.cards
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger cards_broadcast_update
  after update on public.cards
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger cards_broadcast_delete
  after delete on public.cards
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

create trigger board_labels_broadcast_insert
  after insert on public.board_labels
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger board_labels_broadcast_update
  after update on public.board_labels
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger board_labels_broadcast_delete
  after delete on public.board_labels
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

-- card_labels and card_assignees have no UPDATE grant today; the triggers still cover it.
create trigger card_labels_broadcast_insert
  after insert on public.card_labels
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_labels_broadcast_update
  after update on public.card_labels
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_labels_broadcast_delete
  after delete on public.card_labels
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

create trigger card_assignees_broadcast_insert
  after insert on public.card_assignees
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_assignees_broadcast_update
  after update on public.card_assignees
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_assignees_broadcast_delete
  after delete on public.card_assignees
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

create trigger card_subtasks_broadcast_insert
  after insert on public.card_subtasks
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_subtasks_broadcast_update
  after update on public.card_subtasks
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_subtasks_broadcast_delete
  after delete on public.card_subtasks
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

-- card_dependencies rows are immutable (no UPDATE grant); the UPDATE trigger is a safety net.
create trigger card_dependencies_broadcast_insert
  after insert on public.card_dependencies
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_dependencies_broadcast_update
  after update on public.card_dependencies
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.broadcast_board_change('board_id');
create trigger card_dependencies_broadcast_delete
  after delete on public.card_dependencies
  referencing old table as old_rows
  for each statement execute function private.broadcast_board_change('board_id');

-- ---------------------------------------------------------------------------
-- Realtime Authorization: private channels `board:<id>`
-- ---------------------------------------------------------------------------

-- Receiving: Realtime reads test rows of both extensions when a client joins.
create policy "board channels: members can receive broadcast and presence"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and realtime.messages.topic = (select realtime.topic())
    and public.has_board_role(
      internal.board_id_from_realtime_topic((select realtime.topic())),
      '{owner,editor,viewer}'
    )
  );

-- Sending: presence only. No policy admits extension = 'broadcast', so clients cannot
-- broadcast on board channels; the database does (as the table owner, bypassing RLS).
create policy "board channels: members can track presence"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and realtime.messages.topic = (select realtime.topic())
    and public.has_board_role(
      internal.board_id_from_realtime_topic((select realtime.topic())),
      '{owner,editor,viewer}'
    )
  );
