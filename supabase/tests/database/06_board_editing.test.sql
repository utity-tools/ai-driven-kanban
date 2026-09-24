-- Board editing (v0.1 delivery 4a): create_board RPC, archive-first card deletion,
-- restore, and the editing flows the UI relies on.
--
-- Deleting a card that is not archived is not an error: the DELETE policy simply matches
-- no rows, so the statement affects 0 rows (PostgREST answers 204 / an empty array).
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

-- Fixtures -----------------------------------------------------------------------
-- O = owner, E = editor, V = viewer, X = outsider

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000601', 'o6@test.local'),
  ('00000000-0000-4000-a000-000000000602', 'e6@test.local'),
  ('00000000-0000-4000-a000-000000000603', 'v6@test.local'),
  ('00000000-0000-4000-a000-000000000604', 'x6@test.local');

-- Drop the default sign-up boards so every assertion only concerns boards created here.
delete from public.boards
where owner_id in (
  '00000000-0000-4000-a000-000000000601', '00000000-0000-4000-a000-000000000602',
  '00000000-0000-4000-a000-000000000603', '00000000-0000-4000-a000-000000000604'
);

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_board: shape and privileges
-- ---------------------------------------------------------------------------

select has_function('public', 'create_board', array['text'], 'create_board(text) exists');
select function_returns('public', 'create_board', array['text'], 'uuid', 'create_board returns uuid');

select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'public.create_board(text)'::regprocedure),
  'create_board is security invoker with empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.create_board(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_board(text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.create_board(text)', 'EXECUTE'),
  'create_board is executable by authenticated only'
);

-- ---------------------------------------------------------------------------
-- O creates a board through the RPC
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000601", "role": "authenticated"}', true);

select set_config('test.board_id', public.create_board('  Roadmap  ')::text, true);

select results_eq(
  $$ select title, owner_id from public.boards where id = current_setting('test.board_id')::uuid $$,
  $$ values ('Roadmap', '00000000-0000-4000-a000-000000000601'::uuid) $$,
  'create_board creates a board owned by the caller, with the title trimmed'
);

select results_eq(
  $$ select title, position collate "default" from public.board_columns
     where board_id = current_setting('test.board_id')::uuid
     order by position, id $$,
  $$ values ('To do', 'a0'), ('In progress', 'a1'), ('Done', 'a2') $$,
  'create_board adds To do / In progress / Done, in that order'
);

select results_eq(
  $$ select user_id, role from public.board_members
     where board_id = current_setting('test.board_id')::uuid $$,
  $$ values ('00000000-0000-4000-a000-000000000601'::uuid, 'owner'::public.board_role) $$,
  'the caller is the only member of the new board, as owner'
);

-- Invalid titles ---------------------------------------------------------------------

select throws_ok(
  $$ select public.create_board('   ') $$,
  '23514', 'Board title must be between 1 and 100 characters',
  'a blank title raises check_violation'
);
select throws_ok(
  $$ select public.create_board('') $$,
  '23514', 'Board title must be between 1 and 100 characters',
  'an empty title raises check_violation'
);
select throws_ok(
  $$ select public.create_board(null) $$,
  '23514', 'Board title must be between 1 and 100 characters',
  'a null title raises check_violation'
);
select throws_ok(
  $$ select public.create_board(repeat('x', 101)) $$,
  '23514', 'Board title must be between 1 and 100 characters',
  'a 101-character title raises check_violation'
);
select lives_ok(
  $$ select public.create_board('  ' || repeat('x', 100) || '  ') $$,
  'a 100-character title (after trimming) is accepted'
);
select results_eq(
  $$ select count(*)::int from public.boards $$,
  $$ values (2) $$,
  'invalid titles create nothing'
);

-- Fixtures on the new board, created by O through the API ------------------------------

select set_config(
  'test.todo_id',
  (select id::text from public.board_columns
   where board_id = current_setting('test.board_id')::uuid and position = 'a0'),
  true
);
select set_config(
  'test.done_id',
  (select id::text from public.board_columns
   where board_id = current_setting('test.board_id')::uuid and position = 'a2'),
  true
);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board_id')::uuid, '00000000-0000-4000-a000-000000000602', 'editor'),
      (current_setting('test.board_id')::uuid, '00000000-0000-4000-a000-000000000603', 'viewer');
    insert into public.cards (id, board_id, column_id, title, position, archived_at) values
      ('00000000-0000-4000-d000-000000000601', current_setting('test.board_id')::uuid,
       current_setting('test.todo_id')::uuid, 'Active 1', 'a0', null),
      ('00000000-0000-4000-d000-000000000602', current_setting('test.board_id')::uuid,
       current_setting('test.todo_id')::uuid, 'Active 2', 'a1', null),
      ('00000000-0000-4000-d000-000000000603', current_setting('test.board_id')::uuid,
       current_setting('test.todo_id')::uuid, 'Archived 3', 'a2', now()),
      ('00000000-0000-4000-d000-000000000604', current_setting('test.board_id')::uuid,
       current_setting('test.todo_id')::uuid, 'Archived 4', 'a3', now()),
      ('00000000-0000-4000-d000-000000000605', current_setting('test.board_id')::uuid,
       current_setting('test.todo_id')::uuid, 'Archived 5', 'a4', now());
  $$,
  'owner adds an editor, a viewer and active/archived cards'
);

-- ---------------------------------------------------------------------------
-- Archive-first deletion
-- ---------------------------------------------------------------------------

select is_empty(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000601' returning 1 $$,
  'owner: deleting a non-archived card affects 0 rows'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000602", "role": "authenticated"}', true);
select is_empty(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000602' returning 1 $$,
  'editor: deleting a non-archived card affects 0 rows'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000603", "role": "authenticated"}', true);
select is_empty(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000603' returning 1 $$,
  'viewer cannot delete an archived card'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000604", "role": "authenticated"}', true);
select is_empty(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000603' returning 1 $$,
  'outsider cannot delete an archived card'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000601", "role": "authenticated"}', true);
select results_eq(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000603' returning id $$,
  $$ values ('00000000-0000-4000-d000-000000000603'::uuid) $$,
  'owner can delete an archived card'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000602", "role": "authenticated"}', true);
select results_eq(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000604' returning id $$,
  $$ values ('00000000-0000-4000-d000-000000000604'::uuid) $$,
  'editor can delete an archived card'
);

select results_eq(
  $$ select id from public.cards order by id $$,
  $$ values ('00000000-0000-4000-d000-000000000601'::uuid),
            ('00000000-0000-4000-d000-000000000602'::uuid),
            ('00000000-0000-4000-d000-000000000605'::uuid) $$,
  'only the archived cards deleted by owner/editor are gone'
);

-- ---------------------------------------------------------------------------
-- Archive and restore
-- ---------------------------------------------------------------------------

select results_eq(
  $$ update public.cards set archived_at = null
     where id = '00000000-0000-4000-d000-000000000605' returning archived_at is null $$,
  $$ values (true) $$,
  'editor can restore an archived card'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000603", "role": "authenticated"}', true);
select is_empty(
  $$ update public.cards set archived_at = now()
     where id = '00000000-0000-4000-d000-000000000605' returning 1 $$,
  'viewer cannot archive a card'
);

-- ---------------------------------------------------------------------------
-- Other 4a editing flows, as the editor
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000602", "role": "authenticated"}', true);

select results_eq(
  $$ update public.boards set title = 'Roadmap 2'
     where id = current_setting('test.board_id')::uuid returning title $$,
  $$ values ('Roadmap 2') $$,
  'editor can rename the board'
);

select lives_ok(
  $$ insert into public.board_columns (id, board_id, title, position)
     values ('00000000-0000-4000-c000-000000000601', current_setting('test.board_id')::uuid, 'Review', 'a3') $$,
  'editor can add a column'
);

select results_eq(
  $$ update public.board_columns set title = 'In review', position = 'a1V'
     where id = '00000000-0000-4000-c000-000000000601' returning title, position collate "default" $$,
  $$ values ('In review', 'a1V') $$,
  'editor can rename and reorder a column'
);

select lives_ok(
  $$ insert into public.cards (id, board_id, column_id, title, position)
     values ('00000000-0000-4000-d000-000000000606', current_setting('test.board_id')::uuid,
             '00000000-0000-4000-c000-000000000601', 'Inline card', 'a0') $$,
  'editor can add a card inline'
);

select results_eq(
  $$ update public.cards
     set column_id = current_setting('test.done_id')::uuid,
         title = 'Edited title', description = '**markdown**', position = 'a0'
     where id = '00000000-0000-4000-d000-000000000601'
     returning column_id, title, description $$,
  $$ values (current_setting('test.done_id')::uuid, 'Edited title', '**markdown**') $$,
  'editor can move a card and edit its title and description'
);

select results_eq(
  $$ update public.cards set archived_at = now()
     where id = '00000000-0000-4000-d000-000000000606' returning archived_at is not null $$,
  $$ values (true) $$,
  'editor can archive a card'
);

-- The Review column now holds an archived card; To do holds active card 602 and 605.
select lives_ok(
  $$ update public.cards set column_id = '00000000-0000-4000-c000-000000000601'
     where id = '00000000-0000-4000-d000-000000000602' $$,
  'editor moves an active card into the Review column'
);

select results_eq(
  $$ delete from public.board_columns where id = '00000000-0000-4000-c000-000000000601' returning id $$,
  $$ values ('00000000-0000-4000-c000-000000000601'::uuid) $$,
  'editor can delete a column'
);

select is_empty(
  $$ select 1 from public.cards
     where id in ('00000000-0000-4000-d000-000000000602', '00000000-0000-4000-d000-000000000606') $$,
  'deleting a column deletes its cards, active and archived (cascade ignores the archive-first rule)'
);

select is_empty(
  $$ delete from public.boards where id = current_setting('test.board_id')::uuid returning 1 $$,
  'editor cannot delete the board'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000601", "role": "authenticated"}', true);
select results_eq(
  $$ delete from public.boards where id = current_setting('test.board_id')::uuid returning id $$,
  $$ values (current_setting('test.board_id')::uuid) $$,
  'owner can delete the board (including its non-archived cards)'
);

-- ---------------------------------------------------------------------------
-- Callers without an identity
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.create_board('No user') $$,
  '42501', 'You must be signed in to create a board',
  'create_board requires a signed-in user'
);

reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

select throws_ok(
  $$ select public.create_board('Anon board') $$,
  '42501', null,
  'anon cannot call create_board'
);

reset role;
select * from finish();
rollback;
