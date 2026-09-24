-- Onboarding: every new non-anonymous user gets a default board on sign-up.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Function & trigger shape ---------------------------------------------------------

select has_trigger('auth', 'users', 'on_auth_user_created', 'sign-up trigger exists on auth.users');

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'public.handle_new_user()'::regprocedure),
  'handle_new_user is security definer with empty search_path'
);

select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
  and not has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE'),
  'handle_new_user is not executable by public, anon or authenticated'
);

-- A normal user signs up -----------------------------------------------------------

select lives_ok(
  $$ insert into auth.users (id, email) values ('00000000-0000-4000-a000-000000000001', 'new@test.local') $$,
  'inserting a normal auth user succeeds'
);

select results_eq(
  $$ select title, owner_id from public.boards where owner_id = '00000000-0000-4000-a000-000000000001' $$,
  $$ values ('My board', '00000000-0000-4000-a000-000000000001'::uuid) $$,
  'a normal user gets exactly one board, "My board", owned by them'
);

select results_eq(
  $$ select c.title, c.position collate "default"
     from public.board_columns c
     join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000001'
     order by c.position, c.id $$,
  $$ values ('To do', 'a0'), ('In progress', 'a1'), ('Done', 'a2') $$,
  'the default board has To do / In progress / Done, in that order'
);

select results_eq(
  $$ select m.user_id, m.role
     from public.board_members m
     join public.boards b on b.id = m.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000001' $$,
  $$ values ('00000000-0000-4000-a000-000000000001'::uuid, 'owner'::public.board_role) $$,
  'the new user is the only member of the default board, as owner'
);

select is_empty(
  $$ select 1 from public.cards c join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000001' $$,
  'the default board starts with no cards'
);

-- The user sees their board through RLS ---------------------------------------------

grant usage on schema extensions to authenticated;
grant all on all tables in schema pg_temp to authenticated;
grant all on all sequences in schema pg_temp to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);

select results_eq(
  $$ select b.title, count(c.id)::int
     from public.boards b join public.board_columns c on c.board_id = b.id
     group by b.title $$,
  $$ values ('My board', 3) $$,
  'the new user can read their default board and its columns'
);

reset role;

-- An anonymous user signs up ---------------------------------------------------------

select lives_ok(
  $$ insert into auth.users (id, is_anonymous) values ('00000000-0000-4000-a000-000000000002', true) $$,
  'inserting an anonymous auth user succeeds'
);

select is_empty(
  $$ select 1 from public.boards where owner_id = '00000000-0000-4000-a000-000000000002' $$,
  'an anonymous user gets no board'
);

select is_empty(
  $$ select 1 from public.board_members where user_id = '00000000-0000-4000-a000-000000000002' $$,
  'an anonymous user gets no membership'
);

select * from finish();
rollback;
