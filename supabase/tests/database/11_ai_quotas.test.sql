-- Per-user daily AI quotas and the global daily cost cap (v0.2 delivery 5): see
-- supabase/migrations/20260928152546_ai_quotas.sql. public.reserve_ai_decomposition()
-- charges one call against the caller's daily limit (demo_daily_calls / user_daily_calls)
-- and the shared global_daily_cost_usd budget, raising SQLSTATE 'AIQ01' (own quota) or
-- 'AIQ02' (shared budget), before any row can be inserted.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Shape: tables, RLS, privileges
-- ---------------------------------------------------------------------------

select has_table('private', 'ai_limits', 'private.ai_limits exists');
select has_table('private', 'ai_usage', 'private.ai_usage exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'private.ai_limits'::regclass),
  'row level security is enabled on private.ai_limits'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.ai_usage'::regclass),
  'row level security is enabled on private.ai_usage'
);

select ok(
  not has_table_privilege('anon', 'private.ai_limits', 'SELECT')
  and not has_table_privilege('authenticated', 'private.ai_limits', 'SELECT'),
  'neither anon nor authenticated can select private.ai_limits (no policies, no grants)'
);
select ok(
  not has_table_privilege('anon', 'private.ai_usage', 'SELECT')
  and not has_table_privilege('authenticated', 'private.ai_usage', 'SELECT'),
  'neither anon nor authenticated can select private.ai_usage (no policies, no grants)'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.reserve_ai_decomposition(text)'::regprocedure),
  'private.reserve_ai_decomposition is security definer with empty search_path'
);
select ok(
  not has_function_privilege('public', 'private.reserve_ai_decomposition(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.reserve_ai_decomposition(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.reserve_ai_decomposition(text)', 'EXECUTE'),
  'private.reserve_ai_decomposition is not executable by public, anon or authenticated'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.reserve_ai_decomposition(text)'::regprocedure),
  'public.reserve_ai_decomposition is security definer with empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.reserve_ai_decomposition(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reserve_ai_decomposition(text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.reserve_ai_decomposition(text)', 'EXECUTE'),
  'public.reserve_ai_decomposition is executable by authenticated only'
);

-- The migration seeds exactly one configuration row with the documented defaults.
select results_eq(
  $$
    select demo_daily_calls, user_daily_calls, global_daily_cost_usd, cost_per_call_usd
    from private.ai_limits
  $$,
  $$ values (3, 20, 0.40::numeric(10, 4), 0.02::numeric(10, 6)) $$,
  'private.ai_limits has exactly one row with the documented defaults'
);

-- Fresh databases get the same values as the hosted ones (20261007154701).
select col_default_is('private', 'ai_limits', 'global_daily_cost_usd', '0.40',
  'private.ai_limits.global_daily_cost_usd defaults to 0.40');
select col_default_is('private', 'ai_limits', 'cost_per_call_usd', '0.02',
  'private.ai_limits.cost_per_call_usd defaults to 0.02');

-- The checks below were sized for these limits; pin them so tuning the hosted values (a
-- migration, see 20261007154701_launch_ai_cost_limits.sql) does not change what they prove.
-- Rolled back with the rest of the test.
update private.ai_limits set global_daily_cost_usd = 0.25, cost_per_call_usd = 0.006 where id;

-- ---------------------------------------------------------------------------
-- Fixtures
-- real1: a permanent user who will exhaust their own daily limit (20).
-- demo1: an anonymous (demo) user who will exhaust their own daily limit (3).
-- real3: a permanent user with 25 usage rows dated yesterday (over the daily limit), used
--        to prove yesterday's rows do not count towards today's quota.
-- real4: a fresh permanent user, used to hit the global cap without ever touching their
--        own per-user limit.
-- other1: a permanent user whose usage is only ever inserted directly (never through the
--         RPC), to preload the shared daily budget close to the cap.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000002001', 'real1-11@test.local'),
  ('00000000-0000-4000-a000-000000002003', 'real3-11@test.local'),
  ('00000000-0000-4000-a000-000000002004', 'real4-11@test.local'),
  ('00000000-0000-4000-a000-000000002005', 'other1-11@test.local');
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-a000-000000002002', true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Unauthenticated and anon-role calls are rejected before anything else
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.reserve_ai_decomposition() $$,
  '42501', 'You must be signed in to use AI decomposition',
  'a session with no sub (no auth.uid()) cannot reserve a call'
);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$ select public.reserve_ai_decomposition() $$,
  '42501', null,
  'anon has no EXECUTE grant on public.reserve_ai_decomposition'
);
reset role;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- real1: 20 successful reservations, the 21st is rejected (AIQ01)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000002001", "role": "authenticated"}', true);

select results_eq(
  $$
    select remaining, daily_limit,
           resets_at = date_trunc('day', now() at time zone 'utc') at time zone 'utc' + interval '1 day'
    from public.reserve_ai_decomposition()
  $$,
  $$ values (19, 20, true) $$,
  'real1''s first reservation leaves 19 of 20, and resets_at is the next UTC midnight'
);

select lives_ok(
  $$ do $body$ begin for i in 1 .. 18 loop perform public.reserve_ai_decomposition(); end loop; end $body$; $$,
  'real1 reserves 18 more calls (2 through 19) without hitting the limit'
);

select results_eq(
  $$ select remaining, daily_limit from public.reserve_ai_decomposition() $$,
  $$ values (0, 20) $$,
  'real1''s 20th (last allowed) reservation leaves 0 remaining'
);

select throws_ok(
  $$ select public.reserve_ai_decomposition() $$,
  'AIQ01', null,
  'real1''s 21st reservation today is rejected: daily limit reached'
);

-- ---------------------------------------------------------------------------
-- demo1: 3 successful reservations, the 4th is rejected (AIQ01), same as any user but
-- with the smaller demo_daily_calls limit
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000002002", "role": "authenticated", "is_anonymous": true}', true);

select results_eq(
  $$ select remaining, daily_limit from public.reserve_ai_decomposition() $$,
  $$ values (2, 3) $$,
  'demo1''s first reservation leaves 2 of 3'
);
select lives_ok(
  $$ select public.reserve_ai_decomposition() $$,
  'demo1 reserves a second call'
);
select results_eq(
  $$ select remaining, daily_limit from public.reserve_ai_decomposition() $$,
  $$ values (0, 3) $$,
  'demo1''s third (last allowed) reservation leaves 0 remaining'
);
select throws_ok(
  $$ select public.reserve_ai_decomposition() $$,
  'AIQ01', null,
  'demo1''s fourth reservation today is rejected: daily limit reached'
);

-- ---------------------------------------------------------------------------
-- Rows from a previous UTC day do not count towards today's quota or budget
-- ---------------------------------------------------------------------------

reset role;

select lives_ok(
  $$
    insert into private.ai_usage (user_id, is_demo, estimated_cost_usd, created_at)
    select '00000000-0000-4000-a000-000000002003', false, 0.006, now() - interval '1 day'
    from generate_series(1, 25)
  $$,
  'real3 is preloaded with 25 usage rows dated yesterday (over the 20-call daily limit)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000002003", "role": "authenticated"}', true);

select results_eq(
  $$ select remaining, daily_limit from public.reserve_ai_decomposition() $$,
  $$ values (19, 20) $$,
  'real3''s reservation succeeds today: yesterday''s 25 rows do not count'
);

-- ---------------------------------------------------------------------------
-- Global daily cost cap: preloaded usage from another user pushes today's total over the
-- cap, so a fresh user with plenty of quota left is still rejected (AIQ02)
-- ---------------------------------------------------------------------------

reset role;

select lives_ok(
  $$
    insert into private.ai_usage (user_id, is_demo, estimated_cost_usd, created_at)
    select '00000000-0000-4000-a000-000000002005', false, 0.0055, now()
    from generate_series(1, 20)
  $$,
  'other1 is preloaded with 20 usage rows dated today, pushing the global total near the cap'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000002004", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.reserve_ai_decomposition() $$,
  'AIQ02', null,
  'real4, with no calls of their own today, is still rejected once the shared daily budget is exhausted'
);

-- The per-user check runs first: real1 (already at their own limit) gets AIQ01, not AIQ02,
-- even though the global cap is also exhausted at this point.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000002001", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.reserve_ai_decomposition() $$,
  'AIQ01', null,
  'real1 still gets their own quota error first, even though the global cap is also exceeded'
);

select * from finish();
rollback;
