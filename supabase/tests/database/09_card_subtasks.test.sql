-- Card subtasks (v0.2 delivery 2): a checklist inside a card.
--
-- Owners and editors create, edit, check and delete subtasks; viewers only read; outsiders
-- and anon get nothing. board_id, card_id, source and created_by are fixed at insert time.
-- A card holds at most 100 subtasks.
-- An RLS-blocked UPDATE/DELETE is not an error (0 rows); a blocked INSERT raises 42501.
begin;
create extension if not exists pgtap with schema extensions;

select plan(69);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

select has_table('public', 'card_subtasks', 'card_subtasks exists');
select columns_are(
  'public', 'card_subtasks',
  array['id', 'board_id', 'card_id', 'title', 'estimate', 'position', 'completed_at', 'source',
        'created_by', 'created_at', 'updated_at'],
  'card_subtasks has exactly the expected columns'
);
select col_type_is('public', 'card_subtasks', 'estimate', 'smallint', 'estimate is a smallint');
select col_is_null('public', 'card_subtasks', 'estimate', 'estimate is optional');
select col_is_null('public', 'card_subtasks', 'completed_at', 'completed_at is optional (null = not done)');
select col_not_null('public', 'card_subtasks', 'source', 'source is required');
select col_default_is('public', 'card_subtasks', 'source', 'manual', 'source defaults to manual');

select is(
  (select co.collname::text
   from pg_attribute a join pg_collation co on co.oid = a.attcollation
   where a.attrelid = 'public.card_subtasks'::regclass and a.attname = 'position'),
  'C',
  'position uses the C (byte order) collation'
);

select fk_ok(
  'public', 'card_subtasks', array['card_id', 'board_id'],
  'public', 'cards', array['id', 'board_id'],
  'composite FK (card_id, board_id) -> cards (id, board_id): same board guaranteed'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'card_subtasks_card_same_board_fkey'),
  'c',
  'the card FK cascades on delete'
);

select has_index('public', 'card_subtasks', 'card_subtasks_card_id_position_idx', array['card_id', '"position"'],
  'index on card_subtasks(card_id, position)');
select has_index('public', 'card_subtasks', 'card_subtasks_board_id_idx', array['board_id'],
  'index on card_subtasks(board_id)');
select has_index('public', 'card_subtasks', 'card_subtasks_created_by_idx', array['created_by'],
  'index on card_subtasks(created_by)');

select has_trigger('public', 'card_subtasks', 'card_subtasks_set_updated_at', 'updated_at trigger exists');
select has_trigger('public', 'card_subtasks', 'card_subtasks_enforce_limit', 'limit trigger exists');

select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'internal.enforce_card_subtasks_limit()'::regprocedure),
  'the limit trigger function is security invoker with empty search_path'
);
select ok(
  not has_function_privilege('authenticated', 'internal.enforce_card_subtasks_limit()', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.enforce_card_subtasks_limit()', 'EXECUTE')
  and not has_function_privilege('public', 'internal.enforce_card_subtasks_limit()', 'EXECUTE'),
  'nobody can call the limit trigger function directly'
);

select ok((select relrowsecurity from pg_class where oid = 'public.card_subtasks'::regclass), 'RLS on card_subtasks');
select policies_are(
  'public', 'card_subtasks',
  array[
    'card_subtasks: members can read',
    'card_subtasks: owners and editors can create',
    'card_subtasks: owners and editors can update',
    'card_subtasks: owners and editors can delete'
  ],
  'card_subtasks has exactly the four expected policies'
);

select is(
  (select array_agg(a.attname::text order by a.attname)
   from pg_attribute a
   where a.attrelid = 'public.card_subtasks'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  array['completed_at', 'estimate', 'position', 'title'],
  'authenticated can update exactly title, estimate, position and completed_at'
);
select ok(
  not has_table_privilege('authenticated', 'public.card_subtasks', 'UPDATE'),
  'card_subtasks has no table-level UPDATE grant for authenticated'
);
select ok(
  not has_table_privilege('anon', 'public.card_subtasks', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  'anon has no privileges on card_subtasks'
);
select ok(
  not has_table_privilege('authenticated', 'public.card_subtasks', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  'authenticated cannot TRUNCATE, REFERENCES, TRIGGER or MAINTAIN card_subtasks'
);
select is_empty(
  $$ select 1 from pg_publication_tables where tablename = 'card_subtasks' $$,
  'card_subtasks is not in any publication (Realtime is v0.3)'
);

-- ---------------------------------------------------------------------------
-- Fixtures: O = owner, E = editor, V = viewer, X = outsider
-- Board 1 (O owns; E editor, V viewer) has cards A, C, D. Board 2 (O only) has card B.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000901', 'o9@test.local'),
  ('00000000-0000-4000-a000-000000000902', 'e9@test.local'),
  ('00000000-0000-4000-a000-000000000903', 'v9@test.local'),
  ('00000000-0000-4000-a000-000000000904', 'x9@test.local');

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000901", "role": "authenticated"}', true);

select set_config('test.board1', public.create_board('Subtasks')::text, true);
select set_config('test.board2', public.create_board('Other')::text, true);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000000902', 'editor'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000000903', 'viewer');
    insert into public.cards (id, board_id, column_id, title, position)
    select v.id::uuid, c.board_id, c.id, v.title, v.position
    from (values
      ('00000000-0000-4000-d000-00000000090a', current_setting('test.board1'), 'Card A', 'a0'),
      ('00000000-0000-4000-d000-00000000090c', current_setting('test.board1'), 'Card C', 'a1'),
      ('00000000-0000-4000-d000-00000000090d', current_setting('test.board1'), 'Card D', 'a2'),
      ('00000000-0000-4000-d000-00000000090b', current_setting('test.board2'), 'Card B', 'a0')
    ) as v (id, board_id, title, position)
    join public.board_columns c on c.board_id = v.board_id::uuid and c.position = 'a0';
  $$,
  'owner adds an editor, a viewer and cards on two boards'
);

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------

select results_eq(
  $$ insert into public.card_subtasks (id, board_id, card_id, title, position)
     values ('00000000-0000-4000-f000-000000000901', current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-00000000090a', 'Write the migration', 'a0')
     returning source, created_by, estimate, completed_at $$,
  $$ values ('manual', '00000000-0000-4000-a000-000000000901'::uuid, null::smallint, null::timestamptz) $$,
  'owner creates a subtask: source defaults to manual, created_by to the caller'
);

select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board2')::uuid, '00000000-0000-4000-d000-00000000090a', 'Wrong board', 'a1') $$,
  '23503', null,
  'a subtask cannot point to a card on another board (composite FK), even for an owner of both'
);

-- ---------------------------------------------------------------------------
-- Editor: create, edit, check, delete
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000902", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.card_subtasks (id, board_id, card_id, title, estimate, position)
     values ('00000000-0000-4000-f000-000000000902', current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-00000000090a', 'Estimated subtask', 5, 'a1') $$,
  'editor creates a subtask with an estimate'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position, source)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Forged', 'a2', 'ai') $$,
  '42501', null,
  'clients cannot insert source ai: only the accept-proposal flow writes it'
);

select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position, created_by)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Spoof', 'a2',
             '00000000-0000-4000-a000-000000000901') $$,
  '42501', null,
  'editor cannot create a subtask on behalf of someone else'
);

select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board2')::uuid, '00000000-0000-4000-d000-00000000090b', 'Not my board', 'a0') $$,
  '42501', null,
  'editor cannot add subtasks to a card on a board they do not belong to'
);

select results_eq(
  $$ update public.card_subtasks
     set title = 'Write and test the migration', estimate = 3, position = 'a2',
         completed_at = '2026-09-25 10:00:00+00'
     where id = '00000000-0000-4000-f000-000000000901'
     returning title, estimate, position collate "default", completed_at $$,
  $$ values ('Write and test the migration', 3::smallint, 'a2', '2026-09-25 10:00:00+00'::timestamptz) $$,
  'editor can rename, re-estimate, reorder and check a subtask'
);

select results_eq(
  $$ update public.card_subtasks set completed_at = null, estimate = null
     where id = '00000000-0000-4000-f000-000000000901' returning completed_at, estimate $$,
  $$ values (null::timestamptz, null::smallint) $$,
  'editor can uncheck a subtask and clear its estimate'
);

select throws_ok(
  $$ update public.card_subtasks set board_id = current_setting('test.board2')::uuid
     where id = '00000000-0000-4000-f000-000000000901' $$,
  '42501', null,
  'board_id is not updatable'
);
select throws_ok(
  $$ update public.card_subtasks set card_id = '00000000-0000-4000-d000-00000000090c'
     where id = '00000000-0000-4000-f000-000000000901' $$,
  '42501', null,
  'card_id is not updatable (subtasks do not move between cards)'
);
select throws_ok(
  $$ update public.card_subtasks set source = 'manual'
     where id = '00000000-0000-4000-f000-000000000902' $$,
  '42501', null,
  'source is not updatable'
);
select throws_ok(
  $$ update public.card_subtasks set created_by = '00000000-0000-4000-a000-000000000902'
     where id = '00000000-0000-4000-f000-000000000901' $$,
  '42501', null,
  'created_by is not updatable'
);

-- Checks --------------------------------------------------------------------------

select throws_ok(
  $$ update public.card_subtasks set title = '   ' where id = '00000000-0000-4000-f000-000000000901' $$,
  '23514', null,
  'a blank title is rejected'
);
select throws_ok(
  $$ update public.card_subtasks set title = repeat('x', 201) where id = '00000000-0000-4000-f000-000000000901' $$,
  '23514', null,
  'a title longer than 200 characters is rejected'
);
select lives_ok(
  $$ update public.card_subtasks set title = repeat('x', 200) where id = '00000000-0000-4000-f000-000000000901' $$,
  'a 200-character title is accepted'
);
select throws_ok(
  $$ update public.card_subtasks set estimate = 4 where id = '00000000-0000-4000-f000-000000000901' $$,
  '23514', null,
  'a non-Fibonacci estimate (4) is rejected'
);
select throws_ok(
  $$ update public.card_subtasks set estimate = 0 where id = '00000000-0000-4000-f000-000000000901' $$,
  '23514', null,
  'a zero estimate is rejected'
);
select throws_ok(
  $$ update public.card_subtasks set position = 'a-1' where id = '00000000-0000-4000-f000-000000000901' $$,
  '23514', null,
  'a position that is not a base62 key is rejected'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position, source)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Bot', 'a3', 'robot') $$,
  '42501', null,
  'clients cannot insert any source other than manual'
);
select col_has_check('public', 'card_subtasks', 'source', 'source is limited to manual or ai by a check');

-- ---------------------------------------------------------------------------
-- Viewer: read only
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000903", "role": "authenticated"}', true);

select results_eq(
  $$ select count(*)::int from public.card_subtasks where card_id = '00000000-0000-4000-d000-00000000090a' $$,
  $$ values (2) $$,
  'viewer reads the checklist'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Viewer', 'a3') $$,
  '42501', null,
  'viewer cannot create a subtask'
);
select is_empty(
  $$ update public.card_subtasks set completed_at = now()
     where card_id = '00000000-0000-4000-d000-00000000090a' returning 1 $$,
  'viewer cannot check subtasks'
);
select is_empty(
  $$ delete from public.card_subtasks where card_id = '00000000-0000-4000-d000-00000000090a' returning 1 $$,
  'viewer cannot delete subtasks'
);

-- ---------------------------------------------------------------------------
-- Outsider: nothing
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000904", "role": "authenticated"}', true);

select is_empty(
  $$ select 1 from public.card_subtasks where board_id = current_setting('test.board1')::uuid $$,
  'outsider cannot see subtasks'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Outsider', 'a3') $$,
  '42501', null,
  'outsider cannot create a subtask'
);
select is_empty(
  $$ update public.card_subtasks set title = 'hacked'
     where board_id = current_setting('test.board1')::uuid returning 1 $$,
  'outsider cannot update subtasks'
);
select is_empty(
  $$ delete from public.card_subtasks where board_id = current_setting('test.board1')::uuid returning 1 $$,
  'outsider cannot delete subtasks'
);

-- ---------------------------------------------------------------------------
-- Editor: delete, and the 100-per-card limit
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000902", "role": "authenticated"}', true);

select results_eq(
  $$ delete from public.card_subtasks where id = '00000000-0000-4000-f000-000000000902' returning id $$,
  $$ values ('00000000-0000-4000-f000-000000000902'::uuid) $$,
  'editor can delete a subtask'
);

select lives_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     select current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090c',
            'Subtask ' || i, 'a' || lpad(i::text, 3, '0')
     from generate_series(1, 100) i $$,
  'a card can hold 100 subtasks'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090c', 'One too many', 'b0') $$,
  '23514', 'A card can have at most 100 subtasks',
  'the 101st subtask of a card is rejected'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000903", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090c', 'Viewer', 'b1') $$,
  '42501', null,
  'a viewer on a full card gets the permission error, not the limit'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000902", "role": "authenticated"}', true);

select lives_ok(
  $$ delete from public.card_subtasks
     where card_id = '00000000-0000-4000-d000-00000000090c' and position = 'a100';
     insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090c', 'Replacement', 'b0') $$,
  'after deleting one, a card at the limit accepts a new subtask'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     select current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090d',
            'Bulk ' || i, 'a' || lpad(i::text, 3, '0')
     from generate_series(1, 101) i $$,
  '23514', 'A card can have at most 100 subtasks',
  'a single 101-row insert is rejected as a whole'
);
select results_eq(
  $$ select count(*)::int from public.card_subtasks where card_id = '00000000-0000-4000-d000-00000000090d' $$,
  $$ values (0) $$,
  'the rejected bulk insert left no rows'
);
select lives_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Other card', 'a5') $$,
  'the limit is per card: other cards are unaffected'
);

-- ---------------------------------------------------------------------------
-- Cascade: deleting a card deletes its subtasks
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.cards set archived_at = now() where id = '00000000-0000-4000-d000-00000000090c';
     delete from public.cards where id = '00000000-0000-4000-d000-00000000090c' $$,
  'editor archives and deletes a card with 100 subtasks'
);
select results_eq(
  $$ select count(*)::int from public.card_subtasks where card_id = '00000000-0000-4000-d000-00000000090c' $$,
  $$ values (0) $$,
  'deleting a card deletes its subtasks (cascade)'
);

-- Removing the creator's account keeps their subtasks, with created_by cleared.
reset role;
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-4000-a000-000000000902' $$,
  'the editor''s account can be deleted'
);
select results_eq(
  $$ select created_by from public.card_subtasks where card_id = '00000000-0000-4000-d000-00000000090a'
     and title = 'Other card' $$,
  $$ values (null::uuid) $$,
  'subtasks of a deleted user survive with created_by set to null'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

select throws_ok(
  $$ select 1 from public.card_subtasks $$,
  '42501', null,
  'anon cannot read subtasks'
);
select throws_ok(
  $$ insert into public.card_subtasks (board_id, card_id, title, position)
     values (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-00000000090a', 'Anon', 'a9') $$,
  '42501', null,
  'anon cannot create subtasks'
);
select throws_ok(
  $$ update public.card_subtasks set completed_at = now() $$,
  '42501', null,
  'anon cannot update subtasks'
);
select throws_ok(
  $$ delete from public.card_subtasks $$,
  '42501', null,
  'anon cannot delete subtasks'
);

reset role;
select * from finish();
rollback;
