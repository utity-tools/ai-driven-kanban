-- Card dependencies (v0.3): "blocker blocks blocked" edges between cards of one board,
-- and done columns (board_columns.is_done).
--
-- Owners and editors add and remove dependencies; viewers only read; outsiders and anon get
-- nothing. Rows are immutable. The graph stays acyclic (DEP01) and a card has at most 20
-- blockers (DEP02). An RLS-blocked DELETE is not an error (0 rows); a blocked INSERT raises
-- 42501.
begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

-- ---------------------------------------------------------------------------
-- Schema: board_columns.is_done
-- ---------------------------------------------------------------------------

select col_type_is('public', 'board_columns', 'is_done', 'boolean', 'board_columns.is_done is a boolean');
select col_not_null('public', 'board_columns', 'is_done', 'is_done is required');
select col_default_is('public', 'board_columns', 'is_done', 'false', 'is_done defaults to false');
select is(
  (select array_agg(a.attname::text order by a.attname)
   from pg_attribute a
   where a.attrelid = 'public.board_columns'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  array['is_done', 'position', 'title'],
  'authenticated can update exactly title, position and is_done of a column'
);

-- ---------------------------------------------------------------------------
-- Schema: card_dependencies
-- ---------------------------------------------------------------------------

select has_table('public', 'card_dependencies', 'card_dependencies exists');
select columns_are(
  'public', 'card_dependencies',
  array['board_id', 'blocker_card_id', 'blocked_card_id', 'created_by', 'created_at'],
  'card_dependencies has exactly the expected columns'
);
select col_is_pk('public', 'card_dependencies', array['blocker_card_id', 'blocked_card_id'],
  'primary key is (blocker_card_id, blocked_card_id)');
select col_has_check('public', 'card_dependencies', array['blocker_card_id', 'blocked_card_id'],
  'a check forbids self-dependencies');
select fk_ok(
  'public', 'card_dependencies', array['blocker_card_id', 'board_id'],
  'public', 'cards', array['id', 'board_id'],
  'composite FK (blocker_card_id, board_id) -> cards (id, board_id)'
);
select fk_ok(
  'public', 'card_dependencies', array['blocked_card_id', 'board_id'],
  'public', 'cards', array['id', 'board_id'],
  'composite FK (blocked_card_id, board_id) -> cards (id, board_id)'
);
select is(
  (select array_agg(conname::text || ':' || confdeltype::text order by conname)
   from pg_constraint
   where conrelid = 'public.card_dependencies'::regclass and confrelid = 'public.cards'::regclass),
  array['card_dependencies_blocked_same_board_fkey:c', 'card_dependencies_blocker_same_board_fkey:c'],
  'both card FKs cascade on delete'
);

select has_index('public', 'card_dependencies', 'card_dependencies_blocked_card_id_idx', array['blocked_card_id'],
  'index on card_dependencies(blocked_card_id)');
select has_index('public', 'card_dependencies', 'card_dependencies_board_id_idx', array['board_id'],
  'index on card_dependencies(board_id)');
select has_index('public', 'card_dependencies', 'card_dependencies_created_by_idx', array['created_by'],
  'index on card_dependencies(created_by)');

select has_trigger('public', 'card_dependencies', 'card_dependencies_check', 'cycle/limit trigger exists');
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'internal.check_card_dependency()'::regprocedure),
  'the trigger function is security invoker with empty search_path'
);
select ok(
  not has_function_privilege('authenticated', 'internal.check_card_dependency()', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.check_card_dependency()', 'EXECUTE')
  and not has_function_privilege('public', 'internal.check_card_dependency()', 'EXECUTE'),
  'nobody can call the trigger function directly'
);

select ok((select relrowsecurity from pg_class where oid = 'public.card_dependencies'::regclass),
  'RLS on card_dependencies');
select policies_are(
  'public', 'card_dependencies',
  array[
    'card_dependencies: members can read',
    'card_dependencies: owners and editors can create',
    'card_dependencies: owners and editors can delete'
  ],
  'card_dependencies has exactly read, create and delete policies (no update)'
);

select is_empty(
  $$ select a.attname from pg_attribute a
     where a.attrelid = 'public.card_dependencies'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  'authenticated cannot update any column of card_dependencies (rows are immutable)'
);
select ok(
  not has_table_privilege('anon', 'public.card_dependencies', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  'anon has no privileges on card_dependencies'
);
select ok(
  not has_table_privilege('authenticated', 'public.card_dependencies', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  'authenticated cannot TRUNCATE, REFERENCES, TRIGGER or MAINTAIN card_dependencies'
);
select is_empty(
  $$ select 1 from pg_publication_tables where tablename = 'card_dependencies' $$,
  'card_dependencies is not in any publication yet'
);

-- ---------------------------------------------------------------------------
-- Existing and default Done columns
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select 1 from public.board_columns where lower(btrim(title)) = 'done' and not is_done $$,
  'every existing Done column (seed and sign-up defaults) is marked is_done'
);

select lives_ok(
  $$ insert into auth.users (id, email) values ('00000000-0000-4000-a000-000000001210', 'new12@test.local') $$,
  'a permanent user signs up'
);
select results_eq(
  $$ select c.title, c.is_done from public.board_columns c
     join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000001210'
     order by c.position $$,
  $$ values ('To do', false), ('In progress', false), ('Done', true) $$,
  'the sign-up board has only Done marked as done'
);

select lives_ok(
  $$ insert into auth.users (id, is_anonymous) values ('00000000-0000-4000-a000-000000001211', true) $$,
  'an anonymous visitor signs in'
);
select results_eq(
  $$ select c.title, c.is_done from public.board_columns c
     join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000001211'
     order by c.position $$,
  $$ values ('Backlog', false), ('To do', false), ('In progress', false), ('Done', true) $$,
  'the demo board has only Done marked as done'
);

-- ---------------------------------------------------------------------------
-- Fixtures: O = owner, E = editor, V = viewer, X = outsider
-- Board 1 (O owns; E editor, V viewer): cards A, B, C, D, H (archived), T, U and 21
-- blocker cards P01..P21. Board 2 (O only): card Z.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000001201', 'o12@test.local'),
  ('00000000-0000-4000-a000-000000001202', 'e12@test.local'),
  ('00000000-0000-4000-a000-000000001203', 'v12@test.local'),
  ('00000000-0000-4000-a000-000000001204', 'x12@test.local');

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001201", "role": "authenticated"}', true);

select set_config('test.board1', public.create_board('Dependencies')::text, true);
select set_config('test.board2', public.create_board('Other')::text, true);

select results_eq(
  $$ select title, is_done from public.board_columns
     where board_id = current_setting('test.board1')::uuid order by position $$,
  $$ values ('To do', false), ('In progress', false), ('Done', true) $$,
  'create_board marks only its Done column as done'
);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001202', 'editor'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001203', 'viewer');
    insert into public.cards (id, board_id, column_id, title, position)
    select v.id::uuid, c.board_id, c.id, v.title, v.position
    from (values
      ('00000000-0000-4000-d000-000000001201', current_setting('test.board1'), 'Card A', 'a0'),
      ('00000000-0000-4000-d000-000000001202', current_setting('test.board1'), 'Card B', 'a1'),
      ('00000000-0000-4000-d000-000000001203', current_setting('test.board1'), 'Card C', 'a2'),
      ('00000000-0000-4000-d000-000000001204', current_setting('test.board1'), 'Card D', 'a3'),
      ('00000000-0000-4000-d000-000000001208', current_setting('test.board1'), 'Card H', 'a4'),
      ('00000000-0000-4000-d000-000000001220', current_setting('test.board1'), 'Card T', 'a5'),
      ('00000000-0000-4000-d000-000000001221', current_setting('test.board1'), 'Card U', 'a6'),
      ('00000000-0000-4000-d000-000000001209', current_setting('test.board2'), 'Card Z', 'a0')
    ) as v (id, board_id, title, position)
    join public.board_columns c on c.board_id = v.board_id::uuid and c.position = 'a0';
    insert into public.cards (id, board_id, column_id, title, position)
    select ('00000000-0000-4000-d000-0000000013' || lpad(i::text, 2, '0'))::uuid, c.board_id, c.id,
           'Blocker ' || i, 'b' || lpad(i::text, 2, '0')
    from generate_series(1, 21) i
    join public.board_columns c on c.board_id = current_setting('test.board1')::uuid and c.position = 'a0';
    update public.cards set archived_at = now() where id = '00000000-0000-4000-d000-000000001208';
  $$,
  'owner adds an editor, a viewer and cards (one archived) on two boards'
);

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------

select results_eq(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001201', '00000000-0000-4000-d000-000000001202')
     returning created_by $$,
  $$ values ('00000000-0000-4000-a000-000000001201'::uuid) $$,
  'owner adds A blocks B; created_by defaults to the caller'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001201', '00000000-0000-4000-d000-000000001209') $$,
  '23503', null,
  'a dependency cannot link cards of different boards, even for an owner of both'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001201', '00000000-0000-4000-d000-000000001201') $$,
  '23514', null,
  'a card cannot block itself'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001201', '00000000-0000-4000-d000-000000001202') $$,
  '23505', null,
  'the same dependency cannot be added twice'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001202', '00000000-0000-4000-d000-000000001201') $$,
  'DEP01', 'dependency would create a cycle',
  'B blocks A is rejected: 2-cycle'
);

-- ---------------------------------------------------------------------------
-- Editor
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001202", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001202', '00000000-0000-4000-d000-000000001203') $$,
  'editor adds B blocks C'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001203', '00000000-0000-4000-d000-000000001201') $$,
  'DEP01', 'dependency would create a cycle',
  'C blocks A is rejected: 3-cycle A -> B -> C -> A'
);
select lives_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001201', '00000000-0000-4000-d000-000000001203') $$,
  'A blocks C is allowed alongside A -> B -> C (a DAG, not a cycle)'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id, created_by)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001203', '00000000-0000-4000-d000-000000001204',
             '00000000-0000-4000-a000-000000001201') $$,
  '42501', null,
  'editor cannot add a dependency on behalf of someone else (created_by)'
);
select lives_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001208', '00000000-0000-4000-d000-000000001204') $$,
  'an archived card can be a blocker'
);
select throws_ok(
  $$ update public.card_dependencies set blocked_card_id = '00000000-0000-4000-d000-000000001204'
     where blocker_card_id = '00000000-0000-4000-d000-000000001201' $$,
  '42501', null,
  'dependencies cannot be updated (delete and insert instead)'
);
select results_eq(
  $$ delete from public.card_dependencies
     where blocker_card_id = '00000000-0000-4000-d000-000000001201'
       and blocked_card_id = '00000000-0000-4000-d000-000000001203'
     returning blocker_card_id $$,
  $$ values ('00000000-0000-4000-d000-000000001201'::uuid) $$,
  'editor can delete a dependency'
);
select results_eq(
  $$ update public.board_columns set is_done = true
     where board_id = current_setting('test.board1')::uuid and title = 'In progress'
     returning is_done $$,
  $$ values (true) $$,
  'editor can mark a column as done (more than one done column is allowed)'
);

-- ---------------------------------------------------------------------------
-- Viewer: read only
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001203", "role": "authenticated"}', true);

select results_eq(
  $$ select count(*)::int from public.card_dependencies where board_id = current_setting('test.board1')::uuid $$,
  $$ values (3) $$,
  'viewer reads the dependencies of the board'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001203', '00000000-0000-4000-d000-000000001204') $$,
  '42501', null,
  'viewer cannot add a dependency'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001203', '00000000-0000-4000-d000-000000001201') $$,
  '42501', null,
  'viewer adding a cycle gets the permission error, not DEP01'
);
select is_empty(
  $$ delete from public.card_dependencies where board_id = current_setting('test.board1')::uuid returning 1 $$,
  'viewer cannot delete dependencies'
);
select is_empty(
  $$ update public.board_columns set is_done = false
     where board_id = current_setting('test.board1')::uuid returning 1 $$,
  'viewer cannot change is_done'
);

-- ---------------------------------------------------------------------------
-- Outsider: nothing
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001204", "role": "authenticated"}', true);

select is_empty(
  $$ select 1 from public.card_dependencies where board_id = current_setting('test.board1')::uuid $$,
  'outsider cannot see dependencies'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001203', '00000000-0000-4000-d000-000000001201') $$,
  '42501', null,
  'outsider cannot add a dependency (and learns nothing about cycles)'
);
select is_empty(
  $$ delete from public.card_dependencies where board_id = current_setting('test.board1')::uuid returning 1 $$,
  'outsider cannot delete dependencies'
);

-- ---------------------------------------------------------------------------
-- Limit: at most 20 blockers per card
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001202", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     select current_setting('test.board1')::uuid,
            ('00000000-0000-4000-d000-0000000013' || lpad(i::text, 2, '0'))::uuid,
            '00000000-0000-4000-d000-000000001220'
     from generate_series(1, 20) i $$,
  'a card can have 20 blockers'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001321', '00000000-0000-4000-d000-000000001220') $$,
  'DEP02', 'A card can have at most 20 blockers',
  'the 21st blocker of a card is rejected'
);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     select current_setting('test.board1')::uuid,
            ('00000000-0000-4000-d000-0000000013' || lpad(i::text, 2, '0'))::uuid,
            '00000000-0000-4000-d000-000000001221'
     from generate_series(1, 21) i $$,
  'DEP02', 'A card can have at most 20 blockers',
  'a single 21-row insert is rejected as a whole'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001203", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001321', '00000000-0000-4000-d000-000000001220') $$,
  '42501', null,
  'a viewer on a full card gets the permission error, not DEP02'
);

-- ---------------------------------------------------------------------------
-- Cascade: deleting a card deletes its dependencies
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001201", "role": "authenticated"}', true);

select lives_ok(
  $$ update public.cards set archived_at = now() where id = '00000000-0000-4000-d000-000000001202';
     delete from public.cards where id = '00000000-0000-4000-d000-000000001202' $$,
  'owner archives and deletes card B'
);
select is_empty(
  $$ select 1 from public.card_dependencies
     where '00000000-0000-4000-d000-000000001202' in (blocker_card_id, blocked_card_id) $$,
  'deleting B removed A -> B and B -> C'
);

-- ---------------------------------------------------------------------------
-- The table owner (e.g. SECURITY DEFINER functions) bypasses RLS but not the invariants
-- ---------------------------------------------------------------------------

reset role;

select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001204', '00000000-0000-4000-d000-000000001208') $$,
  'DEP01', 'dependency would create a cycle',
  'without RLS, D blocks H is still rejected (H -> D exists)'
);

select * from finish();
rollback;
