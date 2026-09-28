-- v0.2 delivery 5: per-user daily AI quotas and a global daily cost cap.
--
-- AI decomposition calls cost real money (AI Gateway -> the underlying model). Two limits
-- protect the budget, both enforced server-side, in the database, before the model is ever
-- called:
--   * a per-user daily call count (demo/anonymous users get a smaller allowance than
--     permanent accounts, since demo boards are not tied to a real person);
--   * a global daily cost cap shared by every user, so one busy day cannot blow the budget
--     even if nobody individually hits their own limit.
--
-- private.ai_limits: a one-row configuration table (demo/user daily call counts, the
-- global daily cost cap, and the estimated cost charged per call). Not writable through
-- the API on purpose -- these are operational knobs, changed with a migration or a direct
-- SQL statement against the local/staging/prod database, never by the app. cost_per_call_usd
-- defaults to 0.006 = a worst-case estimate for the model currently used by decomposition
-- (Claude Haiku 4.5 via the AI Gateway: $1 / 1M input tokens, $5 / 1M output tokens), with
-- maxOutputTokens capped at 1024 and a bounded prompt (see src/lib/ai/): roughly
-- 1024 output tokens * $5/1e6 = $0.00512, plus a generous ~1500 input tokens * $1/1e6 =
-- $0.0015, rounded up to $0.006 for headroom.
--
-- private.ai_usage: one row per *reserved* call. Charging happens at reservation time --
-- before the model is called -- not after a successful response, so a call that times out,
-- errors, or whose stream is aborted by the user still counts against both limits. This is
-- deliberate: the AI Gateway is billed for the tokens it processes regardless of whether the
-- app likes the result, so a "charge on success" policy would let a user retry a failing
-- prompt indefinitely for free.
--
-- private.reserve_ai_decomposition(): the actual work, SECURITY DEFINER so it can read
-- private.ai_limits / private.ai_usage (no API role has any privilege on them) and insert a
-- usage row despite RLS having no policies on the table. Requires a signed-in caller (demo
-- users included, see the accept_ai_subtasks change below); anonymous (unauthenticated)
-- calls get 42501. It:
--   1. Takes a fixed-key `pg_advisory_xact_lock`, held for the rest of the calling
--      transaction, so two concurrent reservations (same user or different users) cannot
--      both read the pre-reservation counts and both pass the checks below -- ordinary
--      MVCC snapshots would let that race through.
--   2. Counts the caller's own calls since the start of the current UTC day
--      (`date_trunc('day', now() at time zone 'utc') at time zone 'utc'`, i.e. midnight UTC
--      interpreted as an instant, not the viewer's local midnight -- this is a rate limit,
--      not a due date, so ADR 0007 does not apply). >= their limit (demo_daily_calls or
--      user_daily_calls) raises SQLSTATE 'AIQ01' (checked first: it is the more specific,
--      more actionable message for the caller).
--   3. Sums today's estimated cost across *all* users; if adding one more call's
--      cost_per_call_usd would exceed global_daily_cost_usd, raises SQLSTATE 'AIQ02'.
--   4. Otherwise inserts the usage row and returns (remaining, daily_limit, resets_at) --
--      remaining calls left for this user today after this one, and the timestamp of the
--      next UTC midnight, so the client can show "3 of 20 used today, resets at ...".
--
-- 'AIQ01' / 'AIQ02' are custom SQLSTATEs (Postgres reserves classes '00'/'01'/'02' for
-- success/warning/no-data; 'AIQ' is not one of those) so the app can distinguish "you're
-- over your own quota" from "everyone is over the shared budget" without parsing text.
--
-- public.reserve_ai_decomposition(): thin SECURITY DEFINER wrapper, the same shape as
-- public.accept_ai_subtasks in 20260928143151_accept_ai_subtasks.sql and for the same
-- reason -- it is the only way to reach the private function without granting EXECUTE on
-- it directly. Granted to `authenticated` only.
--
-- private.accept_ai_subtasks is updated (create or replace, same migration) to drop its
-- "not anonymous" rejection: demo users can now reserve and use AI decomposition, so they
-- must also be able to accept the reviewed proposal on boards where they are owner/editor,
-- same as any other user. Calling with no session at all (auth.uid() is null) still raises
-- 42501. supabase/tests/database/10_accept_ai_subtasks.test.sql is updated to match: the
-- anonymous editor case now expects success, not a rejection.

-- ---------------------------------------------------------------------------
-- private.ai_limits: singleton configuration row
-- ---------------------------------------------------------------------------

create table private.ai_limits (
  -- Singleton: exactly one row can ever exist.
  id boolean primary key default true
    constraint ai_limits_singleton check (id),
  demo_daily_calls integer not null default 3
    constraint ai_limits_demo_daily_calls_positive check (demo_daily_calls > 0),
  user_daily_calls integer not null default 20
    constraint ai_limits_user_daily_calls_positive check (user_daily_calls > 0),
  global_daily_cost_usd numeric(10, 4) not null default 0.25
    constraint ai_limits_global_daily_cost_positive check (global_daily_cost_usd > 0),
  cost_per_call_usd numeric(10, 6) not null default 0.006
    constraint ai_limits_cost_per_call_positive check (cost_per_call_usd > 0)
);

comment on table private.ai_limits is
  'Singleton row of AI quota configuration (daily call counts per kind of user, the shared '
  'daily cost cap, and the estimated cost charged per reserved call). Not exposed through '
  'the API; changed only by a migration or direct SQL. See migration header for the '
  'cost_per_call_usd estimate.';
comment on column private.ai_limits.demo_daily_calls is 'Daily AI decomposition calls allowed per anonymous (demo) user.';
comment on column private.ai_limits.user_daily_calls is 'Daily AI decomposition calls allowed per permanent (signed-in) user.';
comment on column private.ai_limits.global_daily_cost_usd is 'Shared daily budget, in USD, across every user.';
comment on column private.ai_limits.cost_per_call_usd is 'Worst-case estimated cost, in USD, charged per reserved call.';

insert into private.ai_limits default values;

revoke all on table private.ai_limits from anon, authenticated;
alter table private.ai_limits enable row level security;
-- No policies: private.ai_limits is only ever read from a SECURITY DEFINER function owned
-- by the table owner, which bypasses RLS by ownership. No API role has any grant on it
-- either way (see the revoke above and `revoke all on schema private` in
-- 20260924162400_profiles.sql), so this is belt and braces, not the only protection.

-- ---------------------------------------------------------------------------
-- private.ai_usage: one row per reserved call
-- ---------------------------------------------------------------------------

create table private.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  is_demo boolean not null,
  estimated_cost_usd numeric(10, 6) not null
    constraint ai_usage_estimated_cost_positive check (estimated_cost_usd > 0),
  created_at timestamptz not null default now()
);

comment on table private.ai_usage is
  'One row per reserved AI decomposition call, written by private.reserve_ai_decomposition '
  'at reservation time (before the model is called), so aborted/failed calls still count. '
  'Not exposed through the API.';
comment on column private.ai_usage.is_demo is 'True if the caller was an anonymous (demo) user at reservation time.';
comment on column private.ai_usage.estimated_cost_usd is 'private.ai_limits.cost_per_call_usd at the time of this reservation.';

-- Per-user daily count (private.reserve_ai_decomposition's own-user check).
create index ai_usage_user_id_created_at_idx on private.ai_usage (user_id, created_at);
-- Global daily cost (the same function's shared-budget check).
create index ai_usage_created_at_idx on private.ai_usage (created_at);

revoke all on table private.ai_usage from anon, authenticated;
alter table private.ai_usage enable row level security;
-- No policies, same reasoning as private.ai_limits above.

-- ---------------------------------------------------------------------------
-- private.reserve_ai_decomposition: the actual work
-- ---------------------------------------------------------------------------

create function private.reserve_ai_decomposition()
returns table(remaining integer, daily_limit integer, resets_at timestamptz)
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
begin
  if v_uid is null then
    raise exception 'You must be signed in to use AI decomposition'
      using errcode = 'insufficient_privilege';
  end if;

  -- Fixed, arbitrary key: only used to serialize this function's own read-then-insert
  -- against itself, never against unrelated locks. Held until the end of the calling
  -- transaction (a single RPC call is its own transaction), so two concurrent
  -- reservations cannot both read the pre-reservation counts below.
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

  -- Checked before the global cap: it is the more specific, more actionable message for
  -- the caller (their own limit, not a shared one they cannot influence).
  if v_user_count >= v_daily_limit then
    raise exception 'Daily AI decomposition limit reached (% calls today). Try again after %.',
      v_daily_limit, v_resets_at
      using errcode = 'AIQ01';
  end if;

  select coalesce(sum(u.estimated_cost_usd), 0) into v_global_cost
  from private.ai_usage u
  where u.created_at >= v_today_start;

  if v_global_cost + v_limits.cost_per_call_usd > v_limits.global_daily_cost_usd then
    raise exception 'The daily AI budget for all users has been reached. Try again after %.',
      v_resets_at
      using errcode = 'AIQ02';
  end if;

  insert into private.ai_usage (user_id, is_demo, estimated_cost_usd)
  values (v_uid, v_is_demo, v_limits.cost_per_call_usd);

  return query
  select v_daily_limit - (v_user_count + 1), v_daily_limit, v_resets_at;
end;
$$;

comment on function private.reserve_ai_decomposition() is
  'Charges one AI decomposition call against the caller''s daily quota and the shared '
  'daily cost cap, before the model is called. Raises AIQ01 if the caller''s own daily '
  'limit is reached, AIQ02 if the shared daily budget would be exceeded. Returns the '
  'calls remaining for the caller today, their daily limit, and the next UTC midnight. '
  'Not exposed: called only from public.reserve_ai_decomposition.';

revoke execute on function private.reserve_ai_decomposition() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.reserve_ai_decomposition: the RPC the app calls
-- ---------------------------------------------------------------------------

create function public.reserve_ai_decomposition()
returns table(remaining integer, daily_limit integer, resets_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from private.reserve_ai_decomposition();
$$;

comment on function public.reserve_ai_decomposition() is
  'Call before starting an AI decomposition request: reserves one call against the '
  'caller''s daily quota and the shared daily cost cap, or raises AIQ01 / AIQ02. SECURITY '
  'DEFINER only to reach private.reserve_ai_decomposition (see migration header); all '
  'checks run inside it. Use supabase-js .rpc(...).single().';

revoke execute on function public.reserve_ai_decomposition() from public, anon;
grant execute on function public.reserve_ai_decomposition() to authenticated;

-- ---------------------------------------------------------------------------
-- private.accept_ai_subtasks: demo (anonymous) users can now accept proposals, since they
-- can now reserve AI decomposition calls above. Only the "not anonymous" rejection changes;
-- the rest of the body is unchanged from 20260928143151_accept_ai_subtasks.sql.
-- ---------------------------------------------------------------------------

create or replace function private.accept_ai_subtasks(p_card_id uuid, p_subtasks jsonb)
returns setof public.card_subtasks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_board_id uuid;
  v_archived_at timestamptz;
  v_count integer;
  v_last_position text;
  v_base text;
  v_item jsonb;
  v_extra jsonb;
  v_title text;
  v_estimate_json jsonb;
  v_titles text[] := array[]::text[];
  v_estimates smallint[] := array[]::smallint[];
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept AI subtasks'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock the card so a concurrent accept on the same card cannot compute the same
  -- "append after" position twice. SECURITY DEFINER bypasses RLS, so "not found" here
  -- really means no such card.
  select c.board_id, c.archived_at
  into v_board_id, v_archived_at
  from public.cards c
  where c.id = p_card_id
  for no key update;

  if not found then
    raise exception 'Card not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- "doesn't exist" and "not visible to this user" stay indistinguishable on purpose.
  if not public.has_board_role(v_board_id, '{owner,editor}') then
    raise exception 'Card not found'
      using errcode = 'insufficient_privilege';
  end if;

  if v_archived_at is not null then
    raise exception 'Cannot add AI subtasks to an archived card'
      using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_subtasks) is distinct from 'array' then
    raise exception 'Subtasks must be a JSON array'
      using errcode = 'check_violation';
  end if;

  v_count := jsonb_array_length(p_subtasks);
  if v_count < 1 or v_count > 8 then
    raise exception 'Between 1 and 8 subtasks must be proposed'
      using errcode = 'check_violation';
  end if;

  for v_idx in 0 .. v_count - 1 loop
    v_item := p_subtasks -> v_idx;

    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Each subtask must be a JSON object'
        using errcode = 'check_violation';
    end if;

    v_extra := v_item - 'title' - 'estimate';
    if not (v_item ? 'title') or not (v_item ? 'estimate') or v_extra <> '{}'::jsonb then
      raise exception 'Each subtask must have exactly the keys title and estimate'
        using errcode = 'check_violation';
    end if;

    if jsonb_typeof(v_item -> 'title') is distinct from 'string' then
      raise exception 'title must be a string'
        using errcode = 'check_violation';
    end if;
    v_title := btrim(v_item ->> 'title');
    if char_length(v_title) < 1 or char_length(v_title) > 200 then
      raise exception 'title must be between 1 and 200 characters (after trimming)'
        using errcode = 'check_violation';
    end if;

    v_estimate_json := v_item -> 'estimate';
    if jsonb_typeof(v_estimate_json) = 'null' then
      v_titles := array_append(v_titles, v_title);
      v_estimates := array_append(v_estimates, null::smallint);
    elsif jsonb_typeof(v_estimate_json) = 'number'
      and (v_estimate_json::text)::numeric = trunc((v_estimate_json::text)::numeric)
      and (v_estimate_json::text)::numeric in (1, 2, 3, 5, 8, 13)
    then
      v_titles := array_append(v_titles, v_title);
      v_estimates := array_append(v_estimates, (v_estimate_json::text)::numeric::smallint);
    else
      raise exception 'estimate must be null or one of 1, 2, 3, 5, 8, 13'
        using errcode = 'check_violation';
    end if;
  end loop;

  select max(s.position) into v_last_position
  from public.card_subtasks s
  where s.card_id = p_card_id;

  v_base := coalesce(v_last_position, 'a');

  return query
  insert into public.card_subtasks (board_id, card_id, title, estimate, position, source, created_by)
  select v_board_id, p_card_id, v_titles[i], v_estimates[i], v_base || chr(48 + i), 'ai', v_uid
  from generate_series(1, v_count) as i
  returning *;
end;
$$;

comment on function private.accept_ai_subtasks(uuid, jsonb) is
  'Inserts 1-8 reviewed AI-proposed subtasks (source = ai) after a card''s existing '
  'checklist. Caller must be a signed-in owner or editor of the card''s board (demo/'
  'anonymous users included, see 20260928152546_ai_quotas.sql); the card must exist and '
  'not be archived. Not exposed: called only from public.accept_ai_subtasks.';

revoke execute on function private.accept_ai_subtasks(uuid, jsonb) from public, anon, authenticated;
