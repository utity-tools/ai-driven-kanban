-- v0.3: card dependencies ("A blocks B") and "done" columns.
--
-- * board_columns.is_done: cards in a column marked done no longer block other cards. Any
--   number of columns may be marked. Existing columns titled "Done" (trimmed, any case) are
--   backfilled; internal.add_default_columns() (sign-up "My board" and create_board()) and
--   private.seed_demo_board() now create their Done column with is_done = true.
--   Editable like the other column attributes: owners and editors (existing UPDATE policy),
--   through a column-level UPDATE grant.
--
-- * public.card_dependencies: one row per edge "blocker_card_id blocks blocked_card_id".
--   Authorization follows ADR 0004: denormalised board_id, two composite FKs to
--   cards(id, board_id) (both cards are on the edge's board), RLS through
--   public.has_board_role, privileges tightened beyond RLS.
--   Rows are immutable (no UPDATE grant, no UPDATE policy): change an edge by deleting it
--   and inserting a new one, so the cycle check below only has to guard INSERT.
--   Dependencies on archived cards are allowed; the app treats an archived blocker as
--   resolved, like one in a done column.
--   Not in the supabase_realtime publication yet.
--
-- * Graph invariants, enforced by a BEFORE INSERT trigger (internal.check_card_dependency):
--   - acyclic: an edge blocker -> blocked is rejected if blocked already reaches blocker
--     (SQLSTATE 'DEP01');
--   - at most 20 blockers per card (SQLSTATE 'DEP02').
--   'DEP01' / 'DEP02' are custom SQLSTATEs, same style as 'AIQ01' / 'AIQ02'
--   (20260928152546_ai_quotas.sql): the app maps them to messages without parsing text.
--   Self-dependencies are left to the CHECK constraint (23514), duplicates to the PK (23505).
--
--   Concurrency: two transactions inserting A -> B and B -> A on the same board would each
--   see an acyclic graph in their own snapshot and both commit a cycle. The trigger takes a
--   transaction-scoped advisory lock keyed on the board, so dependency inserts on one board
--   serialise (other boards are unaffected). In READ COMMITTED (what PostgREST uses) the
--   walk that follows takes a fresh snapshot, so it sees the edge committed by the
--   transaction it waited for. Rows inserted earlier in the same statement are visible to
--   the trigger too, so one multi-row INSERT cannot slip a cycle or a 21st blocker past it.
--
--   Why SECURITY INVOKER (schema internal, ADR 0007) and not DEFINER (private):
--   an invoker function only sees the rows RLS lets the inserting user see, so the walk is
--   only correct if the caller can see every edge it might need to follow. It can:
--   - Every edge references two cards of its own board_id (composite FKs), so a walk that
--     starts at NEW.blocked_card_id (a card of NEW.board_id) only ever follows edges of
--     NEW.board_id. It never needs another board's edges.
--   - The trigger first locks the blocked card FOR KEY SHARE. SELECT ... FOR <lock>
--     applies the cards UPDATE policy (owner/editor), so the lock is found only for an
--     owner or editor of that board -- the same users the INSERT policy admits. For them the
--     card_dependencies SELECT policy (any member) exposes every edge of the board, so the
--     walk sees the whole relevant graph. For anyone else the trigger returns early and the
--     INSERT policy rejects the row right after (42501), without taking the board lock or
--     reporting a cycle/limit the user is not allowed to act on (viewers get 42501, not DEP01).
--   - SECURITY DEFINER callers (private.seed_demo_board, future server-side RPCs) run as
--     the table owner, which bypasses RLS: they see every edge and the check still applies.
--   FOR KEY SHARE is the lock the FK check takes on the same row anyway, so it adds no new
--   contention (it only conflicts with deleting the card).
--   DEFINER would add nothing and would let the function read edges the caller cannot, so
--   invoker it is. No EXECUTE grant is needed for a trigger function.

-- ---------------------------------------------------------------------------
-- board_columns.is_done
-- ---------------------------------------------------------------------------

alter table public.board_columns
  add column is_done boolean not null default false;

comment on column public.board_columns.is_done is
  'Cards in a done column are resolved: they no longer block other cards. Any number of '
  'columns may be marked.';

update public.board_columns
set is_done = true
where lower(btrim(title)) = 'done';

-- Same editors as title/position (the existing "owners and editors can update" policy).
grant update (is_done) on table public.board_columns to authenticated;

-- Default columns: Done is a done column.
create or replace function internal.add_default_columns(p_board_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  -- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2.
  insert into public.board_columns (board_id, title, position, is_done)
  values
    (p_board_id, 'To do', 'a0', false),
    (p_board_id, 'In progress', 'a1', false),
    (p_board_id, 'Done', 'a2', true);
$$;

comment on function internal.add_default_columns(uuid) is
  'Adds To do / In progress / Done (a0, a1, a2; Done has is_done = true) to a board. '
  'SECURITY INVOKER: subject to the caller''s RLS. Used by handle_new_user() and create_board().';

-- create or replace keeps existing grants, but be explicit.
revoke execute on function internal.add_default_columns(uuid) from public, anon;
grant execute on function internal.add_default_columns(uuid) to authenticated;

-- Demo board: identical to 20260925094419_demo_mode.sql except that Done has is_done = true.
create or replace function private.seed_demo_board(p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := gen_random_uuid();

  v_backlog uuid := gen_random_uuid();
  v_todo uuid := gen_random_uuid();
  v_doing uuid := gen_random_uuid();
  v_done uuid := gen_random_uuid();

  v_frontend uuid := gen_random_uuid();
  v_backend uuid := gen_random_uuid();
  v_design uuid := gen_random_uuid();
  v_content uuid := gen_random_uuid();
  v_infra uuid := gen_random_uuid();

  v_ab_test uuid := gen_random_uuid();
  v_analytics uuid := gen_random_uuid();
  v_copy uuid := gen_random_uuid();
  v_domain uuid := gen_random_uuid();
  v_hero uuid := gen_random_uuid();
  v_newsletter uuid := gen_random_uuid();
  v_wireframe uuid := gen_random_uuid();
  v_stack uuid := gen_random_uuid();
begin
  insert into public.boards (id, title, owner_id)
  values (v_board_id, 'Demo: Launch a landing page', p_user_id);

  -- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2, a3.
  insert into public.board_columns (id, board_id, title, position, is_done)
  values
    (v_backlog, v_board_id, 'Backlog', 'a0', false),
    (v_todo, v_board_id, 'To do', 'a1', false),
    (v_doing, v_board_id, 'In progress', 'a2', false),
    (v_done, v_board_id, 'Done', 'a3', true);

  insert into public.board_labels (id, board_id, name, color)
  values
    (v_frontend, v_board_id, 'Frontend', 'blue'),
    (v_backend, v_board_id, 'Backend', 'purple'),
    (v_design, v_board_id, 'Design', 'pink'),
    (v_content, v_board_id, 'Content', 'yellow'),
    (v_infra, v_board_id, 'Infra', 'orange');

  -- Due dates: one overdue (newsletter), one due today (hero), one this week (copy),
  -- one later (analytics), one done with its date marked complete (stack), the rest none.
  insert into public.cards
    (id, board_id, column_id, title, description, position, due_on, completed_at, created_by)
  values
    -- Backlog
    (v_ab_test, v_board_id, v_backlog, 'A/B test the pricing section',
     E'Compare the current pricing table with a single-plan layout.\n\n' ||
     E'- Define the success metric (click-through to sign-up)\n' ||
     E'- Split traffic 50/50 behind a feature flag\n' ||
     E'- Run for at least two weeks before deciding',
     'a0', null, null, null),
    (v_analytics, v_board_id, v_backlog, 'Set up analytics events',
     E'Track the funnel from first visit to sign-up.\n\n' ||
     E'**Events:** `page_view`, `cta_click`, `newsletter_submit`, `signup_start`.\n\n' ||
     E'Respect Do Not Track and keep the script under 5 KB.',
     'a1', current_date + 14, null, null),
    -- To do
    (v_copy, v_board_id, v_todo, 'Write hero copy and CTA',
     E'One headline, one sub-headline, one call to action.\n\n' ||
     E'- Headline under 60 characters\n' ||
     E'- Lead with the outcome, not the feature\n' ||
     E'- Get sign-off from marketing',
     'a0', current_date + 3, null, null),
    (v_domain, v_board_id, v_todo, 'Configure custom domain and SSL',
     E'Point the apex domain and `www` to the hosting provider.\n\n' ||
     E'- [ ] Add DNS records\n' ||
     E'- [ ] Verify the certificate is issued\n' ||
     E'- [ ] Redirect `www` to the apex domain',
     'a1', null, null, null),
    -- In progress
    (v_hero, v_board_id, v_doing, 'Build responsive hero section',
     E'Implement the hero from the approved wireframe.\n\n' ||
     E'**Acceptance criteria**\n' ||
     E'- Looks right from 320 px to 1440 px\n' ||
     E'- Hero image is lazy-loaded below the fold on mobile\n' ||
     E'- Lighthouse performance score of 90 or more',
     'a0', current_date, null, null),
    (v_newsletter, v_board_id, v_doing, 'Integrate newsletter signup form',
     E'Server-side endpoint that adds the email to the mailing list.\n\n' ||
     E'- Validate the email on the server\n' ||
     E'- Double opt-in confirmation email\n' ||
     E'- Rate-limit by IP to stop spam sign-ups',
     'a1', current_date - 2, null, null),
    -- Done
    (v_wireframe, v_board_id, v_done, 'Wireframe the page layout',
     E'Low-fidelity wireframes for desktop and mobile, reviewed with the team.',
     'a0', null, null, null),
    (v_stack, v_board_id, v_done, 'Choose the stack and hosting',
     E'Static-first framework, deployed on a CDN with preview deployments per pull request.\n\n' ||
     E'Decision recorded in the project ADRs.',
     'a1', current_date - 5, now() - interval '5 days', null);

  insert into public.card_labels (card_id, label_id, board_id)
  values
    (v_ab_test, v_frontend, v_board_id),
    (v_analytics, v_frontend, v_board_id),
    (v_copy, v_content, v_board_id),
    (v_domain, v_infra, v_board_id),
    (v_hero, v_frontend, v_board_id),
    (v_hero, v_design, v_board_id),
    (v_newsletter, v_frontend, v_board_id),
    (v_newsletter, v_backend, v_board_id),
    (v_wireframe, v_design, v_board_id),
    (v_stack, v_infra, v_board_id);

  insert into public.card_assignees (card_id, user_id, board_id)
  values
    (v_hero, p_user_id, v_board_id),
    (v_newsletter, p_user_id, v_board_id);

  return v_board_id;
end;
$$;

comment on function private.seed_demo_board(uuid) is
  'Creates the pre-filled "Demo: Launch a landing page" board owned by the given user '
  '(4 columns with Done marked is_done, 5 labels, 8 cards, user assigned to 2). Requires '
  'the user''s profile. Returns the board id.';

revoke execute on function private.seed_demo_board(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- card_dependencies
-- ---------------------------------------------------------------------------

create table public.card_dependencies (
  board_id uuid not null,
  blocker_card_id uuid not null,
  blocked_card_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (blocker_card_id, blocked_card_id),
  constraint card_dependencies_not_self check (blocker_card_id <> blocked_card_id),
  -- Both cards belong to the edge's board; deleting either card deletes the edge.
  constraint card_dependencies_blocker_same_board_fkey foreign key (blocker_card_id, board_id)
    references public.cards (id, board_id) on delete cascade,
  constraint card_dependencies_blocked_same_board_fkey foreign key (blocked_card_id, board_id)
    references public.cards (id, board_id) on delete cascade
);

comment on table public.card_dependencies is
  'Edges "blocker_card_id blocks blocked_card_id" between cards of the same board. Acyclic, at '
  'most 20 blockers per card (trigger, SQLSTATE DEP01 / DEP02). Immutable: delete and insert.';
comment on column public.card_dependencies.blocker_card_id is
  'The card that must be finished first (in a done column, or archived) before blocked_card_id can proceed.';
comment on column public.card_dependencies.blocked_card_id is 'The card that waits on blocker_card_id.';
comment on column public.card_dependencies.created_by is 'User who added the dependency (always the inserting user).';

-- The PK (blocker_card_id, blocked_card_id) serves the blocker FK cascade and the cycle walk
-- (outgoing edges of a card). These cover the rest:
-- incoming edges of a card (blocked FK cascade, "what blocks this card", the 20-blocker cap);
create index card_dependencies_blocked_card_id_idx on public.card_dependencies (blocked_card_id);
-- RLS lookups by board and loading a board's graph;
create index card_dependencies_board_id_idx on public.card_dependencies (board_id);
-- FK to auth.users (on delete set null).
create index card_dependencies_created_by_idx on public.card_dependencies (created_by);

-- ---------------------------------------------------------------------------
-- Graph invariants: acyclic, at most 20 blockers per card (see header)
-- ---------------------------------------------------------------------------

create function internal.check_card_dependency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A self-dependency is rejected by card_dependencies_not_self (23514).
  if new.blocker_card_id = new.blocked_card_id then
    return new;
  end if;

  -- Found only for an owner/editor of the board (the cards UPDATE policy applies to row
  -- locks) or a SECURITY DEFINER caller. Otherwise let RLS (42501) or the FK (23503)
  -- reject the row, without taking the board lock.
  perform 1
  from public.cards c
  where c.id = new.blocked_card_id
    and c.board_id = new.board_id
  for key share;

  if not found then
    -- Fail closed: if the caller could still pass the INSERT policy (say a later migration
    -- narrows the cards UPDATE policy), never let the row through unchecked. Same SQLSTATE
    -- as the FK violation it stands in for.
    if public.has_board_role(new.board_id, '{owner,editor}') then
      raise exception 'blocked card not found on this board'
        using errcode = '23503';
    end if;
    return new;
  end if;

  -- Serialise dependency inserts on this board (see the migration header). The two-key
  -- form keeps these locks apart from the single-key AI quota lock.
  perform pg_advisory_xact_lock(84200002, hashtext(new.board_id::text));

  if (select count(*) from public.card_dependencies d
      where d.blocked_card_id = new.blocked_card_id
        -- A duplicate of an existing edge is left to the PK (23505), even on a full card.
        and d.blocker_card_id <> new.blocker_card_id) >= 20 then
    raise exception 'A card can have at most 20 blockers'
      using errcode = 'DEP02';
  end if;

  -- New edge blocker -> blocked closes a cycle iff blocked already reaches blocker.
  -- UNION (not UNION ALL) visits each card once, so the walk terminates on any graph.
  if exists (
    with recursive reachable (card_id) as (
      select new.blocked_card_id
      union
      select d.blocked_card_id
      from public.card_dependencies d
      join reachable r on d.blocker_card_id = r.card_id
    )
    select 1 from reachable where card_id = new.blocker_card_id
  ) then
    raise exception 'dependency would create a cycle'
      using errcode = 'DEP01';
  end if;

  return new;
end;
$$;

comment on function internal.check_card_dependency() is
  'BEFORE INSERT trigger on card_dependencies: rejects edges that would close a cycle (DEP01) '
  'and a 21st blocker of a card (DEP02). Takes a per-board advisory lock so concurrent inserts '
  'cannot race past either check. SECURITY INVOKER: see the migration header for why the '
  'caller''s RLS view is complete.';

revoke execute on function internal.check_card_dependency() from public, anon, authenticated;

create trigger card_dependencies_check
  before insert on public.card_dependencies
  for each row execute function internal.check_card_dependency();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.card_dependencies from anon;
revoke truncate, references, trigger, maintain on table public.card_dependencies from authenticated;
-- Immutable rows: no UPDATE at all (no column is editable).
revoke update on table public.card_dependencies from authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.card_dependencies enable row level security;

create policy "card_dependencies: members can read"
  on public.card_dependencies for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "card_dependencies: owners and editors can create"
  on public.card_dependencies for insert
  to authenticated
  with check (
    public.has_board_role(board_id, '{owner,editor}')
    and created_by = (select auth.uid())
  );

create policy "card_dependencies: owners and editors can delete"
  on public.card_dependencies for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));
