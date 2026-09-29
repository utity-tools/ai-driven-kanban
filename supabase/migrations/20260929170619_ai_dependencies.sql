-- v0.3 delivery 5: accepting AI-proposed dependencies.
--
-- The AI proposes which cards of the board block the open card; a human reviews the proposal
-- and only what they confirm is saved (ADR 0015). Accepted edges are shown as AI in the UI,
-- so card_dependencies gets the same `source` column as card_subtasks
-- (20260925193707_card_subtasks.sql), written the same way (20260928143151_accept_ai_subtasks.sql):
--
-- * card_dependencies.source text not null default 'manual', CHECK in ('manual', 'ai').
--   Existing rows become 'manual' (the default fills them in when the column is added).
--   Rows stay immutable: there is no UPDATE grant on any column of the table and no UPDATE
--   policy (20260929085253_card_dependencies.sql), so source is fixed at insert time.
--   The Realtime broadcast triggers (20260929114733_board_realtime.sql) send no row data,
--   only table / op / actor, so the new column changes nothing there; the table is still in
--   no publication.
--
-- * The INSERT policy now also requires source = 'manual' (ALTER POLICY, same name, so the
--   applied migration is not edited). This RPC is the only way to write source = 'ai'.
--
-- What source = 'ai' means (same as for subtasks, ADR 0015): the RPC is granted to
-- `authenticated`, so an owner/editor can call it straight from the browser (supabase.rpc)
-- with card ids of their choosing. 'ai' means "saved through the accept-a-reviewed-proposal
-- flow", not proof that the model proposed the edge; metrics built on it are best-effort. It
-- is not a privilege escalation: it only works on boards where the caller is already
-- owner/editor and could add the same edges as 'manual'.
--
-- private.accept_ai_dependencies(p_card_id, p_blocker_ids): does the actual work, SECURITY
-- DEFINER so it can write source = 'ai' despite the INSERT policy, empty search_path, fully
-- qualified names (ADR 0007). Not exposed: the `private` schema has no grants to any API
-- role, so it can only be reached from another SECURITY DEFINER function owned by the same
-- role (ownership implies EXECUTE, REVOKE cannot remove it).
--
-- public.accept_ai_dependencies(p_card_id, p_blocker_ids): the RPC the app calls. A thin
-- SECURITY DEFINER wrapper for the same reason as public.accept_ai_subtasks: a SECURITY
-- INVOKER wrapper would run the delegated call as the caller, who has no privilege on
-- `private` by design. Only `authenticated` may execute it; `anon` cannot.
--
-- p_blocker_ids is uuid[], not jsonb like accept_ai_subtasks: a proposal item here is just a
-- card id (the direction is fixed: every id blocks p_card_id), so a typed array lets Postgres
-- reject malformed ids at the call boundary (22P02) and removes a whole class of JSON shape
-- checks. PostgREST maps a JSON array of strings to uuid[].
--
-- Checks, in order, each with a distinct error so the app can show the right message:
--   * signed in (auth.uid() not null). 42501. Demo (anonymous) users are allowed, like
--     accept_ai_subtasks since 20260928152546_ai_quotas.sql: they can reserve AI calls, so
--     they can also save the reviewed proposal on boards where they are owner/editor.
--   * the card exists and the caller has role owner or editor on its board
--     (public.has_board_role): "doesn't exist" and "not visible to this user" are kept
--     indistinguishable on purpose. 42501.
--   * the card is not archived: proposals are for active work. 23514.
--   * p_blocker_ids is a one-dimensional array of 1 to 10 ids (half the 20-blocker cap), with
--     no nulls, no duplicates, and not containing the card itself. 23514.
--   * every blocker is a card on the card's board (a nonexistent id and a card of another
--     board get the same message, so nothing leaks about other boards). 23514.
--   * no blocker is archived. The table itself allows archived blockers (an archived blocker
--     counts as resolved), but proposing one is pointless. 23514.
--   * none of them already blocks the card. Rejected rather than skipped (all-or-nothing):
--     the app filters existing edges out of the proposal before showing it, so an existing
--     one means the board changed under the user, who should look again. 23514.
--
-- All validation happens before any INSERT, so a bad id leaves nothing behind (the
-- function's statements run inside the caller's transaction; raising rolls all of them
-- back). Rows are inserted in one statement, in the given order, source = 'ai',
-- created_by = auth.uid(). The existing card_dependencies_check trigger still runs on every
-- row: running as the table owner it sees the whole graph, and it rejects a cycle (DEP01) or
-- a 21st blocker (DEP02); either error aborts the whole statement, so no edge of the
-- proposal is kept.
--
-- Concurrency. Lock order, the same as internal.check_card_dependency (row lock on the
-- blocked card, then the board advisory lock), so the two cannot deadlock on each other:
--   1. the card row, FOR NO KEY UPDATE (like accept_ai_subtasks), before reading
--      archived_at: a concurrent archive is a no-key UPDATE, which conflicts with it, so
--      the card cannot be archived (or deleted) between the check and the INSERT. It still
--      does not conflict with FOR KEY SHARE, the lock the trigger and the FK checks take, so
--      manual dependency inserts that reference the card are not blocked by it.
--   2. the blocker rows of this board, FOR SHARE, in id order (deterministic, so two calls
--      locking overlapping blockers take them in the same order), before checking whether
--      any is archived. FOR SHARE is the lightest mode that conflicts with a no-key UPDATE
--      (FOR KEY SHARE does not), so no blocker can be archived before the INSERT. It is
--      preferred over FOR NO KEY UPDATE because share locks do not conflict with each
--      other: concurrent accepts that propose the same blocker for different cards do not
--      queue on it, and it does not conflict with the FOR KEY SHARE taken by the FK check.
--      Ids of other boards are not locked (they are rejected right after).
--   3. the per-board advisory lock (84200002, hashtext(board_id)), the one the trigger
--      takes, before the "already a blocker" check, so that check and the INSERT see a
--      stable set of edges on this board. When the trigger then runs for each row it finds
--      the card row lock already held by this transaction (FOR NO KEY UPDATE covers its
--      FOR KEY SHARE) and the advisory lock is re-entrant, so it waits on nothing new.
-- The only lock-wait cycle left is between concurrent accepts whose card of one is a
-- blocker of another (step 1 vs step 2) all around a cycle; those proposals together would
-- form a dependency cycle, so one of them must fail anyway: Postgres aborts one with
-- 40P01 (deadlock_detected) instead of DEP01. Archive UPDATEs lock a single card row and
-- take no advisory lock, so they cannot be part of a cycle.

-- ---------------------------------------------------------------------------
-- card_dependencies.source
-- ---------------------------------------------------------------------------

alter table public.card_dependencies
  add column source text not null default 'manual'
    constraint card_dependencies_source_check check (source in ('manual', 'ai'));

comment on column public.card_dependencies.source is
  'Who proposed it: manual (added by a user) or ai (saved through the accept-a-reviewed-'
  'proposal flow, public.accept_ai_dependencies; best-effort, see ADR 0015). Clients can only '
  'insert manual; not updatable.';

-- Rows are immutable: re-state it so nobody reading this migration wonders about source.
revoke update on table public.card_dependencies from authenticated;

alter policy "card_dependencies: owners and editors can create"
  on public.card_dependencies
  with check (
    public.has_board_role(board_id, '{owner,editor}')
    and created_by = (select auth.uid())
    -- Clients can only add manual dependencies: 'ai' is written by
    -- public.accept_ai_dependencies (see the migration header).
    and source = 'manual'
  );

-- ---------------------------------------------------------------------------
-- private.accept_ai_dependencies: the actual work
-- ---------------------------------------------------------------------------

create function private.accept_ai_dependencies(p_card_id uuid, p_blocker_ids uuid[])
returns setof public.card_dependencies
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
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept AI dependencies'
      using errcode = 'insufficient_privilege';
  end if;

  -- SECURITY DEFINER bypasses RLS, so "not found" here really means no such card.
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
    raise exception 'Cannot add AI dependencies to an archived card'
      using errcode = 'check_violation';
  end if;

  v_count := coalesce(cardinality(p_blocker_ids), 0);
  if v_count < 1 or v_count > 10 or array_ndims(p_blocker_ids) <> 1 then
    raise exception 'Between 1 and 10 blockers must be proposed'
      using errcode = 'check_violation';
  end if;

  if array_position(p_blocker_ids, null) is not null then
    raise exception 'Blocker ids must not be null'
      using errcode = 'check_violation';
  end if;

  if (select count(distinct b) from unnest(p_blocker_ids) as b) <> v_count then
    raise exception 'Blocker ids must not repeat'
      using errcode = 'check_violation';
  end if;

  if p_card_id = any (p_blocker_ids) then
    raise exception 'A card cannot block itself'
      using errcode = 'check_violation';
  end if;

  -- Lock order: card row, blocker rows (id order), advisory lock -- see the migration
  -- header. FOR SHARE blocks a concurrent archive until this transaction ends.
  perform 1
  from public.cards c
  where c.id = any (p_blocker_ids)
    and c.board_id = v_board_id
  order by c.id
  for share;

  if exists (
    select 1
    from unnest(p_blocker_ids) as b (id)
    where not exists (
      select 1 from public.cards c where c.id = b.id and c.board_id = v_board_id
    )
  ) then
    raise exception 'Every blocker must be a card on the same board'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from public.cards c
    where c.id = any (p_blocker_ids)
      and c.archived_at is not null
  ) then
    raise exception 'An archived card cannot be proposed as a blocker'
      using errcode = 'check_violation';
  end if;

  -- Same lock as internal.check_card_dependency, taken after the row locks like it does.
  perform pg_advisory_xact_lock(84200002, hashtext(v_board_id::text));

  if exists (
    select 1
    from public.card_dependencies d
    where d.blocked_card_id = p_card_id
      and d.blocker_card_id = any (p_blocker_ids)
  ) then
    raise exception 'A proposed blocker already blocks this card'
      using errcode = 'check_violation';
  end if;

  -- card_dependencies_check still enforces acyclicity (DEP01) and the 20-blocker cap (DEP02).
  return query
  insert into public.card_dependencies (board_id, blocker_card_id, blocked_card_id, source, created_by)
  select v_board_id, b.id, p_card_id, 'ai', v_uid
  from unnest(p_blocker_ids) with ordinality as b (id, ord)
  order by b.ord
  returning *;
end;
$$;

comment on function private.accept_ai_dependencies(uuid, uuid[]) is
  'Inserts 1-10 reviewed AI-proposed dependencies "blocker blocks p_card_id" (source = ai). '
  'Caller must be a signed-in owner or editor of the card''s board (demo users included); the '
  'card and every blocker must be active cards of that board, not already blocking it. '
  'Not exposed: called only from public.accept_ai_dependencies.';

revoke execute on function private.accept_ai_dependencies(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.accept_ai_dependencies: the RPC the app calls
-- ---------------------------------------------------------------------------

create function public.accept_ai_dependencies(p_card_id uuid, p_blocker_ids uuid[])
returns setof public.card_dependencies
language sql
volatile
security definer
set search_path = ''
as $$
  select * from private.accept_ai_dependencies(p_card_id, p_blocker_ids);
$$;

comment on function public.accept_ai_dependencies(uuid, uuid[]) is
  'Saves dependencies the user reviewed and accepted from an AI proposal, with source = ai: '
  'each id in p_blocker_ids (1-10 cards of the same board) blocks p_card_id. SECURITY '
  'DEFINER only to reach private.accept_ai_dependencies (see migration header); all '
  'authorization checks run inside it.';

revoke execute on function public.accept_ai_dependencies(uuid, uuid[]) from public, anon;
grant execute on function public.accept_ai_dependencies(uuid, uuid[]) to authenticated;
