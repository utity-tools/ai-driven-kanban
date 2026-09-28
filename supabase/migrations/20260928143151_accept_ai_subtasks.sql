-- v0.2 delivery 4: accepting an AI subtask proposal.
--
-- The card_subtasks INSERT policy forces source = 'manual' on direct inserts (see
-- 20260925193707_card_subtasks.sql), so this RPC is the only way to write source = 'ai'.
-- It is granted to `authenticated`, so any owner/editor can also call it straight from the
-- browser (supabase.rpc) with titles of their choosing. That is accepted (ADR 0015):
-- source = 'ai' means "saved through the accept-a-reviewed-proposal flow", not proof that
-- the model wrote the text, so acceptance metrics are best-effort. It is not a privilege
-- escalation: it only works on boards where the caller is already owner/editor and could
-- add the same rows as 'manual'.
--
-- private.accept_ai_subtasks(p_card_id, p_subtasks): does the actual work, SECURITY DEFINER
-- so it can write source = 'ai' despite the INSERT policy, empty search_path, fully
-- qualified names (ADR 0007). Not exposed: the `private` schema has no grants to any API
-- role, so it can only be reached from another SECURITY DEFINER function owned by the same
-- role (ownership implies EXECUTE, REVOKE cannot remove it).
--
-- public.accept_ai_subtasks(p_card_id, p_subtasks): the RPC the app calls. It is itself
-- SECURITY DEFINER (a thin wrapper) precisely so it can reach private.accept_ai_subtasks
-- without granting EXECUTE on it to `authenticated` -- a SECURITY INVOKER wrapper would run
-- the delegated call as the caller, who has no privilege on `private` by design. Only
-- `authenticated` may execute the public RPC; `anon` and the demo (anonymous) role cannot.
--
-- Checks, in order, each with a distinct error so the app can show the right message:
--   * signed in and not anonymous (auth.jwt() ->> 'is_anonymous', same claim
--     src/lib/auth/user.ts reads): demo visitors are denied outright, same as the
--     decomposition route (src/app/api/cards/[cardId]/decompose/route.ts), so the AI
--     Gateway and this RPC are never reachable on their behalf. 42501.
--   * the card exists and the caller has role owner or editor on its board
--     (public.has_board_role): "doesn't exist" and "not visible to this user" are kept
--     indistinguishable on purpose, like the decomposition route. 42501.
--   * the card is not archived: proposals are for active work. 23514, distinct from the
--     membership check above because only someone who can already see the card learns this.
--   * p_subtasks is a JSON array of 1 to 8 objects, each with exactly `title` (string,
--     trimmed length 1-200) and `estimate` (JSON null or one of 1, 2, 3, 5, 8, 13); extra,
--     missing or mistyped keys are rejected. 23514 for every shape problem, mirroring the
--     table's own CHECK constraints.
--
-- All validation happens before any INSERT, so a bad item leaves nothing behind (the
-- function's statements run inside the caller's transaction; raising rolls all of them
-- back). Rows are inserted in one statement, in the given order, source = 'ai',
-- created_by = auth.uid(), positioned after the card's existing subtasks: the last
-- position gets one extra trailing character per new row ('1'..'8', at most 8 of them),
-- which is always greater than the row it extends (a proper prefix sorts first in the
-- table's C collation) and strictly increasing between the new rows themselves -- no need
-- to reimplement the client's fractional-indexing algorithm for a simple append. The
-- existing card_subtasks_enforce_limit trigger still caps the checklist at 100.

-- ---------------------------------------------------------------------------
-- private.accept_ai_subtasks: the actual work
-- ---------------------------------------------------------------------------

create function private.accept_ai_subtasks(p_card_id uuid, p_subtasks jsonb)
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
  if v_uid is null or (select auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'You must be signed in with a permanent account to accept AI subtasks'
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
  'checklist. Caller must be a signed-in, non-anonymous owner or editor of the card''s '
  'board; the card must exist and not be archived. Not exposed: called only from '
  'public.accept_ai_subtasks.';

revoke execute on function private.accept_ai_subtasks(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.accept_ai_subtasks: the RPC the app calls
-- ---------------------------------------------------------------------------

create function public.accept_ai_subtasks(p_card_id uuid, p_subtasks jsonb)
returns setof public.card_subtasks
language sql
volatile
security definer
set search_path = ''
as $$
  select * from private.accept_ai_subtasks(p_card_id, p_subtasks);
$$;

comment on function public.accept_ai_subtasks(uuid, jsonb) is
  'Saves subtasks the user reviewed and accepted from an AI decomposition proposal, with '
  'source = ai. p_subtasks is a JSON array of 1-8 {title, estimate} objects. SECURITY '
  'DEFINER only to reach private.accept_ai_subtasks (see migration header); all '
  'authorization checks run inside it.';

revoke execute on function public.accept_ai_subtasks(uuid, jsonb) from public, anon;
grant execute on function public.accept_ai_subtasks(uuid, jsonb) to authenticated;
