-- Row Level Security: isolation between users and per-role permissions.
--
-- Users are created inside the transaction; identity is switched with
-- `set local role` + `request.jwt.claims` (what PostgREST does per request).
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Fixtures -----------------------------------------------------------------------
-- A = board owner, B = outsider, E = editor, V = viewer

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.local'),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.local'),
  ('00000000-0000-4000-a000-00000000000e', 'e@test.local'),
  ('00000000-0000-4000-a000-00000000000f', 'v@test.local');

-- Sign-up gives every user a default "My board" (see 04_onboarding). Remove them so the
-- assertions below ("the outsider sees nothing", unscoped updates/deletes) only concern
-- the shared board created in this file.
delete from public.boards
where owner_id in (
  '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
  '00000000-0000-4000-a000-00000000000e', '00000000-0000-4000-a000-00000000000f'
);

-- pgTAP keeps its state in temp tables created by plan(); let the API roles use them.
grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A creates a board
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);

select results_eq(
  $$ insert into public.boards (id, title) values ('00000000-0000-4000-b000-000000000001', 'A board') returning id, owner_id $$,
  $$ values ('00000000-0000-4000-b000-000000000001'::uuid, '00000000-0000-4000-a000-00000000000a'::uuid) $$,
  'insert ... returning works and owner_id defaults to the caller'
);

select results_eq(
  $$ select user_id, role from public.board_members where board_id = '00000000-0000-4000-b000-000000000001' $$,
  $$ values ('00000000-0000-4000-a000-00000000000a'::uuid, 'owner'::public.board_role) $$,
  'creating a board makes the creator its owner member'
);

select throws_ok(
  $$ insert into public.boards (title, owner_id) values ('spoofed', '00000000-0000-4000-a000-00000000000b') $$,
  '42501', null,
  'cannot create a board on behalf of another user'
);

select lives_ok(
  $$ insert into public.board_members (board_id, user_id, role) values
       ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000e', 'editor'),
       ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000f', 'viewer') $$,
  'owner can add members'
);

select lives_ok(
  $$
    insert into public.board_columns (id, board_id, title, position)
    values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'To do', 'a0');
    insert into public.cards (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001',
            '00000000-0000-4000-c000-000000000001', 'Original title', 'a0');
    insert into public.board_labels (id, board_id, name, color)
    values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', 'Bug', 'red');
  $$,
  'owner can create columns, cards and labels'
);

-- ---------------------------------------------------------------------------
-- B (not a member) sees and changes nothing
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000b", "role": "authenticated"}', true);

select is_empty($$ select 1 from public.boards $$, 'outsider cannot see the board');
select is_empty($$ select 1 from public.board_members $$, 'outsider cannot see members');
select is_empty($$ select 1 from public.board_columns $$, 'outsider cannot see columns');
select is_empty($$ select 1 from public.cards $$, 'outsider cannot see cards');
select is_empty($$ select 1 from public.board_labels $$, 'outsider cannot see labels');

select is_empty(
  $$ update public.boards set title = 'hacked' returning 1 $$,
  'outsider cannot update the board'
);
select is_empty(
  $$ update public.cards set title = 'hacked' returning 1 $$,
  'outsider cannot update cards'
);
select is_empty(
  $$ update public.board_labels set name = 'hacked' returning 1 $$,
  'outsider cannot update labels'
);
select is_empty(
  $$ delete from public.cards returning 1 $$,
  'outsider cannot delete cards'
);
select is_empty(
  $$ delete from public.board_columns returning 1 $$,
  'outsider cannot delete columns'
);
select is_empty(
  $$ delete from public.boards returning 1 $$,
  'outsider cannot delete the board'
);
select throws_ok(
  $$ insert into public.board_columns (board_id, title, position)
     values ('00000000-0000-4000-b000-000000000001', 'x', 'a1') $$,
  '42501', null,
  'outsider cannot add columns'
);
select throws_ok(
  $$ insert into public.cards (board_id, column_id, title, position)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'x', 'a1') $$,
  '42501', null,
  'outsider cannot add cards'
);
select throws_ok(
  $$ insert into public.board_members (board_id, user_id, role)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'owner') $$,
  '42501', null,
  'outsider cannot add themselves to the board'
);

-- ---------------------------------------------------------------------------
-- V (viewer) can read but not write
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000f", "role": "authenticated"}', true);

select results_eq(
  $$ select title from public.cards $$,
  $$ values ('Original title') $$,
  'viewer can read cards'
);
select throws_ok(
  $$ insert into public.cards (board_id, column_id, title, position)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'x', 'a1') $$,
  '42501', null,
  'viewer cannot insert cards'
);
select is_empty(
  $$ update public.cards set title = 'viewer edit' returning 1 $$,
  'viewer cannot update cards'
);
select is_empty(
  $$ delete from public.cards returning 1 $$,
  'viewer cannot delete cards'
);
select throws_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id)
     values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-e000-000000000001',
             '00000000-0000-4000-b000-000000000001') $$,
  '42501', null,
  'viewer cannot label cards'
);
select is_empty(
  $$ update public.boards set title = 'viewer edit' returning 1 $$,
  'viewer cannot update the board'
);

-- ---------------------------------------------------------------------------
-- E (editor) can write content but not manage members or ownership
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000e", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.cards (id, board_id, column_id, title, position)
     values ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-c000-000000000001', 'Editor card', 'a1') $$,
  'editor can insert cards'
);
select results_eq(
  $$ update public.cards set title = 'Editor card (edited)'
     where id = '00000000-0000-4000-d000-000000000002' returning title $$,
  $$ values ('Editor card (edited)') $$,
  'editor can update cards'
);
select lives_ok(
  $$
    insert into public.card_labels (card_id, label_id, board_id)
    values ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-e000-000000000001',
            '00000000-0000-4000-b000-000000000001');
    insert into public.card_assignees (card_id, user_id, board_id)
    values ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-a000-00000000000f',
            '00000000-0000-4000-b000-000000000001');
  $$,
  'editor can label cards and assign members'
);
select results_eq(
  $$ delete from public.cards where id = '00000000-0000-4000-d000-000000000002' returning id $$,
  $$ values ('00000000-0000-4000-d000-000000000002'::uuid) $$,
  'editor can delete cards'
);
select throws_ok(
  $$ insert into public.cards (board_id, column_id, title, position, created_by)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001',
             'spoofed', 'a2', '00000000-0000-4000-a000-00000000000a') $$,
  '42501', null,
  'cards cannot be created on behalf of another user'
);
select throws_ok(
  $$ update public.boards set owner_id = '00000000-0000-4000-a000-00000000000e' $$,
  '42501', null,
  'editor cannot take over the board by changing owner_id'
);
select is_empty(
  $$ update public.board_members set role = 'owner'
     where user_id = '00000000-0000-4000-a000-00000000000e' returning 1 $$,
  'editor cannot promote themselves'
);
select throws_ok(
  $$ insert into public.board_members (board_id, user_id, role)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'viewer') $$,
  '42501', null,
  'editor cannot add members'
);
select is_empty(
  $$ delete from public.boards returning 1 $$,
  'editor cannot delete the board'
);

-- ---------------------------------------------------------------------------
-- Back to A: the outsider/viewer attempts had no effect
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);

select results_eq(
  $$ select b.title, c.title, l.name
     from public.boards b
     join public.cards c on c.board_id = b.id
     join public.board_labels l on l.board_id = b.id $$,
  $$ values ('A board', 'Original title', 'Bug') $$,
  'board, card and label are unchanged'
);

-- ---------------------------------------------------------------------------
-- V leaves the board and then sees nothing
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000f", "role": "authenticated"}', true);

select results_eq(
  $$ delete from public.board_members
     where user_id = '00000000-0000-4000-a000-00000000000f' returning role $$,
  $$ values ('viewer'::public.board_role) $$,
  'a non-owner member can leave the board'
);
select is_empty($$ select 1 from public.cards $$, 'after leaving, the former member sees no cards');

-- ---------------------------------------------------------------------------
-- anon gets nothing
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

select throws_ok($$ select 1 from public.boards $$, '42501', null, 'anon cannot read boards');
select throws_ok($$ select 1 from public.cards $$, '42501', null, 'anon cannot read cards');
select throws_ok(
  $$ insert into public.boards (title) values ('anon board') $$,
  '42501', null,
  'anon cannot create boards'
);
select throws_ok(
  $$ select public.has_board_role('00000000-0000-4000-b000-000000000001', '{owner}') $$,
  '42501', null,
  'anon cannot call has_board_role'
);

reset role;
select * from finish();
rollback;
