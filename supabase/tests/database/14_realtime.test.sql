-- Realtime (v0.3): broadcast from the database and Realtime Authorization.
--
-- Writes to a board's tables send one broadcast per (board, table, operation) per statement on
-- the private topic "board:<id>": event 'change', payload {table, op} (+ the message id that
-- realtime.send adds), no row data. board_invites and boards INSERT are not broadcast; deleting
-- a board sends a single boards DELETE. A failing broadcast never fails the write.
-- RLS on realtime.messages: members (any role) receive broadcast/presence and track presence on
-- their board's topic; nobody else, nobody sends broadcast, malformed topics are denied without
-- an error, anon gets nothing.
--
-- realtime.send() writes to realtime.messages in the current transaction, so the messages are
-- asserted there (the test runs as postgres, which bypasses RLS on realtime.messages; the
-- pg_temp helpers are SECURITY DEFINER so they read every message whatever the current role).
begin;
create extension if not exists pgtap with schema extensions;

select plan(64);

-- Broadcasts sent on a board's topic in this transaction, as sorted 'table:op' strings.
create function pg_temp.changes(p_board_id uuid)
returns text[]
language sql
security definer
as $$
  select coalesce(
    array_agg((m.payload ->> 'table') || ':' || (m.payload ->> 'op')
              order by ((m.payload ->> 'table') || ':' || (m.payload ->> 'op')) collate "C"),
    '{}')
  from realtime.messages m
  where m.topic = 'board:' || p_board_id::text
    and m.extension = 'broadcast';
$$;

-- Forget the broadcasts sent so far (rolled back with the test).
create function pg_temp.clear_changes()
returns void
language sql
security definer
as $$
  delete from realtime.messages where extension = 'broadcast';
$$;

grant execute on function pg_temp.changes(uuid), pg_temp.clear_changes() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Schema: functions
-- ---------------------------------------------------------------------------

select has_function('internal', 'board_id_from_realtime_topic', array['text'],
  'internal.board_id_from_realtime_topic(text) exists');
select ok(
  (select not p.prosecdef and p.provolatile = 'i' and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'internal.board_id_from_realtime_topic(text)'::regprocedure),
  'the topic parser is security invoker, immutable, with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'internal.board_id_from_realtime_topic(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.board_id_from_realtime_topic(text)', 'EXECUTE')
  and not has_function_privilege('public', 'internal.board_id_from_realtime_topic(text)', 'EXECUTE'),
  'the topic parser is executable by authenticated only (policies run it as the user)'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.broadcast_board_change()'::regprocedure),
  'the broadcast trigger function is security definer with an empty search_path'
);
select ok(
  not has_function_privilege('authenticated', 'private.broadcast_board_change()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.broadcast_board_change()', 'EXECUTE')
  and not has_function_privilege('public', 'private.broadcast_board_change()', 'EXECUTE'),
  'nobody can call the broadcast trigger function directly'
);

select is(
  array[
    internal.board_id_from_realtime_topic('board:0a1b2c3d-0000-4000-8000-00000000abcd'),
    internal.board_id_from_realtime_topic('board:0A1B2C3D-0000-4000-8000-00000000ABCD')
  ],
  array['0a1b2c3d-0000-4000-8000-00000000abcd'::uuid, '0a1b2c3d-0000-4000-8000-00000000abcd'::uuid],
  'the parser returns the board id of "board:<uuid>" (any case)'
);
select is(
  (select count(internal.board_id_from_realtime_topic(t))::int
   from unnest(array[
     'board:not-a-uuid', 'board:', 'board', 'boards:0a1b2c3d-0000-4000-8000-00000000abcd',
     '0a1b2c3d-0000-4000-8000-00000000abcd', 'board:0a1b2c3d-0000-4000-8000-00000000abcd:x',
     ' board:0a1b2c3d-0000-4000-8000-00000000abcd', 'board:0a1b2c3d00004000800000000000abcd',
     'board:{0a1b2c3d-0000-4000-8000-00000000abcd}', '', null
   ]) t),
  0,
  'the parser returns null, without raising, for anything else'
);

-- ---------------------------------------------------------------------------
-- Schema: triggers
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(
            t.tgrelid::regclass::text || ':' || t.tgname
            || ':' || case when t.tgtype & 4 > 0 then 'I' when t.tgtype & 8 > 0 then 'D' else 'U' end
            order by t.tgrelid::regclass::text, t.tgname)
   from pg_trigger t
   where t.tgfoid = 'private.broadcast_board_change()'::regprocedure),
  array[
    'board_columns:board_columns_broadcast_delete:D',
    'board_columns:board_columns_broadcast_insert:I',
    'board_columns:board_columns_broadcast_update:U',
    'board_labels:board_labels_broadcast_delete:D',
    'board_labels:board_labels_broadcast_insert:I',
    'board_labels:board_labels_broadcast_update:U',
    'board_members:board_members_broadcast_delete:D',
    'board_members:board_members_broadcast_insert:I',
    'board_members:board_members_broadcast_update:U',
    'boards:boards_broadcast_delete:D',
    'boards:boards_broadcast_update:U',
    'card_assignees:card_assignees_broadcast_delete:D',
    'card_assignees:card_assignees_broadcast_insert:I',
    'card_assignees:card_assignees_broadcast_update:U',
    'card_dependencies:card_dependencies_broadcast_delete:D',
    'card_dependencies:card_dependencies_broadcast_insert:I',
    'card_dependencies:card_dependencies_broadcast_update:U',
    'card_labels:card_labels_broadcast_delete:D',
    'card_labels:card_labels_broadcast_insert:I',
    'card_labels:card_labels_broadcast_update:U',
    'card_subtasks:card_subtasks_broadcast_delete:D',
    'card_subtasks:card_subtasks_broadcast_insert:I',
    'card_subtasks:card_subtasks_broadcast_update:U',
    'cards:cards_broadcast_delete:D',
    'cards:cards_broadcast_insert:I',
    'cards:cards_broadcast_update:U'
  ],
  'broadcast triggers: insert/update/delete on every board table, update/delete on boards'
);
select ok(
  (select bool_and(
            t.tgtype & 1 = 0     -- FOR EACH STATEMENT
            and t.tgtype & 2 = 0 -- AFTER
            and t.tgenabled = 'O'
            and case when t.tgtype & 4 > 0 then t.tgnewtable is not null and t.tgoldtable is null
                     when t.tgtype & 8 > 0 then t.tgoldtable is not null and t.tgnewtable is null
                     else t.tgoldtable is not null and t.tgnewtable is not null end
            and encode(t.tgargs, 'escape') = case when t.tgrelid = 'public.boards'::regclass
                                                  then 'id\000' else 'board_id\000' end)
   from pg_trigger t
   where t.tgfoid = 'private.broadcast_board_change()'::regprocedure),
  'every broadcast trigger is AFTER ... FOR EACH STATEMENT with its transition tables and board column'
);
select is_empty(
  $$ select 1 from pg_trigger t
     where t.tgrelid = 'public.board_invites'::regclass
       and t.tgfoid = 'private.broadcast_board_change()'::regprocedure $$,
  'board_invites is not broadcast'
);
select is_empty(
  $$ select 1 from pg_publication_tables
     where schemaname = 'public'
       and tablename in ('boards', 'board_members', 'board_columns', 'cards', 'board_labels',
                         'card_labels', 'card_assignees', 'card_subtasks', 'card_dependencies',
                         'board_invites') $$,
  'no board table is in a publication (Postgres Changes stays unused)'
);

-- ---------------------------------------------------------------------------
-- Schema: Realtime Authorization
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass),
  'RLS on realtime.messages');
select policies_are(
  'realtime', 'messages',
  array[
    'board channels: members can receive broadcast and presence',
    'board channels: members can track presence'
  ],
  'realtime.messages has exactly the board channel policies'
);
select policy_roles_are('realtime', 'messages', 'board channels: members can receive broadcast and presence',
  array['authenticated'], 'the receive policy applies to authenticated only');
select policy_roles_are('realtime', 'messages', 'board channels: members can track presence',
  array['authenticated'], 'the presence policy applies to authenticated only');
select policy_cmd_is('realtime', 'messages', 'board channels: members can track presence', 'INSERT',
  'the only write policy is an INSERT policy');

-- ---------------------------------------------------------------------------
-- Fixtures: O = owner, E = editor, V = viewer, M = member whose role changes, X = outsider.
-- Board 1 "Realtime" (O; E editor, V viewer, M editor). Board 2 "Doomed" (O).
-- Board 3 "Outside" (X).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000001401', 'o14@test.local'),
  ('00000000-0000-4000-a000-000000001402', 'e14@test.local'),
  ('00000000-0000-4000-a000-000000001403', 'v14@test.local'),
  ('00000000-0000-4000-a000-000000001404', 'm14@test.local'),
  ('00000000-0000-4000-a000-000000001405', 'x14@test.local');

grant usage on schema extensions to anon, authenticated;

select pg_temp.clear_changes();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001405", "role": "authenticated"}', true);
select set_config('test.board3', public.create_board('Outside')::text, true);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001401", "role": "authenticated"}', true);
select set_config('test.board1', public.create_board('Realtime')::text, true);
select set_config('test.board2', public.create_board('Doomed')::text, true);

-- ---------------------------------------------------------------------------
-- Broadcasts: shape
-- ---------------------------------------------------------------------------

select is(
  pg_temp.changes(current_setting('test.board1')::uuid),
  array['board_columns:INSERT', 'board_members:INSERT'],
  'creating a board broadcasts its owner membership and default columns once each, not the board insert'
);
select set_config('realtime.topic', '', true);
select is(
  (select count(*)::int from realtime.messages
   where topic = 'board:' || current_setting('test.board1') and extension = 'broadcast'),
  0,
  'the owner cannot read the messages table without a Realtime topic set'
);

reset role;
select ok(
  (select bool_and(m.event = 'change' and m.private and m.extension = 'broadcast'
                   and m.topic ~ '^board:[0-9a-f-]{36}$'
                   and (select array_agg(k order by k) from jsonb_object_keys(m.payload) k)
                       = array['actor', 'id', 'op', 'table']
                   and m.payload ->> 'op' in ('INSERT', 'UPDATE', 'DELETE'))
   from realtime.messages m
   where m.topic in ('board:' || current_setting('test.board1'), 'board:' || current_setting('test.board2'),
                     'board:' || current_setting('test.board3'))),
  'every broadcast is private, event "change", payload {actor, id, table, op} only (no row data)'
);
select ok(
  (select bool_and(m.payload ->> 'actor' = '00000000-0000-4000-a000-000000001401')
   from realtime.messages m
   where m.topic = 'board:' || current_setting('test.board1')
     and m.payload ->> 'table' = 'board_columns' and m.payload ->> 'op' = 'INSERT'),
  'the actor is the user who made the change'
);
select is(
  (select count(*)::int from realtime.messages m
   where m.topic = 'board:' || current_setting('test.board1')
     and (m.payload ? 'board_id' or m.payload ? 'record' or m.payload ? 'old_record' or m.payload ? 'title')),
  0,
  'no broadcast carries row data'
);
select pg_temp.clear_changes();
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Broadcasts: one per board, table and operation per statement
-- ---------------------------------------------------------------------------

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001402', 'editor'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001403', 'viewer'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001404', 'editor');
  $$,
  'owner adds an editor, a viewer and a member'
);
select is(pg_temp.changes(current_setting('test.board1')::uuid), array['board_members:INSERT'],
  'adding three members in one statement sends one board_members INSERT');
select pg_temp.clear_changes();

select set_config('test.col1',
  (select id::text from public.board_columns where board_id = current_setting('test.board1')::uuid and position = 'a0'), true);
select set_config('test.col3',
  (select id::text from public.board_columns where board_id = current_setting('test.board1')::uuid and position = 'a2'), true);

insert into public.cards (id, board_id, column_id, title, position) values
  ('00000000-0000-4000-c000-000000001401', current_setting('test.board1')::uuid, current_setting('test.col1')::uuid, 'One', 'a0'),
  ('00000000-0000-4000-c000-000000001402', current_setting('test.board1')::uuid, current_setting('test.col1')::uuid, 'Two', 'a1'),
  ('00000000-0000-4000-c000-000000001403', current_setting('test.board1')::uuid, current_setting('test.col3')::uuid, 'Three', 'a0'),
  ('00000000-0000-4000-c000-000000001404', current_setting('test.board1')::uuid, current_setting('test.col3')::uuid, 'Four', 'a1');
select is(pg_temp.changes(current_setting('test.board1')::uuid), array['cards:INSERT'],
  'inserting four cards in one statement sends one cards INSERT');
select pg_temp.clear_changes();

update public.cards set position = position || 'V' where board_id = current_setting('test.board1')::uuid;
select is(pg_temp.changes(current_setting('test.board1')::uuid), array['cards:UPDATE'],
  'a bulk move sends one cards UPDATE');
select pg_temp.clear_changes();

update public.cards set title = 'Nothing' where id = '00000000-0000-4000-c000-0000000014ff';
select is(pg_temp.changes(current_setting('test.board1')::uuid), '{}'::text[],
  'a statement that changes no rows sends nothing');

-- Inserts on every other child table.
insert into public.board_labels (id, board_id, name, color) values
  ('00000000-0000-4000-d000-000000001401', current_setting('test.board1')::uuid, 'Bug', 'red');
insert into public.card_labels (card_id, label_id, board_id) values
  ('00000000-0000-4000-c000-000000001401', '00000000-0000-4000-d000-000000001401', current_setting('test.board1')::uuid),
  ('00000000-0000-4000-c000-000000001403', '00000000-0000-4000-d000-000000001401', current_setting('test.board1')::uuid),
  ('00000000-0000-4000-c000-000000001404', '00000000-0000-4000-d000-000000001401', current_setting('test.board1')::uuid);
insert into public.card_assignees (card_id, user_id, board_id) values
  ('00000000-0000-4000-c000-000000001401', '00000000-0000-4000-a000-000000001404', current_setting('test.board1')::uuid);
insert into public.card_subtasks (board_id, card_id, title, position) values
  (current_setting('test.board1')::uuid, '00000000-0000-4000-c000-000000001401', 'Sub', 'a0'),
  (current_setting('test.board1')::uuid, '00000000-0000-4000-c000-000000001403', 'Sub', 'a0'),
  (current_setting('test.board1')::uuid, '00000000-0000-4000-c000-000000001404', 'Sub', 'a0');
insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id) values
  (current_setting('test.board1')::uuid, '00000000-0000-4000-c000-000000001401', '00000000-0000-4000-c000-000000001402');
insert into public.board_columns (board_id, title, position) values
  (current_setting('test.board1')::uuid, 'Review', 'a3');
select is(
  pg_temp.changes(current_setting('test.board1')::uuid),
  array['board_columns:INSERT', 'board_labels:INSERT', 'card_assignees:INSERT', 'card_dependencies:INSERT',
        'card_labels:INSERT', 'card_subtasks:INSERT'],
  'inserts on columns, labels, card labels, assignees, subtasks and dependencies broadcast once each'
);
select pg_temp.clear_changes();

-- Updates.
update public.boards set title = 'Realtime!' where id = current_setting('test.board1')::uuid;
update public.board_columns set title = 'Backlog' where id = current_setting('test.col1')::uuid;
update public.board_labels set color = 'blue' where id = '00000000-0000-4000-d000-000000001401';
update public.card_subtasks set completed_at = now() where board_id = current_setting('test.board1')::uuid;
update public.board_members set role = 'viewer'
where board_id = current_setting('test.board1')::uuid and user_id = '00000000-0000-4000-a000-000000001404';
select is(
  pg_temp.changes(current_setting('test.board1')::uuid),
  array['board_columns:UPDATE', 'board_labels:UPDATE', 'board_members:UPDATE', 'boards:UPDATE',
        'card_subtasks:UPDATE'],
  'updates on the board, columns, labels, subtasks and a member''s role broadcast once each'
);
select pg_temp.clear_changes();

-- Deletes.
delete from public.card_dependencies where board_id = current_setting('test.board1')::uuid;
delete from public.card_labels where card_id = '00000000-0000-4000-c000-000000001401';
delete from public.card_assignees where card_id = '00000000-0000-4000-c000-000000001401';
delete from public.card_subtasks where card_id = '00000000-0000-4000-c000-000000001401';
delete from public.board_members
where board_id = current_setting('test.board1')::uuid and user_id = '00000000-0000-4000-a000-000000001404';
select is(
  pg_temp.changes(current_setting('test.board1')::uuid),
  array['board_members:DELETE', 'card_assignees:DELETE', 'card_dependencies:DELETE', 'card_labels:DELETE',
        'card_subtasks:DELETE'],
  'deleting dependencies, card labels, assignees, subtasks and a member broadcasts once each'
);
select pg_temp.clear_changes();

-- A cascade: the column holds two cards, each with a label and a subtask.
delete from public.board_columns where id = current_setting('test.col3')::uuid;
select is(
  pg_temp.changes(current_setting('test.board1')::uuid),
  array['board_columns:DELETE', 'card_labels:DELETE', 'card_subtasks:DELETE', 'cards:DELETE'],
  'deleting a column broadcasts once per cascaded table, not once per card'
);
select pg_temp.clear_changes();

update public.cards set archived_at = now() where id = '00000000-0000-4000-c000-000000001402';
select pg_temp.clear_changes();
delete from public.board_labels where id = '00000000-0000-4000-d000-000000001401';
delete from public.cards where id = '00000000-0000-4000-c000-000000001402';
select is(
  pg_temp.changes(current_setting('test.board1')::uuid),
  array['board_labels:DELETE', 'cards:DELETE'],
  'deleting a label and a card broadcasts once each'
);
select pg_temp.clear_changes();

-- One statement across two boards.
update public.board_columns set title = title
where board_id in (current_setting('test.board1')::uuid, current_setting('test.board2')::uuid);
select is(
  array[pg_temp.changes(current_setting('test.board1')::uuid), pg_temp.changes(current_setting('test.board2')::uuid)],
  array[array['board_columns:UPDATE'], array['board_columns:UPDATE']],
  'a statement touching two boards sends one message on each board''s topic'
);
select pg_temp.clear_changes();

-- Deleting a board: one message, not one per cascaded table.
insert into public.cards (board_id, column_id, title, position)
select b.id, c.id, 'Card', 'a0'
from public.boards b join public.board_columns c on c.board_id = b.id
where b.id = current_setting('test.board2')::uuid;
select pg_temp.clear_changes();
delete from public.boards where id = current_setting('test.board2')::uuid;
select is(pg_temp.changes(current_setting('test.board2')::uuid), array['boards:DELETE'],
  'deleting a board sends a single boards DELETE');
select pg_temp.clear_changes();

-- board_invites is not broadcast.
select lives_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  'owner creates an invite'
);
delete from public.board_invites where board_id = current_setting('test.board1')::uuid;
select is(pg_temp.changes(current_setting('test.board1')::uuid), '{}'::text[],
  'creating and revoking invites broadcasts nothing');

-- A write RLS rejects broadcasts nothing.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001403", "role": "authenticated"}', true);
update public.cards set title = 'Hijacked' where board_id = current_setting('test.board1')::uuid;
select is(pg_temp.changes(current_setting('test.board1')::uuid), '{}'::text[],
  'a viewer''s update (0 rows under RLS) broadcasts nothing');

-- ---------------------------------------------------------------------------
-- Failure handling: a broadcast error never fails the write
-- ---------------------------------------------------------------------------

reset role;
create table pg_temp.broken (board_id uuid);
create trigger broken_broadcast
  after insert on pg_temp.broken
  referencing new table as new_rows
  for each statement execute function private.broadcast_board_change('no_such_column');
select lives_ok(
  $$ insert into pg_temp.broken values (gen_random_uuid()) $$,
  'a failing broadcast (here: a bad trigger argument) is downgraded to a warning'
);
select is((select count(*)::int from pg_temp.broken), 1, 'and the row is written');

-- ---------------------------------------------------------------------------
-- Realtime Authorization. Realtime checks a join by setting realtime.topic and the user's
-- claims, then reading / inserting rows of that topic as the user.
-- ---------------------------------------------------------------------------

-- A broadcast and a presence row on each topic (inserted as postgres, bypassing RLS).
insert into realtime.messages (topic, extension, event, payload, private) values
  ('board:' || current_setting('test.board1'), 'broadcast', 'change', '{}', true),
  ('board:' || current_setting('test.board1'), 'presence', 'presence', '{}', true),
  ('board:' || current_setting('test.board3'), 'broadcast', 'change', '{}', true),
  ('board:' || current_setting('test.board3'), 'presence', 'presence', '{}', true);

set local role authenticated;

-- Owner --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001401", "role": "authenticated"}', true);
select set_config('realtime.topic', 'board:' || current_setting('test.board1'), true);

select is(
  (select array_agg(distinct extension order by extension) from realtime.messages),
  array['broadcast', 'presence'],
  'the owner receives broadcast and presence on their board''s topic'
);
select is(
  (select count(*)::int from realtime.messages where topic <> realtime.topic()),
  0,
  'and only messages of that topic'
);
select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values (realtime.topic(), 'presence', 'presence', '{}') $$,
  'the owner can track presence on their board''s topic'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload, private)
     values (realtime.topic(), 'broadcast', 'change', '{"table": "cards", "op": "DELETE"}', true) $$,
  '42501', null,
  'not even the owner can send a broadcast'
);
select lives_ok(
  $$ select realtime.send('{"table": "cards", "op": "DELETE"}', 'change', 'board:' || current_setting('test.board1'), true) $$,
  'realtime.send as a client does not raise (it downgrades errors to warnings)'
);
select is(
  (select count(*)::int from unnest(pg_temp.changes(current_setting('test.board1')::uuid)) c
   where c = 'cards:DELETE'),
  0,
  'but sends nothing: a client cannot broadcast through realtime.send either');
select set_config('realtime.topic', 'board:' || current_setting('test.board1'), true);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('board:' || current_setting('test.board3'), 'presence', 'presence', '{}') $$,
  '42501', null,
  'a presence row must be for the topic being joined'
);
select throws_ok(
  $$ delete from realtime.messages $$,
  '42501', null,
  'members cannot delete messages'
);
select results_eq(
  $$ with u as (update realtime.messages set payload = '{}' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'members cannot update messages'
);

-- Editor and viewer --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001402", "role": "authenticated"}', true);
select is(
  (select array_agg(distinct extension order by extension) from realtime.messages),
  array['broadcast', 'presence'],
  'an editor receives broadcast and presence'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001403", "role": "authenticated"}', true);
select is(
  (select array_agg(distinct extension order by extension) from realtime.messages),
  array['broadcast', 'presence'],
  'a viewer receives broadcast and presence'
);
select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values (realtime.topic(), 'presence', 'presence', '{}') $$,
  'a viewer can track presence'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload, private)
     values (realtime.topic(), 'broadcast', 'change', '{}', true) $$,
  '42501', null,
  'a viewer cannot send a broadcast'
);

-- Former member ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001404", "role": "authenticated"}', true);
select is((select count(*)::int from realtime.messages), 0,
  'a removed member no longer receives anything on the board''s topic');

-- Outsider -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001405", "role": "authenticated"}', true);
select is((select count(*)::int from realtime.messages), 0,
  'an outsider receives nothing on another board''s topic');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values (realtime.topic(), 'presence', 'presence', '{}') $$,
  '42501', null,
  'an outsider cannot track presence on another board''s topic'
);

select set_config('realtime.topic', 'board:' || current_setting('test.board3'), true);
select is(
  (select count(*)::int from realtime.messages
   where topic = 'board:' || current_setting('test.board1')),
  0,
  'an outsider joining their own board''s topic still cannot read another board''s messages'
);
select is(
  (select array_agg(distinct extension order by extension) from realtime.messages),
  array['broadcast', 'presence'],
  'while they do receive their own board''s messages'
);

-- Malformed and missing topics --------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001401", "role": "authenticated"}', true);

select set_config('realtime.topic', 'board:not-a-uuid', true);
select lives_ok($$ select count(*) from realtime.messages $$,
  'a malformed topic does not raise on read');
select is((select count(*)::int from realtime.messages), 0, 'and receives nothing');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values (realtime.topic(), 'presence', 'presence', '{}') $$,
  '42501', null,
  'a malformed topic is denied presence with an RLS error, not a cast error'
);

select set_config('realtime.topic', 'board:' || current_setting('test.board1') || ':x', true);
select is((select count(*)::int from realtime.messages), 0,
  'a topic with a suffix after the uuid receives nothing');

select set_config('realtime.topic', '', true);
select is((select count(*)::int from realtime.messages), 0, 'no topic receives nothing');

-- Leaving the board broadcasts the membership change (the trigger sees the board even though the
-- leaving member no longer can).
select pg_temp.clear_changes();
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001403", "role": "authenticated"}', true);
delete from public.board_members
where board_id = current_setting('test.board1')::uuid and user_id = '00000000-0000-4000-a000-000000001403';
select is(pg_temp.changes(current_setting('test.board1')::uuid), array['board_members:DELETE'],
  'a member leaving the board broadcasts a board_members DELETE');

-- anon ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select set_config('realtime.topic', 'board:' || current_setting('test.board1'), true);
select is((select count(*)::int from realtime.messages), 0, 'anon receives nothing');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values (realtime.topic(), 'presence', 'presence', '{}') $$,
  '42501', null,
  'anon cannot track presence'
);

reset role;
select * from finish();
rollback;
