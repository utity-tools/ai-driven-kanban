-- AI usage observability (v0.4): see
-- supabase/migrations/20260930145201_ai_usage_observability.sql.
-- public.reserve_ai_decomposition(p_feature) stores the feature and returns usage_id (the
-- old no-argument call keeps working); public.record_ai_usage completes one of the
-- caller's own open rows (AIU01 otherwise); the global cap counts least(real cost,
-- estimate) per row, so a reported cost can only lower a row's charge, never raise it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- The cap checks below were sized for these limits; pin them so tuning the hosted values (a
-- migration, see 20261007154701_launch_ai_cost_limits.sql) does not change what they prove.
-- Rolled back with the rest of the test.
update private.ai_limits set global_daily_cost_usd = 0.25, cost_per_call_usd = 0.006 where id;

-- ---------------------------------------------------------------------------
-- Shape: columns, functions, privileges
-- ---------------------------------------------------------------------------

select ok(
  (select count(*) = 9 from information_schema.columns
   where table_schema = 'private' and table_name = 'ai_usage'
     and is_nullable = 'YES'
     and column_name in ('feature', 'prompt_version', 'model', 'input_tokens', 'output_tokens',
                         'actual_cost_usd', 'latency_ms', 'outcome', 'completed_at')),
  'private.ai_usage has the 9 new nullable observability columns'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'private.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)'::regprocedure),
  'private.record_ai_usage is security definer with empty search_path'
);
select ok(
  not has_function_privilege('public', 'private.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)', 'EXECUTE'),
  'private.record_ai_usage is not executable by public, anon or authenticated'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)'::regprocedure),
  'public.record_ai_usage is security definer with empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)', 'EXECUTE')
  and not has_function_privilege('public', 'public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)', 'EXECUTE'),
  'public.record_ai_usage is executable by authenticated only'
);
select ok(
  (select count(*) = 1 from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_ai_decomposition'),
  'exactly one public.reserve_ai_decomposition exists (no overload ambiguity for PostgREST)'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- usera: reserves and records their own calls.
-- userb: tries to record usera's calls.
-- userc: fresh user, used for the global cap checks.
-- other: usage only inserted directly, to preload the shared daily budget.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000003001', 'usera-16@test.local'),
  ('00000000-0000-4000-a000-000000003002', 'userb-16@test.local'),
  ('00000000-0000-4000-a000-000000003003', 'userc-16@test.local'),
  ('00000000-0000-4000-a000-000000003004', 'other-16@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000003001", "role": "authenticated"}', true);

-- ---------------------------------------------------------------------------
-- reserve_ai_decomposition: feature and usage_id
-- ---------------------------------------------------------------------------

select is(
  (select set_config('test.usage_dep', usage_id::text, true) is not null
   from public.reserve_ai_decomposition('dependencies')),
  true,
  'reserve_ai_decomposition(''dependencies'') returns a usage_id'
);

-- Old call shape (the app deployed before this migration): no argument, extra column ignored.
select results_eq(
  $$
    select remaining, daily_limit, set_config('test.usage_old', usage_id::text, true) is not null
    from public.reserve_ai_decomposition()
  $$,
  $$ values (18, 20, true) $$,
  'the old no-argument call still works and counts against the same daily quota'
);

select throws_ok(
  $$ select public.reserve_ai_decomposition('summarize') $$,
  '22023', 'Unknown AI feature: summarize',
  'an unknown feature is rejected with 22023'
);
select throws_ok(
  $$ select public.reserve_ai_decomposition(null) $$,
  '22023', 'Unknown AI feature: null',
  'a null feature is rejected with 22023'
);

reset role;

select results_eq(
  $$
    select feature, completed_at is null, outcome is null
    from private.ai_usage
    where id in (current_setting('test.usage_dep')::uuid, current_setting('test.usage_old')::uuid)
    order by feature
  $$,
  $$ values ('decompose'::text, true, true), ('dependencies'::text, true, true) $$,
  'the reserved rows store their feature (old call shape defaults to decompose) and are open'
);
select is(
  (select count(*)::integer from private.ai_usage
   where user_id = '00000000-0000-4000-a000-000000003001'),
  2,
  'rejected feature values did not insert any usage row'
);

-- ---------------------------------------------------------------------------
-- record_ai_usage: who can and cannot complete a row
-- ---------------------------------------------------------------------------

-- No session at all.
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_dep')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  '42501', 'You must be signed in to record AI usage',
  'a session with no sub (no auth.uid()) cannot record usage'
);

-- The anon role has no EXECUTE grant.
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_dep')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  '42501', null,
  'anon has no EXECUTE grant on public.record_ai_usage'
);
reset role;
set local role authenticated;

-- Another user cannot complete usera's row, and gets the same code as for a missing id.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000003002", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_dep')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  'AIU01', null,
  'userb cannot record usage on usera''s row (AIU01)'
);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => gen_random_uuid(), p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  'AIU01', null,
  'an unknown usage id raises the same AIU01'
);

-- usera completes their own row.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000003001", "role": "authenticated"}', true);
select lives_ok(
  $$
    select public.record_ai_usage(
      p_usage_id => current_setting('test.usage_dep')::uuid,
      p_outcome => 'ok',
      p_latency_ms => 1834,
      p_prompt_version => 'dependencies-v1',
      p_model => 'anthropic/claude-haiku-4.5',
      p_input_tokens => 812,
      p_output_tokens => 240,
      p_actual_cost_usd => 0.002012)
  $$,
  'usera records the outcome of their own open row'
);

reset role;
select results_eq(
  $$
    select prompt_version, model, input_tokens, output_tokens, actual_cost_usd, latency_ms,
           outcome, completed_at is not null
    from private.ai_usage where id = current_setting('test.usage_dep')::uuid
  $$,
  $$ values ('dependencies-v1'::text, 'anthropic/claude-haiku-4.5'::text, 812, 240,
             0.002012::numeric(10, 6), 1834, 'ok'::text, true) $$,
  'the recorded values and completed_at are stored on the row'
);
set local role authenticated;

select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_dep')::uuid, p_outcome => 'error', p_latency_ms => 1, p_prompt_version => 'v2', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0) $$,
  'AIU01', null,
  'a second record on the same row is rejected (AIU01): completion is write-once'
);

-- ---------------------------------------------------------------------------
-- record_ai_usage: value validation (column checks) on usera's still-open row
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_old')::uuid, p_outcome => 'great', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  '23514', null,
  'an unknown outcome is rejected (check violation)'
);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_old')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => -1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  '23514', null,
  'negative input tokens are rejected (check violation)'
);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_old')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => -0.001) $$,
  '23514', null,
  'a negative cost is rejected (check violation)'
);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_old')::uuid, p_outcome => null, p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  '23514', null,
  'a null outcome is rejected (completed_at and outcome must be set together)'
);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_old')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => repeat('v', 65), p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  '23514', null,
  'a prompt_version longer than 64 characters is rejected (check violation)'
);
select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_old')::uuid, p_outcome => 'ok', p_actual_cost_usd => 1.5) $$,
  '23514', null,
  'a cost above the 1 USD sanity bound is rejected (check violation)'
);
select lives_ok(
  $$ select public.record_ai_usage(current_setting('test.usage_old')::uuid, 'error') $$,
  'only usage id and outcome are required: everything the provider may not report defaults to null'
);

-- ---------------------------------------------------------------------------
-- record_ai_usage: rows outside the completion window
-- ---------------------------------------------------------------------------

reset role;
with r as (
  insert into private.ai_usage (user_id, is_demo, estimated_cost_usd, feature, created_at)
  values ('00000000-0000-4000-a000-000000003001', false, 0.006, 'decompose', now() - interval '61 minutes')
  returning id
)
select set_config('test.usage_stale', r.id::text, true) from r;
set local role authenticated;

select throws_ok(
  $$ select public.record_ai_usage(p_usage_id => current_setting('test.usage_stale')::uuid, p_outcome => 'ok', p_latency_ms => 10, p_prompt_version => 'v1', p_model => 'm', p_input_tokens => 1, p_output_tokens => 1, p_actual_cost_usd => 0.001) $$,
  'AIU01', null,
  'usera cannot complete their own row reserved more than an hour ago (AIU01)'
);

-- ---------------------------------------------------------------------------
-- Global daily cost cap: counts actual_cost_usd when present, the estimate otherwise
-- ---------------------------------------------------------------------------

reset role;
-- 50 completed rows: estimates would be 50 * 0.006 = 0.30 (over the 0.25 cap), but their
-- real cost is 50 * 0.001 = 0.05.
insert into private.ai_usage
  (user_id, is_demo, estimated_cost_usd, feature, actual_cost_usd, outcome, completed_at)
select '00000000-0000-4000-a000-000000003004', false, 0.006, 'decompose', 0.001, 'ok', now()
from generate_series(1, 50);
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000003003", "role": "authenticated"}', true);
select results_eq(
  $$ select remaining, daily_limit from public.reserve_ai_decomposition('decompose') $$,
  $$ values (19, 20) $$,
  'userc can reserve: the real cost of completed rows is under the cap even though their estimates are not'
);

-- Control: the same rows without a recorded cost fall back to their estimate and exhaust the cap.
reset role;
update private.ai_usage set actual_cost_usd = null
where user_id = '00000000-0000-4000-a000-000000003004';
set local role authenticated;

select throws_ok(
  $$ select public.reserve_ai_decomposition('decompose') $$,
  'AIQ02', null,
  'rows with no recorded cost still count their worst-case estimate against the cap'
);

-- An over-reported cost never raises a row's charge above its estimate (a user completing
-- their own directly-reserved rows with a huge cost cannot exhaust the shared budget).
-- 30 rows reporting the maximum 1 USD would be 30 USD raw, but count 30 * 0.006 = 0.18.
reset role;
delete from private.ai_usage where user_id = '00000000-0000-4000-a000-000000003004';
insert into private.ai_usage
  (user_id, is_demo, estimated_cost_usd, feature, actual_cost_usd, outcome, completed_at)
select '00000000-0000-4000-a000-000000003004', false, 0.006, 'decompose', 1, 'ok', now()
from generate_series(1, 30);
set local role authenticated;

select results_eq(
  $$ select remaining, daily_limit from public.reserve_ai_decomposition('dependencies') $$,
  $$ values (18, 20) $$,
  'rows reporting a cost above their estimate are charged only the estimate: userc can still reserve'
);

-- A reservation is charged its estimate until it is completed.
reset role;
select is(
  (select min(estimated_cost_usd) from private.ai_usage
   where user_id = '00000000-0000-4000-a000-000000003003'),
  0.006::numeric(10, 6),
  'a new reservation stores the worst-case estimate (counted until its real cost is recorded)'
);

-- The drop + recreate must keep the serialising lock of 20260928152546 (a lost lock would let
-- concurrent reservations race past both limits without any functional test noticing).
select ok(
  (select prosrc like '%pg_advisory_xact_lock(84200001)%'
     from pg_proc where oid = 'private.reserve_ai_decomposition(text)'::regprocedure),
  'private.reserve_ai_decomposition still takes the advisory lock'
);

select * from finish();
rollback;
