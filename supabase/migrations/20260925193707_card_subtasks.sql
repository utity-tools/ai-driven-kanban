-- v0.2 delivery 2: subtasks, a checklist inside a card.
--
-- Later the AI proposes subtasks and a human accepts them; `source` records who proposed
-- each one ('manual' or 'ai') so acceptance can be measured. Nothing here writes AI output:
-- rows are only created by an explicit user action (or the seed).
--
-- Authorization follows ADR 0004: denormalised board_id + composite FK to cards(id, board_id)
-- (a subtask always lives on its card's board), RLS through public.has_board_role, privileges
-- tightened beyond RLS, column-level UPDATE grants.
--
-- Limit of 100 subtasks per card (guard against runaway inserts, e.g. a buggy client loop or
-- an AI proposal accepted many times):
--   * A CHECK constraint cannot count other rows, so a BEFORE INSERT trigger enforces it.
--     card_id is not updatable, so only INSERT can grow a card's checklist.
--   * The trigger function lives in `internal` (ADR 0007): it is SECURITY INVOKER, so it
--     runs with the inserter's rights and grants nothing. It needs no EXECUTE grant (trigger
--     functions are not called through EXECUTE at run time), so EXECUTE is revoked from all.
--   * Concurrency: two transactions could both count 99 and both insert. The trigger first
--     takes a FOR NO KEY UPDATE lock on the parent card row, which serialises concurrent
--     subtask inserts on the same card only (it does not conflict with the FK's KEY SHARE
--     lock, nor with inserts on other cards). In READ COMMITTED the COUNT that follows takes
--     a fresh snapshot, so it sees the rows committed by the transaction it waited for.
--   * The lock is subject to the caller's RLS: a non-editor finds no card to lock, the count
--     is irrelevant, and the INSERT policy rejects the row right after (42501).
--   * Rows inserted earlier in the same statement are visible to the trigger, so a single
--     multi-row INSERT cannot slip past the limit either.
--   * Error: 23514 (check_violation), like the table's CHECK constraints.

-- ---------------------------------------------------------------------------
-- card_subtasks
-- ---------------------------------------------------------------------------

create table public.card_subtasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  card_id uuid not null,
  title text not null
    constraint card_subtasks_title_length check (char_length(btrim(title)) >= 1 and char_length(title) <= 200),
  estimate smallint
    constraint card_subtasks_estimate_fibonacci check (estimate in (1, 2, 3, 5, 8, 13)),
  -- Fractional-indexing key, same format and byte-order collation as cards.position.
  position text collate "C" not null
    constraint card_subtasks_position_format check (position ~ '^[0-9A-Za-z]+$'),
  completed_at timestamptz,
  source text not null default 'manual'
    constraint card_subtasks_source_check check (source in ('manual', 'ai')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The card must belong to the subtask's board; deleting the card deletes its checklist.
  constraint card_subtasks_card_same_board_fkey foreign key (card_id, board_id)
    references public.cards (id, board_id) on delete cascade
);

comment on table public.card_subtasks is
  'Checklist items of a card (same board enforced by a composite FK). At most 100 per card.';
comment on column public.card_subtasks.title is 'Trimmed length 1-200.';
comment on column public.card_subtasks.estimate is
  'Optional estimate in story points (Fibonacci: 1, 2, 3, 5, 8, 13).';
comment on column public.card_subtasks.position is
  'Fractional-indexing key (base62, COLLATE "C"); order within the card, ties broken by id.';
comment on column public.card_subtasks.completed_at is 'When the subtask was checked; null = not done.';
comment on column public.card_subtasks.source is
  'Who proposed it: manual (typed by a user) or ai (an accepted AI proposal). Not updatable.';
comment on column public.card_subtasks.created_by is 'User who created (or accepted) the subtask.';

-- Hot path: render a card's checklist in order. Also serves the composite FK's cascade
-- (card_id is the leading column).
create index card_subtasks_card_id_position_idx on public.card_subtasks (card_id, position);
-- RLS lookups by board, and per-board queries.
create index card_subtasks_board_id_idx on public.card_subtasks (board_id);
-- FK to auth.users (on delete set null).
create index card_subtasks_created_by_idx on public.card_subtasks (created_by);

create trigger card_subtasks_set_updated_at
  before update on public.card_subtasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Limit: at most 100 subtasks per card (see header)
-- ---------------------------------------------------------------------------

create function internal.enforce_card_subtasks_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialise concurrent inserts on the same card (see the migration header).
  perform 1
  from public.cards c
  where c.id = new.card_id
  for no key update;

  if (select count(*) from public.card_subtasks s where s.card_id = new.card_id) >= 100 then
    raise exception 'A card can have at most 100 subtasks'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function internal.enforce_card_subtasks_limit() is
  'BEFORE INSERT trigger on card_subtasks: rejects the 101st subtask of a card (23514). '
  'Locks the parent card row so concurrent inserts cannot exceed the limit.';

revoke execute on function internal.enforce_card_subtasks_limit() from public, anon, authenticated;

create trigger card_subtasks_enforce_limit
  before insert on public.card_subtasks
  for each row execute function internal.enforce_card_subtasks_limit();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.card_subtasks from anon;
revoke truncate, references, trigger, maintain on table public.card_subtasks from authenticated;

-- board_id / card_id (no moving between cards or boards), source (keeps AI metrics honest)
-- and created_by are fixed at insert time.
revoke update on table public.card_subtasks from authenticated;
grant update (title, estimate, position, completed_at) on table public.card_subtasks to authenticated;

-- Not in the supabase_realtime publication: Realtime arrives in v0.3.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.card_subtasks enable row level security;

create policy "card_subtasks: members can read"
  on public.card_subtasks for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "card_subtasks: owners and editors can create"
  on public.card_subtasks for insert
  to authenticated
  with check (
    public.has_board_role(board_id, '{owner,editor}')
    and created_by = (select auth.uid())
  );

create policy "card_subtasks: owners and editors can update"
  on public.card_subtasks for update
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'))
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "card_subtasks: owners and editors can delete"
  on public.card_subtasks for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));
