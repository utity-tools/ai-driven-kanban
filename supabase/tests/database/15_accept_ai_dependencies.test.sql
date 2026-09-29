-- Accepting AI-proposed dependencies (v0.3 delivery 5): card_dependencies.source, and
-- public.accept_ai_dependencies() which writes source = 'ai' edges "blocker blocks card" on
-- behalf of a reviewing owner/editor, bypassing the INSERT policy that otherwise forces
-- source = 'manual'. See supabase/migrations/20260929170619_ai_dependencies.sql.
-- O = owner, E = editor, V = viewer, X = outsider, D = anonymous (demo) editor.
begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

-- ---------------------------------------------------------------------------
-- Shape: source column, policies, privileges, functions
-- ---------------------------------------------------------------------------

select col_type_is('public', 'card_dependencies', 'source', 'text', 'card_dependencies.source is text');
select col_not_null('public', 'card_dependencies', 'source', 'source is required');
select col_default_is('public', 'card_dependencies', 'source', 'manual', 'source defaults to manual');
select col_has_check('public', 'card_dependencies', 'source', 'a check restricts source');
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.card_dependencies'::regclass and conname = 'card_dependencies_source_check'),
  'CHECK ((source = ANY (ARRAY[''manual''::text, ''ai''::text])))',
  'source is one of manual or ai'
);
select policies_are(
  'public', 'card_dependencies',
  array[
    'card_dependencies: members can read',
    'card_dependencies: owners and editors can create',
    'card_dependencies: owners and editors can delete'
  ],
  'card_dependencies still has exactly read, create and delete policies'
);
select is_empty(
  $$ select a.attname from pg_attribute a
     where a.attrelid = 'public.card_dependencies'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  'authenticated cannot update any column of card_dependencies, source included'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.accept_ai_dependencies(uuid, uuid[])'::regprocedure),
  'private.accept_ai_dependencies is security definer with empty search_path'
);
select ok(
  not has_function_privilege('public', 'private.accept_ai_dependencies(uuid, uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'private.accept_ai_dependencies(uuid, uuid[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.accept_ai_dependencies(uuid, uuid[])', 'EXECUTE'),
  'private.accept_ai_dependencies is not executable by public, anon or authenticated'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.accept_ai_dependencies(uuid, uuid[])'::regprocedure),
  'public.accept_ai_dependencies is security definer with empty search_path'
);
-- Concurrency (see the migration header): the card and the blockers are locked against a
-- concurrent archive, in the same order as internal.check_card_dependency (row locks, then
-- the board advisory lock). Checked on the source: a real race needs two sessions.
select ok(
  (select p.prosrc ~ 'where c\.id = p_card_id\s+for no key update;'
      and p.prosrc ~ 'order by c\.id\s+for share;'
      and strpos(p.prosrc, 'for no key update;') < strpos(p.prosrc, 'for share;')
      and strpos(p.prosrc, 'for share;') < strpos(p.prosrc, 'pg_advisory_xact_lock(84200002')
      and strpos(p.prosrc, 'pg_advisory_xact_lock(84200002') < strpos(p.prosrc, 'from public.card_dependencies d')
   from pg_proc p where p.oid = 'private.accept_ai_dependencies(uuid, uuid[])'::regprocedure),
  'accept_ai_dependencies locks the card (no key update), then the blockers (share, id order), then the board'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_ai_dependencies(uuid, uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.accept_ai_dependencies(uuid, uuid[])', 'EXECUTE')
  and not has_function_privilege('public', 'public.accept_ai_dependencies(uuid, uuid[])', 'EXECUTE'),
  'public.accept_ai_dependencies is executable by authenticated only'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- Board 1 (O owns; E editor, V viewer, D anonymous editor): cards A, B, C, K, M, N, Q,
-- Arch (archived), T, and blockers P01..P20. Board 2 (O only): card Z.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000001501', 'o15@test.local'),
  ('00000000-0000-4000-a000-000000001502', 'e15@test.local'),
  ('00000000-0000-4000-a000-000000001503', 'v15@test.local'),
  ('00000000-0000-4000-a000-000000001504', 'x15@test.local');
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-a000-000000001505', true);

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001501", "role": "authenticated"}', true);

select set_config('test.board1', public.create_board('AI dependencies')::text, true);
select set_config('test.board2', public.create_board('Other')::text, true);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001502', 'editor'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001503', 'viewer'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001505', 'editor');
    insert into public.cards (id, board_id, column_id, title, position, archived_at)
    select v.id::uuid, c.board_id, c.id, v.title, v.position, v.archived_at::timestamptz
    from (values
      ('00000000-0000-4000-d000-000000001501', current_setting('test.board1'), 'Card A', 'a0', null),
      ('00000000-0000-4000-d000-000000001502', current_setting('test.board1'), 'Card B', 'a1', null),
      ('00000000-0000-4000-d000-000000001503', current_setting('test.board1'), 'Card C', 'a2', null),
      ('00000000-0000-4000-d000-000000001504', current_setting('test.board1'), 'Card K', 'a3', null),
      ('00000000-0000-4000-d000-000000001505', current_setting('test.board1'), 'Card M', 'a4', null),
      ('00000000-0000-4000-d000-000000001506', current_setting('test.board1'), 'Card N', 'a5', null),
      ('00000000-0000-4000-d000-000000001507', current_setting('test.board1'), 'Card Q', 'a6', null),
      ('00000000-0000-4000-d000-000000001508', current_setting('test.board1'), 'Card Arch', 'a7', now()::text),
      ('00000000-0000-4000-d000-000000001509', current_setting('test.board1'), 'Card T', 'a8', null),
      ('00000000-0000-4000-d000-000000001599', current_setting('test.board2'), 'Card Z', 'a0', null)
    ) as v (id, board_id, title, position, archived_at)
    join public.board_columns c on c.board_id = v.board_id::uuid and c.position = 'a0';
    insert into public.cards (id, board_id, column_id, title, position)
    select ('00000000-0000-4000-d000-0000000016' || lpad(i::text, 2, '0'))::uuid, c.board_id, c.id,
           'Blocker ' || i, 'b' || lpad(i::text, 2, '0')
    from generate_series(1, 20) i
    join public.board_columns c on c.board_id = current_setting('test.board1')::uuid and c.position = 'a0';
  $$,
  'owner sets up two boards, four members and the cards'
);

-- ---------------------------------------------------------------------------
-- Direct inserts: source is forced to manual, and never updatable
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id, source)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001504', '00000000-0000-4000-d000-000000001505', 'ai') $$,
  '42501', null,
  'owner cannot insert a dependency with source ai directly'
);
select results_eq(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001504', '00000000-0000-4000-d000-000000001505')
     returning source $$,
  $$ values ('manual'::text) $$,
  'a direct insert defaults to source manual (K blocks M)'
);
select lives_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id, source)
     values (current_setting('test.board1')::uuid,
             '00000000-0000-4000-d000-000000001502', '00000000-0000-4000-d000-000000001506', 'manual') $$,
  'a direct insert with an explicit source manual is allowed (B blocks N)'
);
select throws_ok(
  $$ update public.card_dependencies set source = 'ai'
     where blocker_card_id = '00000000-0000-4000-d000-000000001504' $$,
  '42501', null,
  'source cannot be updated'
);

-- ---------------------------------------------------------------------------
-- Editor accepts a proposal: rows in order, source = ai, created_by the editor
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001502", "role": "authenticated"}', true);

select results_eq(
  $$
    select board_id, blocker_card_id, blocked_card_id, source, created_by
    from public.accept_ai_dependencies(
      '00000000-0000-4000-d000-000000001501',
      array['00000000-0000-4000-d000-000000001502', '00000000-0000-4000-d000-000000001503']::uuid[]
    )
  $$,
  $$ values
       (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-000000001502'::uuid,
        '00000000-0000-4000-d000-000000001501'::uuid, 'ai'::text, '00000000-0000-4000-a000-000000001502'::uuid),
       (current_setting('test.board1')::uuid, '00000000-0000-4000-d000-000000001503'::uuid,
        '00000000-0000-4000-d000-000000001501'::uuid, 'ai'::text, '00000000-0000-4000-a000-000000001502'::uuid)
  $$,
  'editor accepts B and C as blockers of A: source ai, created_by the editor'
);
select results_eq(
  $$ select blocker_card_id, source from public.card_dependencies
     where blocked_card_id = '00000000-0000-4000-d000-000000001501' order by blocker_card_id $$,
  $$ values ('00000000-0000-4000-d000-000000001502'::uuid, 'ai'::text),
            ('00000000-0000-4000-d000-000000001503'::uuid, 'ai'::text) $$,
  'the accepted edges are stored'
);

-- ---------------------------------------------------------------------------
-- Demo (anonymous) editor can accept too (same as accept_ai_subtasks since ai_quotas)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000001505", "role": "authenticated", "is_anonymous": true}', true);
select results_eq(
  $$ select blocker_card_id, source, created_by from public.accept_ai_dependencies(
       '00000000-0000-4000-d000-000000001507', array['00000000-0000-4000-d000-000000001504']::uuid[]) $$,
  $$ values ('00000000-0000-4000-d000-000000001504'::uuid, 'ai'::text, '00000000-0000-4000-a000-000000001505'::uuid) $$,
  'an anonymous (demo) editor can accept AI dependencies (K blocks Q)'
);

-- ---------------------------------------------------------------------------
-- Denied: viewer, outsider, no session, anon role
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001503", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '42501', 'Card not found',
  'a viewer cannot accept AI dependencies'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001504", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '42501', 'Card not found',
  'an outsider cannot accept AI dependencies'
);

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '42501', 'You must be signed in to accept AI dependencies',
  'a call without a user (no sub) is rejected'
);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '42501', null,
  'anon has no EXECUTE grant on public.accept_ai_dependencies'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001501", "role": "authenticated"}', true);

select results_eq(
  $$ select count(*)::int from public.card_dependencies
     where blocked_card_id = '00000000-0000-4000-d000-000000001505' $$,
  $$ values (1) $$,
  'the denied calls left nothing behind (M still has only its manual blocker K)'
);

-- ---------------------------------------------------------------------------
-- Validation, as the owner (target card M unless stated otherwise)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000009999',
       array['00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '42501', 'Card not found',
  'a nonexistent card is rejected the same way as one the caller cannot see'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001508',
       array['00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '23514', 'Cannot add AI dependencies to an archived card',
  'an archived card is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505', array[]::uuid[]) $$,
  '23514', 'Between 1 and 10 blockers must be proposed',
  'zero blockers is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505', null) $$,
  '23514', 'Between 1 and 10 blockers must be proposed',
  'a null array is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       (select array_agg(('00000000-0000-4000-d000-0000000016' || lpad(i::text, 2, '0'))::uuid)
        from generate_series(1, 11) i)) $$,
  '23514', 'Between 1 and 10 blockers must be proposed',
  'eleven blockers is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array[['00000000-0000-4000-d000-000000001601'], ['00000000-0000-4000-d000-000000001602']]::uuid[]) $$,
  '23514', 'Between 1 and 10 blockers must be proposed',
  'a two-dimensional array is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', null]::uuid[]) $$,
  '23514', 'Blocker ids must not be null',
  'a null blocker id is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000001601']::uuid[]) $$,
  '23514', 'Blocker ids must not repeat',
  'a duplicated blocker id is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000001505']::uuid[]) $$,
  '23514', 'A card cannot block itself',
  'the card itself is rejected as a blocker'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000001599']::uuid[]) $$,
  '23514', 'Every blocker must be a card on the same board',
  'a card of another board is rejected (even for an owner of both boards)'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000009998']::uuid[]) $$,
  '23514', 'Every blocker must be a card on the same board',
  'a nonexistent blocker gets the same message as a card of another board'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000001508']::uuid[]) $$,
  '23514', 'An archived card cannot be proposed as a blocker',
  'an archived blocker is rejected'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001505',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000001504']::uuid[]) $$,
  '23514', 'A proposed blocker already blocks this card',
  'an existing blocker (K already blocks M) is rejected, not skipped'
);
select results_eq(
  $$ select count(*)::int from public.card_dependencies
     where blocked_card_id = '00000000-0000-4000-d000-000000001505' $$,
  $$ values (1) $$,
  'the rejected proposals left nothing behind (P01 was valid in each, but was not saved)'
);

-- ---------------------------------------------------------------------------
-- Trigger errors propagate and roll the whole proposal back
-- ---------------------------------------------------------------------------

-- B blocks A (ai, above). Proposing P01 and A as blockers of B: P01 -> B is fine, A -> B
-- closes the cycle A -> B -> A.
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001502',
       array['00000000-0000-4000-d000-000000001601', '00000000-0000-4000-d000-000000001501']::uuid[]) $$,
  'DEP01', 'dependency would create a cycle',
  'a proposal that closes a cycle is rejected by the trigger (DEP01)'
);
select is_empty(
  $$ select 1 from public.card_dependencies where blocked_card_id = '00000000-0000-4000-d000-000000001502' $$,
  'the cyclic proposal left nothing behind (not even the valid P01 -> B)'
);

-- T gets 18 manual blockers directly, then a 3-item proposal would make 21.
select lives_ok(
  $$ insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id)
     select current_setting('test.board1')::uuid,
            ('00000000-0000-4000-d000-0000000016' || lpad(i::text, 2, '0'))::uuid,
            '00000000-0000-4000-d000-000000001509'
     from generate_series(1, 18) i $$,
  'T gets 18 manual blockers'
);
select throws_ok(
  $$ select public.accept_ai_dependencies('00000000-0000-4000-d000-000000001509',
       array['00000000-0000-4000-d000-000000001619', '00000000-0000-4000-d000-000000001620',
             '00000000-0000-4000-d000-000000001504']::uuid[]) $$,
  'DEP02', 'A card can have at most 20 blockers',
  'a proposal that would give T a 21st blocker is rejected by the trigger (DEP02)'
);
select results_eq(
  $$ select count(*)::int, count(*) filter (where source = 'ai')::int from public.card_dependencies
     where blocked_card_id = '00000000-0000-4000-d000-000000001509' $$,
  $$ values (18, 0) $$,
  'the over-cap proposal left nothing behind (the first two rows were rolled back too)'
);
select results_eq(
  $$ select count(*)::int from public.accept_ai_dependencies('00000000-0000-4000-d000-000000001509',
       array['00000000-0000-4000-d000-000000001619', '00000000-0000-4000-d000-000000001620']::uuid[]) $$,
  $$ values (2) $$,
  'a proposal that brings T to exactly 20 blockers is accepted'
);

-- ---------------------------------------------------------------------------
-- Members read ai edges like any other
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001503", "role": "authenticated"}', true);
select results_eq(
  $$ select count(*)::int from public.card_dependencies
     where board_id = current_setting('test.board1')::uuid and source = 'ai' $$,
  $$ values (5) $$,
  'a viewer reads the ai edges of the board'
);

select * from finish();
rollback;
