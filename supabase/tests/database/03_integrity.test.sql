-- Data integrity: composite FKs, owner protection, cascades, check constraints.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures (as postgres) ---------------------------------------------------------
-- A owns boards 1 and 2; B and C are other users.

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.local'),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.local'),
  ('00000000-0000-4000-a000-00000000000c', 'c@test.local');

insert into public.boards (id, title, owner_id) values
  ('00000000-0000-4000-b000-000000000001', 'Board 1', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-000000000002', 'Board 2', '00000000-0000-4000-a000-00000000000a');

insert into public.board_columns (id, board_id, title, position) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'Col 1', 'a0'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', 'Col 2', 'a0');

insert into public.cards (id, board_id, column_id, title, position) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-c000-000000000001', 'Card 1', 'a0');

insert into public.board_labels (id, board_id, color) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', 'green'),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b000-000000000002', 'red');

grant usage on schema extensions to authenticated;
grant all on all tables in schema pg_temp to authenticated;
grant all on all sequences in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- Composite FKs keep everything on the same board
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.cards (board_id, column_id, title, position)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000002', 'x', 'a1') $$,
  '23503', null,
  'a card cannot point to a column of another board'
);
select throws_ok(
  $$ update public.cards set column_id = '00000000-0000-4000-c000-000000000002'
     where id = '00000000-0000-4000-d000-000000000001' $$,
  '23503', null,
  'a card cannot be moved to a column of another board'
);
select throws_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id)
     values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-e000-000000000002',
             '00000000-0000-4000-b000-000000000001') $$,
  '23503', null,
  'a label from another board cannot be attached'
);
select throws_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id)
     values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-e000-000000000002',
             '00000000-0000-4000-b000-000000000002') $$,
  '23503', null,
  'lying about board_id does not help attach a foreign label'
);
select lives_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id)
     values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-e000-000000000001',
             '00000000-0000-4000-b000-000000000001') $$,
  'a label from the same board can be attached'
);
select throws_ok(
  $$ insert into public.card_assignees (card_id, user_id, board_id)
     values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-00000000000c',
             '00000000-0000-4000-b000-000000000001') $$,
  '23503', null,
  'a non-member cannot be assigned'
);

insert into public.board_members (board_id, user_id, role)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000c', 'viewer');

select lives_ok(
  $$ insert into public.card_assignees (card_id, user_id, board_id)
     values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-00000000000c',
             '00000000-0000-4000-b000-000000000001') $$,
  'a member can be assigned'
);

delete from public.board_members
where board_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c';

select is_empty(
  $$ select 1 from public.card_assignees where user_id = '00000000-0000-4000-a000-00000000000c' $$,
  'removing a member unassigns them'
);

-- ---------------------------------------------------------------------------
-- Owner protection (exercised through RLS, as the owner)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$ delete from public.board_members
     where board_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000a' $$,
  '23001', null,
  'the last owner cannot be removed'
);
select throws_ok(
  $$ update public.board_members set role = 'editor'
     where board_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000a' $$,
  '23001', null,
  'the last owner cannot be demoted'
);

select lives_ok(
  $$ insert into public.board_members (board_id, user_id, role)
     values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'owner') $$,
  'an owner can add a co-owner'
);
select throws_ok(
  $$ delete from public.board_members
     where board_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000a' $$,
  '23001', null,
  'the board creator cannot be removed even when another owner exists'
);
select results_eq(
  $$ update public.board_members set role = 'editor'
     where board_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000b'
     returning role $$,
  $$ values ('editor'::public.board_role) $$,
  'a non-creator owner can be demoted while the creator remains owner'
);

-- ---------------------------------------------------------------------------
-- Cascades do not trip the owner protection
-- ---------------------------------------------------------------------------

select results_eq(
  $$ delete from public.boards where id = '00000000-0000-4000-b000-000000000002' returning id $$,
  $$ values ('00000000-0000-4000-b000-000000000002'::uuid) $$,
  'the owner can delete a board'
);

reset role;

select is_empty(
  $$ select 1 from public.board_members where board_id = '00000000-0000-4000-b000-000000000002'
     union all select 1 from public.board_columns where board_id = '00000000-0000-4000-b000-000000000002'
     union all select 1 from public.board_labels where board_id = '00000000-0000-4000-b000-000000000002' $$,
  'deleting a board cascades to members, columns and labels'
);

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-4000-a000-00000000000a' $$,
  'deleting the account of a board creator succeeds'
);
select is_empty(
  $$ select 1 from public.boards where id = '00000000-0000-4000-b000-000000000001' $$,
  'the creator''s boards are deleted with the account'
);

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values ('00000000-0000-4000-a000-00000000000d', 'd@test.local');
insert into public.boards (id, title, owner_id)
values ('00000000-0000-4000-b000-000000000003', 'Board 3', '00000000-0000-4000-a000-00000000000d');
insert into public.board_columns (id, board_id, title, position)
values ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000003', 'Col', 'a0');

select throws_ok(
  $$ insert into public.boards (title, owner_id) values ('   ', '00000000-0000-4000-a000-00000000000d') $$,
  '23514', null,
  'board title cannot be blank'
);
select throws_ok(
  $$ insert into public.boards (title, owner_id) values (repeat('x', 101), '00000000-0000-4000-a000-00000000000d') $$,
  '23514', null,
  'board title max 100 chars'
);
select throws_ok(
  $$ insert into public.cards (board_id, column_id, title, position, description)
     values ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000003', 'x', 'a0',
             repeat('x', 10001)) $$,
  '23514', null,
  'card description max 10000 chars'
);
select throws_ok(
  $$ insert into public.cards (board_id, column_id, title, position)
     values ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000003', 'x', 'a 0') $$,
  '23514', null,
  'position must be a base62 fractional index key'
);
select throws_ok(
  $$ insert into public.board_labels (board_id, color) values ('00000000-0000-4000-b000-000000000003', 'magenta') $$,
  '23514', null,
  'label colour must be from the palette'
);
select throws_ok(
  $$ insert into public.board_labels (board_id, name, color)
     values ('00000000-0000-4000-b000-000000000003', repeat('x', 31), 'red') $$,
  '23514', null,
  'label name max 30 chars'
);

-- Fractional keys sort in byte order ('Z' < 'a', 'a0' < 'a0V' < 'a1') ---------------

insert into public.board_columns (board_id, title, position) values
  ('00000000-0000-4000-b000-000000000003', 'Z', 'Zz'),
  ('00000000-0000-4000-b000-000000000003', 'mid', 'a0V'),
  ('00000000-0000-4000-b000-000000000003', 'last', 'a1');

select results_eq(
  $$ select position collate "default" from public.board_columns
     where board_id = '00000000-0000-4000-b000-000000000003' order by board_columns.position, board_columns.id $$,
  $$ values ('Zz'), ('a0'), ('a0V'), ('a1') $$,
  'positions sort in byte order'
);

select * from finish();
rollback;
