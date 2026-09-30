-- v0.4: AI usage observability. Record the real outcome of every reserved AI call (tokens,
-- cost, latency, model, prompt version, outcome) and let the global daily cost cap use the
-- real cost once it is known.
--
-- private.ai_usage gains nullable columns (existing rows stay valid, they simply have no
-- outcome). `feature` is written at reservation time; everything else is written once, by
-- public.record_ai_usage, when the call finishes. `completed_at` and `outcome` are set
-- together (checked), so "completed" is unambiguous.
--
-- public/private.reserve_ai_decomposition(p_feature text default 'decompose'):
--   * new `p_feature` argument, one of 'decompose' | 'dependencies'; anything else (or null)
--     raises 22023 (invalid_parameter_value) before the advisory lock is taken.
--   * returns `usage_id` in addition to (remaining, daily_limit, resets_at): the id of the
--     row it just inserted, to be passed to record_ai_usage.
--   * the global cap now sums least(coalesce(actual_cost_usd, estimated_cost_usd),
--     estimated_cost_usd): a reservation is charged the worst-case estimate until its real
--     cost is recorded; a recorded cost can then only LOWER that row's charge, never raise
--     it (see "Trust model" below). The advisory lock and AIQ01/AIQ02 semantics are
--     unchanged.
--   Changing the argument list and the return type requires drop + create (create or
--   replace cannot change either). Grants are re-applied exactly as in
--   20260928152546_ai_quotas.sql.
--
-- Rollout compatibility: Deploy production runs migrations BEFORE the Vercel deploy, so for
-- a short window the currently deployed app calls the NEW function with the OLD call shape
-- (`.rpc("reserve_ai_decomposition")`, no arguments, reading only `remaining`). That keeps
-- working because:
--   * p_feature defaults to 'decompose' -> PostgREST resolves a no-argument call to it
--     (only one function with that name exists, so there is no overload ambiguity);
--   * the return type is a superset: old code ignores the extra `usage_id` column.
--   Old-app calls during the window are therefore attributed to 'decompose' even when they
--   come from the dependencies route, and are never completed (outcome stays null); both
--   are acceptable for a window of minutes. The default can be dropped by a later migration
--   once every caller passes p_feature explicitly.
--
-- public/private.record_ai_usage(p_usage_id, p_outcome, p_latency_ms default null,
-- p_prompt_version default null, p_model default null, p_input_tokens default null,
-- p_output_tokens default null, p_actual_cost_usd default null): completes one usage row.
-- Required arguments come first so everything the provider may not report can default to
-- null (and is optional in the generated TypeScript types). SECURITY DEFINER (in
-- private, with a thin public wrapper, same pattern as reserve_ai_decomposition) because no
-- API role has any privilege on private.ai_usage. Requires a signed-in caller (42501). Only
-- updates a row that belongs to the caller, is not completed yet, and was reserved within
-- the last hour (the completion window, a constant in the function body: comfortably
-- longer than any serverless function's max duration, short enough that stale ids cannot be
-- replayed later). Every other case -- unknown id, another user's id, already completed,
-- too old -- raises the same SQLSTATE 'AIU01' on purpose, so the RPC cannot be used to
-- probe whether some id exists or belongs to someone else. Values are validated by the
-- column checks (23514 on violation); tokens/cost/model/prompt_version/latency may be null
-- when not reported, outcome may not (the completed_at/outcome pair check).
--
-- Trust model: record_ai_usage is callable by any signed-in user through the API, and a
-- user can reserve directly (burning their own quota) and so learn a usage_id of their
-- own. The values they report are therefore untrusted:
--   * a reported cost can only LOWER the global-cap charge of the caller's own row, never
--     raise it above the reservation estimate. Without the least(...) a user could record
--     a huge actual_cost_usd on a few rows and exhaust the shared budget (AIQ02) for
--     everyone. Under-reporting is harmless: rows reserved directly (outside the app) had
--     no model call and no real spend, and usage_ids of real app calls never leave the
--     server.
--   * actual_cost_usd is additionally bounded to <= 1 USD per call as a sanity check.
--   * the value is stored as reported, for observability, even when above the estimate.
--   * per-user call counts (AIQ01) do not depend on reported values at all.
-- Consequence: a real cost above the estimate is undercounted by the cap, by design. The
-- estimate (private.ai_limits.cost_per_call_usd) must stay >= the real worst case and is
-- raised by a migration when it isn't. Completion values are caller-reported, so that check
-- uses the AI Gateway's own billing, with actual_cost_usd only as a hint (docs/observability.md).

-- ---------------------------------------------------------------------------
-- private.ai_usage: outcome columns
-- ---------------------------------------------------------------------------

alter table private.ai_usage
  add column feature text
    constraint ai_usage_feature_known check (feature in ('decompose', 'dependencies')),
  add column prompt_version text
    constraint ai_usage_prompt_version_length check (char_length(prompt_version) between 1 and 64),
  add column model text
    constraint ai_usage_model_length check (char_length(model) between 1 and 128),
  add column input_tokens integer
    constraint ai_usage_input_tokens_non_negative check (input_tokens >= 0),
  add column output_tokens integer
    constraint ai_usage_output_tokens_non_negative check (output_tokens >= 0),
  add column actual_cost_usd numeric(10, 6)
    constraint ai_usage_actual_cost_range check (actual_cost_usd >= 0 and actual_cost_usd <= 1),
  add column latency_ms integer
    constraint ai_usage_latency_non_negative check (latency_ms >= 0),
  add column outcome text
    constraint ai_usage_outcome_known check (outcome in ('ok', 'empty', 'invalid', 'error', 'aborted')),
  add column completed_at timestamptz,
  add constraint ai_usage_completed_with_outcome
    check ((completed_at is null) = (outcome is null));

comment on column private.ai_usage.feature is
  'Which AI feature reserved the call: decompose (subtasks) or dependencies. Set at '
  'reservation time. Null only for rows reserved before 20260930145201_ai_usage_observability.';
comment on column private.ai_usage.prompt_version is
  'Version id of the prompt used (src/lib/ai/), as reported on completion. Null if not completed.';
comment on column private.ai_usage.model is
  'Model id that served the call, as reported on completion. Null if unknown or not completed.';
comment on column private.ai_usage.input_tokens is
  'Input (prompt) tokens reported by the provider. Null if not reported or not completed.';
comment on column private.ai_usage.output_tokens is
  'Output (completion) tokens reported by the provider. Null if not reported or not completed.';
comment on column private.ai_usage.actual_cost_usd is
  'Real cost in USD reported on completion (0..1, stored as reported). The global daily cap '
  'counts least(actual_cost_usd, estimated_cost_usd): a reported cost can only lower a '
  'row''s charge. Null if not reported or not completed.';
comment on column private.ai_usage.latency_ms is
  'Wall-clock duration of the model call in milliseconds, as measured by the app.';
comment on column private.ai_usage.outcome is
  'How the call ended: ok (valid proposal), empty (valid but nothing proposed), invalid '
  '(output failed schema validation), error (provider/network error), aborted (user or '
  'client stopped it). Null until completed.';
comment on column private.ai_usage.completed_at is
  'When public.record_ai_usage completed this row. Null while the call is in flight or if '
  'it was never completed. Set together with outcome.';

-- ---------------------------------------------------------------------------
-- reserve_ai_decomposition: drop the old signature, recreate with p_feature and usage_id
-- ---------------------------------------------------------------------------

drop function public.reserve_ai_decomposition();
drop function private.reserve_ai_decomposition();

create function private.reserve_ai_decomposition(p_feature text default 'decompose')
returns table(remaining integer, daily_limit integer, resets_at timestamptz, usage_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_demo boolean := coalesce((select auth.jwt() ->> 'is_anonymous') = 'true', false);
  v_limits private.ai_limits%rowtype;
  v_daily_limit integer;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_resets_at timestamptz;
  v_user_count integer;
  v_global_cost numeric;
  v_usage_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to use AI decomposition'
      using errcode = 'insufficient_privilege';
  end if;

  if p_feature is null or p_feature not in ('decompose', 'dependencies') then
    raise exception 'Unknown AI feature: %', left(coalesce(p_feature, 'null'), 32)
      using errcode = 'invalid_parameter_value';
  end if;

  -- Same fixed key as the original function (20260928152546_ai_quotas.sql): serializes
  -- concurrent reservations so they cannot both read the pre-reservation totals.
  perform pg_advisory_xact_lock(84200001);

  select * into v_limits from private.ai_limits limit 1;
  if not found then
    raise exception 'AI quota configuration is missing'
      using errcode = 'XX000';
  end if;

  v_daily_limit := case when v_is_demo then v_limits.demo_daily_calls else v_limits.user_daily_calls end;
  v_resets_at := v_today_start + interval '1 day';

  select count(*) into v_user_count
  from private.ai_usage u
  where u.user_id = v_uid
    and u.created_at >= v_today_start;

  -- Checked before the global cap: the more specific, more actionable message.
  if v_user_count >= v_daily_limit then
    raise exception 'Daily AI decomposition limit reached (% calls today). Try again after %.',
      v_daily_limit, v_resets_at
      using errcode = 'AIQ01';
  end if;

  -- Worst-case estimate until the real cost is recorded; a recorded (untrusted) cost can
  -- only lower a row's charge, never raise it above its estimate (see migration header).
  select coalesce(sum(least(coalesce(u.actual_cost_usd, u.estimated_cost_usd), u.estimated_cost_usd)), 0)
  into v_global_cost
  from private.ai_usage u
  where u.created_at >= v_today_start;

  if v_global_cost + v_limits.cost_per_call_usd > v_limits.global_daily_cost_usd then
    raise exception 'The daily AI budget for all users has been reached. Try again after %.',
      v_resets_at
      using errcode = 'AIQ02';
  end if;

  insert into private.ai_usage (user_id, is_demo, estimated_cost_usd, feature)
  values (v_uid, v_is_demo, v_limits.cost_per_call_usd, p_feature)
  returning id into v_usage_id;

  return query
  select v_daily_limit - (v_user_count + 1), v_daily_limit, v_resets_at, v_usage_id;
end;
$$;

comment on function private.reserve_ai_decomposition(text) is
  'Charges one AI call (feature: decompose | dependencies, else 22023) against the '
  'caller''s daily quota and the shared daily cost cap, before the model is called. Raises '
  'AIQ01 if the caller''s own daily limit is reached, AIQ02 if the shared daily budget '
  '(estimate per row, lowered to the recorded real cost when that is smaller) would be exceeded. Returns the calls '
  'remaining today, the daily limit, the next UTC midnight and the new usage row id. '
  'Not exposed: called only from public.reserve_ai_decomposition.';

revoke execute on function private.reserve_ai_decomposition(text) from public, anon, authenticated;

create function public.reserve_ai_decomposition(p_feature text default 'decompose')
returns table(remaining integer, daily_limit integer, resets_at timestamptz, usage_id uuid)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from private.reserve_ai_decomposition(p_feature);
$$;

comment on function public.reserve_ai_decomposition(text) is
  'Call before starting an AI request: reserves one call for p_feature (decompose | '
  'dependencies; defaults to decompose for callers that predate the argument) against the '
  'caller''s daily quota and the shared daily cost cap, or raises AIQ01 / AIQ02 / 22023. '
  'Returns usage_id for public.record_ai_usage. SECURITY DEFINER only to reach '
  'private.reserve_ai_decomposition. Use supabase-js .rpc(...).single().';

revoke execute on function public.reserve_ai_decomposition(text) from public, anon;
grant execute on function public.reserve_ai_decomposition(text) to authenticated;

-- ---------------------------------------------------------------------------
-- record_ai_usage: complete a reserved call with its real outcome
-- ---------------------------------------------------------------------------

create function private.record_ai_usage(
  p_usage_id uuid,
  p_outcome text,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_actual_cost_usd numeric default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  -- Completion window: a reservation can only be completed this long after it was made.
  -- Longer than any route's max duration; short enough that old ids cannot be replayed.
  c_window constant interval := interval '1 hour';
begin
  if v_uid is null then
    raise exception 'You must be signed in to record AI usage'
      using errcode = 'insufficient_privilege';
  end if;

  update private.ai_usage u
  set prompt_version = p_prompt_version,
      model = p_model,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      actual_cost_usd = p_actual_cost_usd,
      latency_ms = p_latency_ms,
      outcome = p_outcome,
      completed_at = now()
  where u.id = p_usage_id
    and u.user_id = v_uid
    and u.completed_at is null
    and u.created_at >= now() - c_window;

  -- One code for every "no such row for you" case (unknown, not yours, already completed,
  -- outside the window), so the RPC cannot be used to probe other users' ids.
  if not found then
    raise exception 'AI usage record not found or no longer open'
      using errcode = 'AIU01';
  end if;
end;
$$;

comment on function private.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric) is
  'Completes one of the caller''s own open AI usage rows (reserved within the last hour) '
  'with outcome and, when known, latency, prompt version, model, tokens and real cost. Raises 42501 without '
  'a session, AIU01 if there is no such open row for the caller, 23514 on invalid values. '
  'Not exposed: called only from public.record_ai_usage.';

revoke execute on function private.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)
  from public, anon, authenticated;

create function public.record_ai_usage(
  p_usage_id uuid,
  p_outcome text,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_actual_cost_usd numeric default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.record_ai_usage(
    p_usage_id, p_outcome, p_latency_ms, p_prompt_version, p_model,
    p_input_tokens, p_output_tokens, p_actual_cost_usd
  );
$$;

comment on function public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric) is
  'Call once when a reserved AI call finishes (any outcome): records its real tokens, cost, '
  'latency and outcome on the usage row returned by reserve_ai_decomposition. Raises 42501 '
  '/ AIU01 / 23514. SECURITY DEFINER only to reach private.record_ai_usage.';

revoke execute on function public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)
  from public, anon;
grant execute on function public.record_ai_usage(uuid, text, integer, text, text, integer, integer, numeric)
  to authenticated;
