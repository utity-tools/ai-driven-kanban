-- Profiles: creation on sign-up, sync with auth.users, visibility, column privileges,
-- and the relationships the API uses to embed profiles.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- ---------------------------------------------------------------------------
-- Shape: table, RLS, policies, privileges, functions, triggers
-- ---------------------------------------------------------------------------

select has_table('public', 'profiles', 'profiles exists');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');

select is(
  (select array_agg(cmd::text order by cmd) from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  array['SELECT', 'UPDATE'],
  'profiles has only select and update policies (rows are created/deleted by triggers)'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated cannot insert or delete profiles'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'),
  'only profiles.display_name is updatable by clients'
);

select ok(
  (select p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.shares_board_with(uuid)'::regprocedure),
  'shares_board_with is security definer, stable, with empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.shares_board_with(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.shares_board_with(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.shares_board_with(uuid)', 'EXECUTE'),
  'shares_board_with executable by authenticated only'
);

select has_trigger('auth', 'users', 'on_auth_user_updated', 'profile sync trigger exists on auth.users');

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.handle_user_updated()'::regprocedure)
  and not has_function_privilege('anon', 'public.handle_user_updated()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.handle_user_updated()', 'EXECUTE')
  and not has_function_privilege('public', 'public.handle_user_updated()', 'EXECUTE'),
  'handle_user_updated is security definer, pins search_path, not executable by API roles'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE')
  and not has_function_privilege('anon', 'private.profile_fields_from_metadata(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.profile_fields_from_metadata(jsonb)', 'EXECUTE'),
  'the metadata helper is not reachable by API roles'
);

-- Embedding relationships (PostgREST needs FKs into public.profiles) -----------------

select results_eq(
  $$ select con.conrelid::regclass::text collate "default", con.conname::text collate "default",
            (select array_agg(a.attname::text collate "default") from pg_attribute a
             where a.attrelid = con.conrelid and a.attnum = any (con.conkey)),
            con.confdeltype::text
     from pg_constraint con
     where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass
     order by 1 $$,
  $$ values ('board_members', 'board_members_user_id_profiles_fkey', array['user_id'], 'c'),
            ('card_assignees', 'card_assignees_user_id_profiles_fkey', array['user_id'], 'c') $$,
  'board_members.user_id and card_assignees.user_id reference profiles(id), on delete cascade'
);

select has_index('public', 'card_assignees', 'card_assignees_user_id_idx', 'index on card_assignees(user_id)');

-- ---------------------------------------------------------------------------
-- Sign-up creates the profile
-- ---------------------------------------------------------------------------

-- GitHub-like metadata: full_name wins over name / user_name; https avatar kept.
select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values (
       '00000000-0000-4000-a000-000000000501', 'ada@test.local',
       '{"full_name": "Ada Lovelace", "name": "ada", "user_name": "ada-l",
         "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4"}') $$,
  'sign-up with GitHub-like metadata succeeds'
);

select results_eq(
  $$ select email, display_name, avatar_url from public.profiles where id = '00000000-0000-4000-a000-000000000501' $$,
  $$ values ('ada@test.local', 'Ada Lovelace', 'https://avatars.githubusercontent.com/u/1?v=4') $$,
  'profile gets email, full_name and the https avatar'
);

select results_eq(
  $$ select m.role from public.board_members m join public.boards b on b.id = m.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000501' and m.user_id = b.owner_id $$,
  $$ values ('owner'::public.board_role) $$,
  'the default board and owner membership are still created (profile exists first)'
);

-- Odd metadata never blocks sign-up.
select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values
       ('00000000-0000-4000-a000-000000000502', 'long@test.local',
        jsonb_build_object('name', repeat('x', 79) || ' ' || repeat('y', 100), 'avatar_url', 'http://example.com/a.png')),
       ('00000000-0000-4000-a000-000000000503', 'noname@test.local', '{}'),
       ('00000000-0000-4000-a000-000000000504', 'weird@test.local',
        '{"full_name": 42, "name": ["x"], "avatar_url": {"url": "https://x"}}'),
       ('00000000-0000-4000-a000-000000000505', 'scalar@test.local', '"just a string"'),
       ('00000000-0000-4000-a000-000000000506', 'blank@test.local',
        E'{"full_name": "   ", "name": "  Grace \\n\\t Hopper  ", "avatar_url": " https://x.test/g.png "}'),
       ('00000000-0000-4000-a000-000000000507', 'handle@test.local',
        '{"user_name": "octocat", "avatar_url": "https://has space.test/a.png"}') $$,
  'sign-up with odd metadata succeeds'
);

select results_eq(
  $$ select id, display_name, avatar_url from public.profiles
     where id between '00000000-0000-4000-a000-000000000502' and '00000000-0000-4000-a000-000000000507'
     order by id $$,
  $$ values
       ('00000000-0000-4000-a000-000000000502'::uuid, repeat('x', 79), null::text),
       ('00000000-0000-4000-a000-000000000503'::uuid, null, null),
       ('00000000-0000-4000-a000-000000000504'::uuid, null, null),
       ('00000000-0000-4000-a000-000000000505'::uuid, null, null),
       ('00000000-0000-4000-a000-000000000506'::uuid, 'Grace Hopper', 'https://x.test/g.png'),
       ('00000000-0000-4000-a000-000000000507'::uuid, 'octocat', null) $$,
  'long names are truncated to 80 (and trimmed), non-https/invalid avatars and non-string values are ignored, blanks fall through, whitespace is normalised'
);

select is(
  (select count(*)::int from public.boards
   where owner_id between '00000000-0000-4000-a000-000000000502' and '00000000-0000-4000-a000-000000000507'),
  6,
  'users with odd metadata still get their default board'
);

-- Anonymous users get a "Demo visitor" profile and the demo board (08_demo_mode).
select lives_ok(
  $$ insert into auth.users (id, is_anonymous) values ('00000000-0000-4000-a000-000000000508', true) $$,
  'anonymous sign-up succeeds'
);

select results_eq(
  $$ select email, display_name, avatar_url from public.profiles where id = '00000000-0000-4000-a000-000000000508' $$,
  $$ values (null::text, 'Demo visitor'::text, null::text) $$,
  'an anonymous user gets a profile named "Demo visitor", without email or avatar'
);

select results_eq(
  $$ select title from public.boards where owner_id = '00000000-0000-4000-a000-000000000508' $$,
  $$ values ('Demo: Launch a landing page') $$,
  'an anonymous user gets the demo board instead of "My board"'
);

-- ---------------------------------------------------------------------------
-- Visibility: own profile + co-members only
-- ---------------------------------------------------------------------------
-- A = Ada (501), B = 503 (co-member on A's default board), S = 504 (stranger)

insert into public.board_members (board_id, user_id, role)
select b.id, '00000000-0000-4000-a000-000000000503', 'viewer'
from public.boards b where b.owner_id = '00000000-0000-4000-a000-000000000501';

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000501", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('00000000-0000-4000-a000-000000000501'::uuid), ('00000000-0000-4000-a000-000000000503'::uuid) $$,
  'A sees their own profile and their co-member''s, nobody else''s'
);

select results_eq(
  $$ select m.user_id, p.display_name
     from public.board_members m join public.profiles p on p.id = m.user_id
     order by m.role $$,
  $$ values ('00000000-0000-4000-a000-000000000501'::uuid, 'Ada Lovelace'),
            ('00000000-0000-4000-a000-000000000503'::uuid, null) $$,
  'A can join the members of their board to their profiles'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000503", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('00000000-0000-4000-a000-000000000501'::uuid), ('00000000-0000-4000-a000-000000000503'::uuid) $$,
  'the co-member (viewer) sees A''s profile too'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000504", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-4000-a000-000000000504'::uuid) $$,
  'a stranger sees only their own profile'
);

select is(
  public.shares_board_with('00000000-0000-4000-a000-000000000501'),
  false,
  'shares_board_with is false for users without a common board'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000508", "role": "authenticated"}', true);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-4000-a000-000000000508'::uuid) $$,
  'an anonymous (demo) user sees only their own profile'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  $$ select 1 from public.profiles $$,
  '42501', null,
  'anon cannot read profiles'
);

-- ---------------------------------------------------------------------------
-- Updates: own display_name only
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000501", "role": "authenticated"}', true);

select results_eq(
  $$ update public.profiles set display_name = 'Ada L.' where id = '00000000-0000-4000-a000-000000000501' returning display_name $$,
  $$ values ('Ada L.') $$,
  'a user can update their own display_name'
);

select throws_ok(
  $$ update public.profiles set email = 'hijack@test.local' where id = '00000000-0000-4000-a000-000000000501' $$,
  '42501', null,
  'a user cannot update their email through profiles'
);

select throws_ok(
  $$ update public.profiles set avatar_url = 'https://evil.test/a.png' where id = '00000000-0000-4000-a000-000000000501' $$,
  '42501', null,
  'a user cannot update their avatar_url'
);

select is_empty(
  $$ update public.profiles set display_name = 'pwned' where id = '00000000-0000-4000-a000-000000000503' returning id $$,
  'a user cannot update a co-member''s profile'
);

select throws_ok(
  $$ update public.profiles set display_name = '   ' where id = '00000000-0000-4000-a000-000000000501' $$,
  '23514', null,
  'display_name cannot be blank'
);

select throws_ok(
  $$ update public.profiles set display_name = repeat('x', 81) where id = '00000000-0000-4000-a000-000000000501' $$,
  '23514', null,
  'display_name max 80 chars'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('00000000-0000-4000-a000-000000000599') $$,
  '42501', null,
  'clients cannot insert profiles'
);

select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-4000-a000-000000000501' $$,
  '42501', null,
  'clients cannot delete profiles'
);

reset role;

select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-a000-000000000503'),
  null,
  'the co-member''s profile is unchanged'
);

-- ---------------------------------------------------------------------------
-- Sync with auth.users
-- ---------------------------------------------------------------------------

update auth.users
set email = 'ada.new@test.local',
    raw_user_meta_data = '{"full_name": "Augusta Ada King", "avatar_url": "https://avatars.test/new.png"}'
where id = '00000000-0000-4000-a000-000000000501';

select results_eq(
  $$ select email, display_name, avatar_url from public.profiles where id = '00000000-0000-4000-a000-000000000501' $$,
  $$ values ('ada.new@test.local', 'Ada L.', 'https://avatars.githubusercontent.com/u/1?v=4') $$,
  'email follows auth.users; an edited display_name and existing avatar are not overwritten'
);

update auth.users
set raw_user_meta_data = '{"name": "Now Named", "avatar_url": "https://avatars.test/n.png"}'
where id = '00000000-0000-4000-a000-000000000503';

select results_eq(
  $$ select email, display_name, avatar_url from public.profiles where id = '00000000-0000-4000-a000-000000000503' $$,
  $$ values ('noname@test.local', 'Now Named', 'https://avatars.test/n.png') $$,
  'metadata updates fill display_name / avatar_url while they are still null'
);

select lives_ok(
  $$ update auth.users set raw_user_meta_data = '[1, 2, 3]' where id = '00000000-0000-4000-a000-000000000504' $$,
  'odd metadata on update never blocks the auth update'
);

-- ---------------------------------------------------------------------------
-- Deleting the account deletes the profile (and, through it, memberships)
-- ---------------------------------------------------------------------------

delete from auth.users where id = '00000000-0000-4000-a000-000000000503';

select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000503'
     union all select 1 from public.board_members where user_id = '00000000-0000-4000-a000-000000000503' $$,
  'deleting an auth user removes their profile and memberships'
);

select * from finish();
rollback;
