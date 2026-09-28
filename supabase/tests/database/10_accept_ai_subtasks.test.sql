-- Accepting an AI subtask proposal (v0.2 delivery 4): public.accept_ai_subtasks() writes
-- source = 'ai' subtasks on behalf of a reviewing owner/editor, bypassing the card_subtasks
-- INSERT policy that otherwise forces source = 'manual'. See
-- supabase/migrations/20260928143151_accept_ai_subtasks.sql.
-- O = owner, E = editor, V = viewer, X = outsider, D = anonymous (demo) user.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Shape: security definer, empty search_path, privileges
-- ---------------------------------------------------------------------------

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.accept_ai_subtasks(uuid, jsonb)'::regprocedure),
  'private.accept_ai_subtasks is security definer with empty search_path'
);
select ok(
  not has_function_privilege('public', 'private.accept_ai_subtasks(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.accept_ai_subtasks(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.accept_ai_subtasks(uuid, jsonb)', 'EXECUTE'),
  'private.accept_ai_subtasks is not executable by public, anon or authenticated'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.accept_ai_subtasks(uuid, jsonb)'::regprocedure),
  'public.accept_ai_subtasks is security definer with empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_ai_subtasks(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.accept_ai_subtasks(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('public', 'public.accept_ai_subtasks(uuid, jsonb)', 'EXECUTE'),
  'public.accept_ai_subtasks is executable by authenticated only'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- Board 1 (O owns; E editor, V viewer) has cards A (active) and Arch (archived).
-- Board 2 (O only) has card B. D is an anonymous editor of board 1.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000001001', 'o10@test.local'),
  ('00000000-0000-4000-a000-000000001002', 'e10@test.local'),
  ('00000000-0000-4000-a000-000000001003', 'v10@test.local'),
  ('00000000-0000-4000-a000-000000001004', 'x10@test.local');
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-a000-000000001005', true);

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001001", "role": "authenticated"}', true);

select set_config('test.board1', public.create_board('AI subtasks')::text, true);
select set_config('test.board2', public.create_board('Other')::text, true);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001002', 'editor'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001003', 'viewer'),
      (current_setting('test.board1')::uuid, '00000000-0000-4000-a000-000000001005', 'editor');
    insert into public.cards (id, board_id, column_id, title, position, archived_at)
    select v.id::uuid, c.board_id, c.id, v.title, v.position, v.archived_at::timestamptz
    from (values
      ('00000000-0000-4000-d000-000000001010', current_setting('test.board1'), 'Card A', 'a0', null),
      ('00000000-0000-4000-d000-000000001011', current_setting('test.board1'), 'Card Arch', 'a1', now()::text),
      ('00000000-0000-4000-d000-000000001012', current_setting('test.board2'), 'Card B', 'a0', null)
    ) as v (id, board_id, title, position, archived_at)
    join public.board_columns c on c.board_id = v.board_id::uuid and c.position = 'a0';
    -- A baseline manual subtask, so acceptance must append after it.
    insert into public.card_subtasks (id, board_id, card_id, title, position) values
      ('00000000-0000-4000-f000-000000001001', current_setting('test.board1')::uuid,
       '00000000-0000-4000-d000-000000001010', 'Existing manual subtask', 'a0');
  $$,
  'owner sets up two boards, four members, three cards and one manual subtask'
);

-- ---------------------------------------------------------------------------
-- Editor accepts a proposal: rows are appended, in order, source = ai
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001002", "role": "authenticated"}', true);

select results_eq(
  $$
    select title, estimate, source, created_by
    from public.accept_ai_subtasks(
      '00000000-0000-4000-d000-000000001010',
      '[{"title": "Write the failing test", "estimate": 3}, {"title": "  Make it pass  ", "estimate": null}]'::jsonb
    )
    order by position
  $$,
  $$ values
       ('Write the failing test'::text, 3::smallint, 'ai'::text, '00000000-0000-4000-a000-000000001002'::uuid),
       ('Make it pass'::text, null::smallint, 'ai'::text, '00000000-0000-4000-a000-000000001002'::uuid)
  $$,
  'editor accepts a two-item proposal: titles trimmed, estimates kept, source ai, created_by the editor'
);

select results_eq(
  $$ select title from public.card_subtasks where card_id = '00000000-0000-4000-d000-000000001010' order by position $$,
  $$ values ('Existing manual subtask'::text), ('Write the failing test'::text), ('Make it pass'::text) $$,
  'the accepted subtasks are appended after the existing one, in proposal order'
);

-- ---------------------------------------------------------------------------
-- Owner accepts too, after the editor's rows
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001001", "role": "authenticated"}', true);

select results_eq(
  $$
    select title, source from public.accept_ai_subtasks(
      '00000000-0000-4000-d000-000000001010', '[{"title": "One more", "estimate": 1}]'::jsonb
    )
  $$,
  $$ values ('One more'::text, 'ai'::text) $$,
  'owner also accepts a proposal on the same card'
);
select results_eq(
  $$ select count(*)::int from public.card_subtasks
     where card_id = '00000000-0000-4000-d000-000000001010' and position > (
       select max(position) from public.card_subtasks
       where card_id = '00000000-0000-4000-d000-000000001010' and title = 'Make it pass'
     ) $$,
  $$ values (1) $$,
  'the owner''s subtask sorts after the editor''s'
);

-- ---------------------------------------------------------------------------
-- Denied: viewer, outsider, anonymous editor
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001003", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "Nope", "estimate": null}]'::jsonb) $$,
  '42501', 'Card not found',
  'a viewer cannot accept AI subtasks'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001004", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "Nope", "estimate": null}]'::jsonb) $$,
  '42501', 'Card not found',
  'an outsider cannot accept AI subtasks'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000001005", "role": "authenticated", "is_anonymous": true}', true);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "Nope", "estimate": null}]'::jsonb) $$,
  '42501', 'You must be signed in with a permanent account to accept AI subtasks',
  'an anonymous (demo) editor cannot accept AI subtasks, even as a board editor'
);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "Nope", "estimate": null}]'::jsonb) $$,
  '42501', null,
  'anon has no EXECUTE grant on public.accept_ai_subtasks'
);
reset role;

-- ---------------------------------------------------------------------------
-- Validation, as the owner
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000001001", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[]'::jsonb) $$,
  '23514', 'Between 1 and 8 subtasks must be proposed',
  'zero subtasks is rejected'
);
select throws_ok(
  $$ select public.accept_ai_subtasks(
       '00000000-0000-4000-d000-000000001010',
       (select jsonb_agg(jsonb_build_object('title', 'Subtask ' || i, 'estimate', null))
        from generate_series(1, 9) i)
     ) $$,
  '23514', 'Between 1 and 8 subtasks must be proposed',
  'nine subtasks is rejected'
);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "   ", "estimate": null}]'::jsonb) $$,
  '23514', 'title must be between 1 and 200 characters (after trimming)',
  'a blank title is rejected'
);
select throws_ok(
  $$ select public.accept_ai_subtasks(
       '00000000-0000-4000-d000-000000001010',
       jsonb_build_array(jsonb_build_object('title', repeat('x', 201), 'estimate', null))
     ) $$,
  '23514', 'title must be between 1 and 200 characters (after trimming)',
  'a 201-character title is rejected'
);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "Bad estimate", "estimate": 4}]'::jsonb) $$,
  '23514', 'estimate must be null or one of 1, 2, 3, 5, 8, 13',
  'a non-Fibonacci estimate (4) is rejected'
);
select throws_ok(
  $$ select public.accept_ai_subtasks(
       '00000000-0000-4000-d000-000000001010',
       '[{"title": "Extra key", "estimate": null, "dueOn": "2026-10-01"}]'::jsonb
     ) $$,
  '23514', 'Each subtask must have exactly the keys title and estimate',
  'an extra key is rejected'
);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "No estimate key"}]'::jsonb) $$,
  '23514', 'Each subtask must have exactly the keys title and estimate',
  'a missing estimate key is rejected'
);

-- Atomicity: the first item is valid, the second is not; nothing is inserted.
select throws_ok(
  $$ select public.accept_ai_subtasks(
       '00000000-0000-4000-d000-000000001010',
       '[{"title": "Valid", "estimate": 1}, {"title": "Bad", "estimate": 4}]'::jsonb
     ) $$,
  '23514', 'estimate must be null or one of 1, 2, 3, 5, 8, 13',
  'a proposal with one bad item throws'
);
select results_eq(
  $$ select count(*)::int from public.card_subtasks where card_id = '00000000-0000-4000-d000-000000001010' $$,
  $$ values (4) $$,
  'the rejected proposal left no rows behind (still 1 manual + 3 ai from before)'
);

-- Integral JSON numbers written with a fraction (1.0) are valid estimates; real fractions are not.
select results_eq(
  $$ select title, estimate from public.accept_ai_subtasks(
       '00000000-0000-4000-d000-000000001010', '[{"title": "x", "estimate": 1.0}]'::jsonb
     ) $$,
  $$ values ('x'::text, 1::smallint) $$,
  'an estimate of 1.0 is accepted and stored as 1'
);
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001010', '[{"title": "Fraction", "estimate": 2.5}]'::jsonb) $$,
  '23514', 'estimate must be null or one of 1, 2, 3, 5, 8, 13',
  'a fractional estimate (2.5) is rejected'
);

-- Archived card.
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000001011', '[{"title": "On an archived card", "estimate": null}]'::jsonb) $$,
  '23514', 'Cannot add AI subtasks to an archived card',
  'an archived card is rejected'
);

-- A card on a board the caller does not own at all (not just wrong role): still "not found".
select throws_ok(
  $$ select public.accept_ai_subtasks('00000000-0000-4000-d000-000000009999', '[{"title": "Nope", "estimate": null}]'::jsonb) $$,
  '42501', 'Card not found',
  'a nonexistent card is rejected the same way as one the caller cannot see'
);

select * from finish();
rollback;
