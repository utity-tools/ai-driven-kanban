-- Board invites (v0.3) and member management.
--
-- Owners create single-use invite links (editor/viewer, 7 days) and can list/revoke them;
-- nobody else sees them, and token_hash is never readable. Invites are created and accepted
-- only through RPCs. Demo (anonymous) users cannot create or accept invites but can peek.
-- Accepting as an existing member returns the board without consuming the invite.
-- Members: owners change roles and remove members, anyone can leave, the creator is
-- protected, removed members lose their card assignments, and a former owner's pending
-- invites are revoked.
begin;
create extension if not exists pgtap with schema extensions;

select plan(121);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

select has_table('public', 'board_invites', 'board_invites exists');
select columns_are(
  'public', 'board_invites',
  array['id', 'board_id', 'role', 'token_hash', 'created_by', 'created_at', 'expires_at',
        'accepted_by', 'accepted_at'],
  'board_invites has exactly the expected columns'
);
select col_is_pk('public', 'board_invites', 'id', 'primary key is id');
select col_is_unique('public', 'board_invites', 'token_hash', 'token_hash is unique');
select col_type_is('public', 'board_invites', 'role', 'board_role', 'role is a board_role');
select is(
  (select array_agg(conname::text || ':' || confrelid::regclass::text || ':' || confdeltype::text
                    order by conname)
   from pg_constraint
   where conrelid = 'public.board_invites'::regclass and contype = 'f'),
  array['board_invites_accepted_by_fkey:auth.users:n',
        'board_invites_board_id_fkey:boards:c',
        'board_invites_created_by_fkey:auth.users:c'],
  'FKs: board and inviter cascade, acceptor is set null'
);
select has_index('public', 'board_invites', 'board_invites_board_id_idx', array['board_id'],
  'index on board_invites(board_id)');
select has_index('public', 'board_invites', 'board_invites_created_by_idx', array['created_by'],
  'index on board_invites(created_by)');
select has_index('public', 'board_invites', 'board_invites_accepted_by_idx', array['accepted_by'],
  'index on board_invites(accepted_by)');

select ok((select relrowsecurity from pg_class where oid = 'public.board_invites'::regclass),
  'RLS on board_invites');
select policies_are(
  'public', 'board_invites',
  array['board_invites: owners can read', 'board_invites: owners can revoke'],
  'board_invites has exactly read and revoke (delete) policies'
);
select ok(
  not has_table_privilege('anon', 'public.board_invites', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'anon has no privileges on board_invites'
);
select ok(
  not has_table_privilege('authenticated', 'public.board_invites', 'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  'authenticated cannot INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER or MAINTAIN board_invites'
);
select ok(has_table_privilege('authenticated', 'public.board_invites', 'DELETE'),
  'authenticated can DELETE (revoke), rows limited by RLS');
select is(
  (select array_agg(a.attname::text order by a.attname)
   from pg_attribute a
   where a.attrelid = 'public.board_invites'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')),
  array['accepted_at', 'accepted_by', 'board_id', 'created_at', 'created_by', 'expires_at', 'id', 'role'],
  'authenticated can select every column except token_hash'
);
select is_empty(
  $$ select a.attname from pg_attribute a
     where a.attrelid = 'public.board_invites'::regclass and a.attnum > 0 and not a.attisdropped
       and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
            or has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')) $$,
  'authenticated cannot insert or update any column of board_invites'
);

select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
   from pg_proc p
   where p.proname in ('create_board_invite', 'get_board_invite', 'accept_board_invite',
                       'revoke_invites_of_former_owner')
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  array[
    'accept_board_invite(text)', 'create_board_invite(uuid,board_role)', 'get_board_invite(text)',
    'private.accept_board_invite(text)', 'private.create_board_invite(uuid,board_role)',
    'private.get_board_invite(text)', 'private.revoke_invites_of_former_owner()'
  ],
  'invite functions are security definer with an empty search_path'
);
select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'EXECUTE')
                   and not has_function_privilege('anon', f, 'EXECUTE')
                   and not has_function_privilege('public', f, 'EXECUTE'))
   from unnest(array['public.create_board_invite(uuid, public.board_role)',
                     'public.get_board_invite(text)',
                     'public.accept_board_invite(text)']) f),
  'the public invite RPCs are executable by authenticated only'
);
select ok(
  (select bool_and(not has_function_privilege('authenticated', f, 'EXECUTE')
                   and not has_function_privilege('anon', f, 'EXECUTE')
                   and not has_function_privilege('public', f, 'EXECUTE'))
   from unnest(array['private.create_board_invite(uuid, public.board_role)',
                     'private.get_board_invite(text)',
                     'private.accept_board_invite(text)',
                     'private.board_invite_token_hash(text)',
                     'private.revoke_invites_of_former_owner()']) f),
  'the private invite functions are not executable by API roles'
);
select has_trigger('public', 'board_members', 'board_members_revoke_invites_of_former_owner',
  'former-owner invite cleanup trigger exists');

-- ---------------------------------------------------------------------------
-- Fixtures: O = creator/owner, P = second owner, E = editor, V = viewer, X = outsider,
-- J / K = people who will join, D = demo (anonymous) user.
-- Board 1 "Invites" (O; P owner, E editor, V viewer). Board 2 "Other" (O only).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000001301', 'o13@test.local', '{"full_name": "Olive Owner"}'),
  ('00000000-0000-4000-a000-000000001302', 'p13@test.local', '{}'),
  ('00000000-0000-4000-a000-000000001303', 'e13@test.local', '{}'),
  ('00000000-0000-4000-a000-000000001304', 'v13@test.local', '{}'),
  ('00000000-0000-4000-a000-000000001305', 'x13@test.local', '{}'),
  ('00000000-0000-4000-a000-000000001306', 'j13@test.local', '{}'),
  ('00000000-0000-4000-a000-000000001307', 'k13@test.local', '{}');
insert into auth.users (id, is_anonymous) values ('00000000-0000-4000-a000-000000001308', true);

grant usage on schema extensions to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);

select set_config('test.board1', public.create_board('Invites')::text, true);
select set_config('test.board2', public.create_board('Other')::text, true);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001302', 'owner'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001303', 'editor'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001304', 'viewer');
  $$,
  'owner adds a second owner, an editor and a viewer'
);

-- ---------------------------------------------------------------------------
-- create_board_invite: owner
-- ---------------------------------------------------------------------------

select set_config('test.inv_editor',
  (select row_to_json(r)::text from public.create_board_invite(current_setting('test.board1')::uuid, 'editor') r),
  true);
select set_config('test.t_editor', current_setting('test.inv_editor')::json ->> 'token', true);
select set_config('test.t_viewer',
  (select token from public.create_board_invite(current_setting('test.board1')::uuid, 'viewer')), true);

select ok(current_setting('test.t_editor') ~ '^[A-Za-z0-9_-]{43}$',
  'the token is 43 url-safe base64 characters');
select isnt(current_setting('test.t_editor'), current_setting('test.t_viewer'), 'tokens are random');
select is(
  (current_setting('test.inv_editor')::json ->> 'expires_at')::timestamptz,
  now() + interval '7 days',
  'the invite expires in 7 days'
);
select results_eq(
  $$ select board_id, role, created_by, accepted_by, accepted_at
     from public.board_invites where id = (current_setting('test.inv_editor')::json ->> 'invite_id')::uuid $$,
  $$ values (current_setting('test.board1')::uuid, 'editor'::public.board_role,
             '00000000-0000-4000-a000-000000001301'::uuid, null::uuid, null::timestamptz) $$,
  'owner sees the new pending invite with the right board, role and inviter'
);
select is(
  (select count(*)::int from public.board_invites where board_id = current_setting('test.board1')::uuid),
  2,
  'owner lists the invites of their board'
);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'owner') $$,
  '23514', 'Invites can only grant the editor or viewer role',
  'an invite cannot grant the owner role'
);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, null) $$,
  '23514', 'Invites can only grant the editor or viewer role',
  'an invite needs a role'
);
select throws_ok(
  $$ select public.create_board_invite('00000000-0000-4000-b000-000000001399', 'editor') $$,
  '42501', 'Board not found',
  'an invite for an unknown board is rejected like a board the caller does not own'
);
select throws_ok(
  $$ select token_hash from public.board_invites $$,
  '42501', null,
  'not even an owner can read token_hash'
);
select throws_ok(
  $$ select * from public.board_invites $$,
  '42501', null,
  'select * fails because it includes token_hash (the app must list columns)'
);
select throws_ok(
  $$ insert into public.board_invites (board_id, role, token_hash)
     values (current_setting('test.board1')::uuid, 'editor', sha256('x'::bytea)) $$,
  '42501', null,
  'owners cannot insert invites directly'
);
select throws_ok(
  $$ update public.board_invites set expires_at = now() + interval '1 year' $$,
  '42501', null,
  'owners cannot update invites directly (e.g. extend them)'
);

reset role;
select ok(
  (select token_hash = sha256(convert_to(current_setting('test.t_editor'), 'UTF8'))
   from public.board_invites where id = (current_setting('test.inv_editor')::json ->> 'invite_id')::uuid),
  'only the sha256 of the token is stored'
);
select is_empty(
  $$ select 1 from public.board_invites
     where position(convert_to(current_setting('test.t_editor'), 'UTF8') in token_hash) > 0 $$,
  'the plaintext token is not stored'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- create_board_invite / RLS: everyone else
-- ---------------------------------------------------------------------------

-- Editor
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001303", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  '42501', 'Board not found', 'an editor cannot create invites');
select is_empty($$ select id from public.board_invites $$, 'an editor sees no invites');
select is_empty(
  $$ delete from public.board_invites returning id $$,
  'an editor cannot revoke invites (0 rows)');

-- Viewer
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001304", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  '42501', 'Board not found', 'a viewer cannot create invites');
select is_empty($$ select id from public.board_invites $$, 'a viewer sees no invites');
select is_empty(
  $$ delete from public.board_invites returning id $$,
  'a viewer cannot revoke invites (0 rows)');

-- Outsider
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001305", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  '42501', 'Board not found', 'an outsider cannot create invites');
select is_empty($$ select id from public.board_invites $$, 'an outsider sees no invites');

-- Demo (anonymous) user, owner of their own demo board
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000001308", "role": "authenticated", "is_anonymous": true}', true);
select throws_ok(
  $$ select public.create_board_invite(
       (select id from public.boards where owner_id = '00000000-0000-4000-a000-000000001308'), 'viewer') $$,
  'INV04', 'Demo accounts cannot invite people. Create an account first.',
  'a demo user cannot create invites, even on their own demo board'
);

-- Signed-in role but no user
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  '42501', 'You must be signed in to invite people', 'no user, no invite');

-- anon
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  '42501', null, 'anon cannot execute create_board_invite');
select throws_ok(
  $$ select public.get_board_invite(current_setting('test.t_editor')) $$,
  '42501', null, 'anon cannot execute get_board_invite');
select throws_ok(
  $$ select public.accept_board_invite(current_setting('test.t_editor')) $$,
  '42501', null, 'anon cannot execute accept_board_invite');
select throws_ok(
  $$ select id from public.board_invites $$,
  '42501', null, 'anon cannot read board_invites');
reset role;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Pending-invite cap (board 2)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.create_board_invite(current_setting('test.board2')::uuid, 'viewer')
     from generate_series(1, 20) $$,
  'an owner creates 20 pending invites on a board'
);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board2')::uuid, 'viewer') $$,
  'INV05', 'This board already has 20 pending invites. Revoke some before creating more.',
  'a 21st pending invite is rejected'
);

reset role;
update public.board_invites
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where id = (select id from public.board_invites
            where board_id = current_setting('test.board2')::uuid limit 1);
set local role authenticated;

select lives_ok(
  $$ select public.create_board_invite(current_setting('test.board2')::uuid, 'viewer') $$,
  'expired invites do not count towards the cap'
);
select throws_ok(
  $$ select public.create_board_invite(current_setting('test.board2')::uuid, 'viewer') $$,
  'INV05', null,
  'the cap applies again at 20 pending'
);
select results_eq(
  $$ with d as (delete from public.board_invites
                where board_id = current_setting('test.board2')::uuid returning 1)
     select count(*)::int from d $$,
  $$ values (21) $$,
  'an owner revokes (deletes) invites of their board'
);
select lives_ok(
  $$ select public.create_board_invite(current_setting('test.board2')::uuid, 'viewer') $$,
  'revoking frees the cap'
);

-- ---------------------------------------------------------------------------
-- get_board_invite (peek)
-- ---------------------------------------------------------------------------

-- J: permanent outsider
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001306", "role": "authenticated"}', true);

select results_eq(
  $$ select status, role, expires_at, is_member, board_id, board_title, inviter_name
     from public.get_board_invite(current_setting('test.t_editor')) $$,
  $$ values ('pending'::text, 'editor'::public.board_role, now() + interval '7 days', false,
             null::uuid, 'Invites'::text, 'Olive Owner'::text) $$,
  'a pending invite shows its board title, role and inviter, but not the board id'
);

-- Without a display name the inviter stays anonymous: the email is never shown.
reset role;
update public.profiles set display_name = null where id = '00000000-0000-4000-a000-000000001301';
set local role authenticated;
select is(
  (select inviter_name from public.get_board_invite(current_setting('test.t_editor'))),
  null,
  'an inviter without a display name is null, never their email'
);
reset role;
update public.profiles set display_name = 'Olive Owner' where id = '00000000-0000-4000-a000-000000001301';
set local role authenticated;
select is_empty(
  $$ select * from public.get_board_invite('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  'an unknown token returns no row');
select is_empty(
  $$ select * from public.get_board_invite('not a token') $$,
  'a malformed token returns no row');
select is_empty(
  $$ select * from public.get_board_invite(null) $$,
  'a null token returns no row');

-- E: already a member
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001303", "role": "authenticated"}', true);
select results_eq(
  $$ select status, is_member, board_id, board_title
     from public.get_board_invite(current_setting('test.t_viewer')) $$,
  $$ values ('pending'::text, true, current_setting('test.board1')::uuid, 'Invites'::text) $$,
  'a member peeking sees is_member and the board id'
);

-- D: demo user can peek (so the page can ask them to create an account)
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000001308", "role": "authenticated", "is_anonymous": true}', true);
select results_eq(
  $$ select status, board_title from public.get_board_invite(current_setting('test.t_editor')) $$,
  $$ values ('pending'::text, 'Invites'::text) $$,
  'a demo user can peek at an invite'
);

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select * from public.get_board_invite(current_setting('test.t_editor')) $$,
  '42501', 'You must be signed in to view an invite', 'peeking needs a signed-in user');

-- ---------------------------------------------------------------------------
-- accept_board_invite
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.accept_board_invite(current_setting('test.t_editor')) $$,
  '42501', 'You must be signed in to accept an invite', 'accepting needs a signed-in user');

-- D: demo user
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000001308", "role": "authenticated", "is_anonymous": true}', true);
select throws_ok(
  $$ select public.accept_board_invite(current_setting('test.t_editor')) $$,
  'INV04', 'Demo accounts cannot join boards. Create an account to accept this invite.',
  'a demo user cannot accept an invite');

-- J accepts the editor invite
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001306", "role": "authenticated"}', true);
select is(
  public.accept_board_invite(current_setting('test.t_editor')),
  current_setting('test.board1')::uuid,
  'accepting returns the board id'
);
select results_eq(
  $$ select role from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001306' $$,
  $$ values ('editor'::public.board_role) $$,
  'the new member has the invite''s role'
);
select is(
  (select title from public.boards where id = current_setting('test.board1')::uuid),
  'Invites',
  'the new member can read the board'
);
select results_eq(
  $$ select status, is_member, board_id from public.get_board_invite(current_setting('test.t_editor')) $$,
  $$ values ('accepted'::text, true, current_setting('test.board1')::uuid) $$,
  'after accepting, peek shows the invite used and the caller a member'
);
select is(
  public.accept_board_invite(current_setting('test.t_editor')),
  current_setting('test.board1')::uuid,
  'accepting again as the new member is a no-op that returns the board'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);
select results_eq(
  $$ select accepted_by, accepted_at from public.board_invites
     where id = (current_setting('test.inv_editor')::json ->> 'invite_id')::uuid $$,
  $$ values ('00000000-0000-4000-a000-000000001306'::uuid, now()) $$,
  'the invite is marked used by the new member'
);

-- K: the used invite
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001307", "role": "authenticated"}', true);
select results_eq(
  $$ select status, role, is_member, board_id, board_title, inviter_name
     from public.get_board_invite(current_setting('test.t_editor')) $$,
  $$ values ('accepted'::text, 'editor'::public.board_role, false, null::uuid, null::text, null::text) $$,
  'a used invite hides the board and inviter from non-members'
);
select throws_ok(
  $$ select public.accept_board_invite(current_setting('test.t_editor')) $$,
  'INV03', 'This invite has already been used. Ask the board owner for a new link.',
  'a used invite cannot be accepted by someone else'
);
select throws_ok(
  $$ select public.accept_board_invite('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  'INV01', 'Invite not found. It may have been revoked.',
  'an unknown token is rejected'
);
select throws_ok(
  $$ select public.accept_board_invite('short') $$,
  'INV01', null,
  'a malformed token is rejected as not found'
);
select is_empty(
  $$ select 1 from public.board_members where user_id = '00000000-0000-4000-a000-000000001307'
       and board_id = current_setting('test.board1')::uuid $$,
  'failed accepts add no membership'
);

-- Already a member: no role change, invite not consumed
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);
select is(
  public.accept_board_invite(current_setting('test.t_viewer')),
  current_setting('test.board1')::uuid,
  'an owner opening their own viewer invite gets the board back'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001303", "role": "authenticated"}', true);
select is(
  public.accept_board_invite(current_setting('test.t_viewer')),
  current_setting('test.board1')::uuid,
  'an editor opening a viewer invite gets the board back'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);
select results_eq(
  $$ select user_id, role from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id in ('00000000-0000-4000-a000-000000001301', '00000000-0000-4000-a000-000000001303')
     order by user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001301'::uuid, 'owner'::public.board_role),
            ('00000000-0000-4000-a000-000000001303'::uuid, 'editor'::public.board_role) $$,
  'existing members keep their roles (no demotion, no promotion)'
);
select is(
  (select accepted_at from public.board_invites where role = 'viewer'
     and board_id = current_setting('test.board1')::uuid),
  null,
  'an existing member does not consume the invite'
);

-- K accepts the viewer invite
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001307", "role": "authenticated"}', true);
select is(
  public.accept_board_invite(current_setting('test.t_viewer')),
  current_setting('test.board1')::uuid,
  'the intended person can still use the invite'
);
select results_eq(
  $$ select role from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001307' $$,
  $$ values ('viewer'::public.board_role) $$,
  'they join as viewer'
);
select is_empty(
  $$ select id from public.board_invites $$,
  'a member who joined as viewer sees no invites'
);

-- Expired
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);
select set_config('test.t_expired',
  (select token from public.create_board_invite(current_setting('test.board2')::uuid, 'editor')), true);
reset role;
update public.board_invites
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where token_hash = sha256(convert_to(current_setting('test.t_expired'), 'UTF8'));
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001305", "role": "authenticated"}', true);
select results_eq(
  $$ select status, board_title, inviter_name from public.get_board_invite(current_setting('test.t_expired')) $$,
  $$ values ('expired'::text, null::text, null::text) $$,
  'an expired invite hides the board and inviter from non-members'
);
select throws_ok(
  $$ select public.accept_board_invite(current_setting('test.t_expired')) $$,
  'INV02', 'This invite has expired. Ask the board owner for a new link.',
  'an expired invite cannot be accepted'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);
select is(
  public.accept_board_invite(current_setting('test.t_expired')),
  current_setting('test.board2')::uuid,
  'a member opening an expired invite of their board still gets the board'
);

-- Revoked
select set_config('test.t_revoked',
  (select token from public.create_board_invite(current_setting('test.board1')::uuid, 'editor')), true);
select results_eq(
  $$ with d as (delete from public.board_invites
                where board_id = current_setting('test.board1')::uuid and accepted_at is null
                returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'the owner revokes the pending editor invite'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001305", "role": "authenticated"}', true);
select is_empty(
  $$ select * from public.get_board_invite(current_setting('test.t_revoked')) $$,
  'a revoked invite returns no row');
select throws_ok(
  $$ select public.accept_board_invite(current_setting('test.t_revoked')) $$,
  'INV01', null,
  'a revoked invite cannot be accepted'
);

-- ---------------------------------------------------------------------------
-- Former owners: their pending invites are revoked
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001302", "role": "authenticated"}', true);
select lives_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  'a second owner creates an invite'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);
select results_eq(
  $$ update public.board_members set role = 'editor'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001302'
     returning role $$,
  $$ values ('editor'::public.board_role) $$,
  'the creator demotes the second owner'
);
select is_empty(
  $$ select 1 from public.board_invites where created_by = '00000000-0000-4000-a000-000000001302' $$,
  'a demoted owner''s pending invites are revoked'
);
select is(
  (select count(*)::int from public.board_invites
   where board_id = current_setting('test.board1')::uuid and accepted_at is not null),
  2,
  'used invites are kept'
);

select lives_ok(
  $$ update public.board_members set role = 'owner'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001302' $$,
  'the creator promotes them back to owner'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001302", "role": "authenticated"}', true);
select lives_ok(
  $$ select public.create_board_invite(current_setting('test.board1')::uuid, 'viewer') $$,
  'the second owner creates another invite'
);
select results_eq(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001302'
     returning user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001302'::uuid) $$,
  'a non-creator owner can leave the board'
);
reset role;
select is_empty(
  $$ select 1 from public.board_invites where created_by = '00000000-0000-4000-a000-000000001302' $$,
  'an owner who leaves has their pending invites revoked'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Member management
-- Board 1 now: O owner (creator), E editor, V viewer, J editor, K viewer.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001301", "role": "authenticated"}', true);

select lives_ok(
  $$
    insert into public.cards (id, board_id, column_id, title, position)
    select '00000000-0000-4000-d000-000000001301', c.board_id, c.id, 'Shared card', 'a0'
    from public.board_columns c
    where c.board_id = current_setting('test.board1')::uuid and c.position = 'a0';
    insert into public.card_assignees (card_id, user_id, board_id) values
      ('00000000-0000-4000-d000-000000001301', '00000000-0000-4000-a000-000000001306', current_setting('test.board1')::uuid),
      ('00000000-0000-4000-d000-000000001301', '00000000-0000-4000-a000-000000001307', current_setting('test.board1')::uuid),
      ('00000000-0000-4000-d000-000000001301', '00000000-0000-4000-a000-000000001303', current_setting('test.board1')::uuid);
  $$,
  'owner assigns J, K and E to a card'
);

select results_eq(
  $$ update public.board_members set role = 'editor'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001304'
     returning role $$,
  $$ values ('editor'::public.board_role) $$,
  'an owner promotes a viewer to editor'
);
select results_eq(
  $$ update public.board_members set role = 'viewer'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001304'
     returning role $$,
  $$ values ('viewer'::public.board_role) $$,
  'an owner demotes an editor to viewer'
);
select throws_ok(
  $$ update public.board_members set user_id = '00000000-0000-4000-a000-000000001305'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001304' $$,
  '42501', null,
  'an owner cannot rewrite who a membership belongs to (role is the only updatable column)'
);
select throws_ok(
  $$ update public.board_members set role = 'editor'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001301' $$,
  '23001', 'The board creator cannot be removed or demoted',
  'the creator cannot demote themselves'
);
select throws_ok(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001301' $$,
  '23001', 'The board creator cannot be removed or demoted',
  'the creator cannot leave their board'
);
select results_eq(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001307'
     returning user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001307'::uuid) $$,
  'an owner removes a member'
);
select results_eq(
  $$ select user_id from public.card_assignees
     where card_id = '00000000-0000-4000-d000-000000001301' order by user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001303'::uuid), ('00000000-0000-4000-a000-000000001306'::uuid) $$,
  'the removed member is unassigned from the board''s cards'
);

-- A second owner cannot remove or demote the creator either
select lives_ok(
  $$ update public.board_members set role = 'owner'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001303' $$,
  'the creator promotes the editor E to owner'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001303", "role": "authenticated"}', true);
select throws_ok(
  $$ update public.board_members set role = 'viewer'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001301' $$,
  '23001', 'The board creator cannot be removed or demoted',
  'another owner cannot demote the creator'
);
select throws_ok(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001301' $$,
  '23001', 'The board creator cannot be removed or demoted',
  'another owner cannot remove the creator'
);
select lives_ok(
  $$ update public.board_members set role = 'editor'
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001303' $$,
  'a non-creator owner can step down to editor while another owner remains'
);

-- Non-owners cannot manage members
select is_empty(
  $$ update public.board_members set role = 'owner'
     where board_id = current_setting('test.board1')::uuid returning user_id $$,
  'an editor cannot change roles, not even their own (0 rows)'
);
select is_empty(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001304' returning user_id $$,
  'an editor cannot remove another member (0 rows)'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001304", "role": "authenticated"}', true);
select is_empty(
  $$ update public.board_members set role = 'editor'
     where board_id = current_setting('test.board1')::uuid returning user_id $$,
  'a viewer cannot change roles (0 rows)'
);
select is_empty(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001306' returning user_id $$,
  'a viewer cannot remove another member (0 rows)'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001305", "role": "authenticated"}', true);
select is_empty(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid returning user_id $$,
  'an outsider cannot remove members (0 rows)'
);

-- Members can leave
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001306", "role": "authenticated"}', true);
select results_eq(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001306'
     returning user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001306'::uuid) $$,
  'an editor leaves the board'
);
select is_empty(
  $$ select id from public.boards where id = current_setting('test.board1')::uuid $$,
  'after leaving, the board is no longer visible'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001304", "role": "authenticated"}', true);
select results_eq(
  $$ delete from public.board_members
     where board_id = current_setting('test.board1')::uuid
       and user_id = '00000000-0000-4000-a000-000000001304'
     returning user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001304'::uuid) $$,
  'a viewer leaves the board'
);

reset role;
select results_eq(
  $$ select user_id from public.card_assignees
     where card_id = '00000000-0000-4000-d000-000000001301' $$,
  $$ values ('00000000-0000-4000-a000-000000001303'::uuid) $$,
  'a member who leaves is unassigned from the board''s cards'
);
select results_eq(
  $$ select user_id, role from public.board_members
     where board_id = current_setting('test.board1')::uuid order by user_id $$,
  $$ values ('00000000-0000-4000-a000-000000001301'::uuid, 'owner'::public.board_role),
            ('00000000-0000-4000-a000-000000001303'::uuid, 'editor'::public.board_role) $$,
  'final membership: the creator (owner) and E (editor)'
);

-- ---------------------------------------------------------------------------
-- Cascades
-- ---------------------------------------------------------------------------

delete from auth.users where id = '00000000-0000-4000-a000-000000001306';
select results_eq(
  $$ select accepted_by is null, accepted_at is not null from public.board_invites
     where board_id = current_setting('test.board1')::uuid and role = 'editor' $$,
  $$ values (true, true) $$,
  'deleting the acceptor''s account keeps the invite used'
);
delete from public.boards where id = current_setting('test.board1')::uuid;
select is_empty(
  $$ select 1 from public.board_invites where board_id = current_setting('test.board1')::uuid $$,
  'deleting the board deletes its invites'
);

select * from finish();
rollback;
