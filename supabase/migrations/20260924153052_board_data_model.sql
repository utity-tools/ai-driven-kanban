-- v0.1 board data model: boards, membership/roles, columns, cards, labels, assignees.
--
-- Authorization model: a user sees a board and everything in it only if they are a
-- member of that board (board_members). Owners manage membership; owners and editors
-- write content; viewers are read-only. The anon role gets nothing.
--
-- Child tables carry a denormalised board_id and use composite foreign keys so that
-- (a) the database guarantees every row points to parents on the same board and
-- (b) RLS policies can check membership with a single indexed lookup, no joins.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.board_role as enum ('owner', 'editor', 'viewer');

-- ---------------------------------------------------------------------------
-- Shared trigger function: keep updated_at current
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------------

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null
    constraint boards_title_length check (char_length(btrim(title)) >= 1 and char_length(title) <= 100),
  -- The creator. Always kept as an 'owner' member (see protect_board_owners()).
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.boards is 'Kanban boards. Access is granted through board_members.';
comment on column public.boards.owner_id is 'User who created the board; always remains an owner member.';

create index boards_owner_id_idx on public.boards (owner_id);

create trigger boards_set_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- board_members
-- ---------------------------------------------------------------------------

create table public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.board_role not null,
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

comment on table public.board_members is 'Who can access a board and with which role.';

-- PK covers board_id lookups (RLS helper, cascades); user_id needs its own index
-- for "boards I belong to" and for cascades when an auth user is deleted.
create index board_members_user_id_idx on public.board_members (user_id);

-- ---------------------------------------------------------------------------
-- Authorization helper
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so policies can read board_members without triggering
-- board_members' own RLS (which would recurse).
create function public.has_board_role(p_board_id uuid, p_roles public.board_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = p_board_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

comment on function public.has_board_role(uuid, public.board_role[]) is
  'True if the current user is a member of the board with one of the given roles.';

revoke execute on function public.has_board_role(uuid, public.board_role[]) from public, anon;
grant execute on function public.has_board_role(uuid, public.board_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Membership triggers
-- ---------------------------------------------------------------------------

-- The creator of a board becomes its owner member.
create function public.handle_new_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger boards_add_owner_member
  after insert on public.boards
  for each row execute function public.handle_new_board();

-- Every board keeps at least one owner, and the creator (boards.owner_id) can never be
-- removed or demoted. Removals caused by deleting the board itself or the user's auth
-- account are allowed (the board / account is going away anyway).
create function public.protect_board_owners()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator_id uuid;
begin
  -- Only removals/demotions of an owner are interesting.
  if old.role <> 'owner'
     or (tg_op = 'UPDATE'
         and new.role = 'owner'
         and new.board_id = old.board_id
         and new.user_id = old.user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Lock the board row so concurrent demotions cannot both pass the check.
  select b.owner_id into v_creator_id
  from public.boards b
  where b.id = old.board_id
  for update;

  -- Board is being deleted (cascade) or the user account is being deleted.
  if not found or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.user_id = v_creator_id then
    raise exception 'The board creator cannot be removed or demoted'
      using errcode = 'restrict_violation';
  end if;

  if not exists (
    select 1
    from public.board_members m
    where m.board_id = old.board_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'A board must keep at least one owner'
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger board_members_protect_owners
  before update or delete on public.board_members
  for each row execute function public.protect_board_owners();

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_board() from public, anon, authenticated;
revoke execute on function public.protect_board_owners() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- board_columns
-- ---------------------------------------------------------------------------

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null
    constraint board_columns_title_length check (char_length(btrim(title)) >= 1 and char_length(title) <= 50),
  -- Fractional-indexing key (base62, e.g. 'a0', 'a0V'). COLLATE "C" = byte order,
  -- which is what fractional indexing assumes. Ties are broken by id.
  position text collate "C" not null
    constraint board_columns_position_format check (position ~ '^[0-9A-Za-z]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_columns_id_board_id_key unique (id, board_id)
);

comment on table public.board_columns is 'Columns of a board. A card''s state is the column it is in.';

create index board_columns_board_id_position_idx on public.board_columns (board_id, position);

create trigger board_columns_set_updated_at
  before update on public.board_columns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  column_id uuid not null,
  title text not null
    constraint cards_title_length check (char_length(btrim(title)) >= 1 and char_length(title) <= 200),
  description text
    constraint cards_description_length check (char_length(description) <= 10000),
  position text collate "C" not null
    constraint cards_position_format check (position ~ '^[0-9A-Za-z]+$'),
  due_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_id_board_id_key unique (id, board_id),
  -- The column must belong to the same board as the card.
  constraint cards_column_same_board_fkey foreign key (column_id, board_id)
    references public.board_columns (id, board_id) on delete cascade
);

comment on table public.cards is 'Cards. No status column: the state of a card is its column.';
comment on column public.cards.description is 'Markdown, max 10000 chars.';
comment on column public.cards.completed_at is 'Set when the due date is marked as done.';
comment on column public.cards.archived_at is 'Archived cards are hidden, not deleted.';

-- Hot path: render the visible cards of a column in order.
create index cards_column_id_position_active_idx on public.cards (column_id, position)
  where archived_at is null;
-- Non-partial index for the composite FK (cascade when a column is deleted,
-- including archived cards) and for listing archived cards.
create index cards_column_id_idx on public.cards (column_id);
create index cards_board_id_idx on public.cards (board_id);
create index cards_created_by_idx on public.cards (created_by);

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- board_labels
-- ---------------------------------------------------------------------------

create table public.board_labels (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  -- Empty name = colour-only label.
  name text not null default ''
    constraint board_labels_name_length check (char_length(name) <= 30),
  color text not null
    constraint board_labels_color_check check (
      color in ('green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black')
    ),
  created_at timestamptz not null default now(),
  constraint board_labels_id_board_id_key unique (id, board_id)
);

comment on table public.board_labels is 'Labels defined per board; name may be empty (colour-only).';

create index board_labels_board_id_idx on public.board_labels (board_id);

-- ---------------------------------------------------------------------------
-- card_labels
-- ---------------------------------------------------------------------------

create table public.card_labels (
  card_id uuid not null,
  label_id uuid not null,
  board_id uuid not null,
  primary key (card_id, label_id),
  constraint card_labels_card_same_board_fkey foreign key (card_id, board_id)
    references public.cards (id, board_id) on delete cascade,
  -- The label must belong to the card's board.
  constraint card_labels_label_same_board_fkey foreign key (label_id, board_id)
    references public.board_labels (id, board_id) on delete cascade
);

comment on table public.card_labels is 'Labels attached to cards (same board enforced by composite FKs).';

create index card_labels_label_id_idx on public.card_labels (label_id);
create index card_labels_board_id_idx on public.card_labels (board_id);

-- ---------------------------------------------------------------------------
-- card_assignees
-- ---------------------------------------------------------------------------

create table public.card_assignees (
  card_id uuid not null,
  user_id uuid not null,
  board_id uuid not null,
  primary key (card_id, user_id),
  constraint card_assignees_card_same_board_fkey foreign key (card_id, board_id)
    references public.cards (id, board_id) on delete cascade,
  -- Only board members can be assigned; removing a member unassigns them.
  constraint card_assignees_member_fkey foreign key (board_id, user_id)
    references public.board_members (board_id, user_id) on delete cascade
);

comment on table public.card_assignees is 'Board members assigned to cards.';

create index card_assignees_board_id_user_id_idx on public.card_assignees (board_id, user_id);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase's default privileges grant everything (including TRUNCATE, which is NOT
-- subject to RLS, and PG17's MAINTAIN) to anon and authenticated. anon gets nothing;
-- authenticated gets DML only, and RLS decides which rows.
revoke all on table
  public.boards, public.board_members, public.board_columns, public.cards,
  public.board_labels, public.card_labels, public.card_assignees
from anon;

revoke truncate, references, trigger, maintain on table
  public.boards, public.board_members, public.board_columns, public.cards,
  public.board_labels, public.card_labels, public.card_assignees
from authenticated;

-- Column-level UPDATE grants: RLS decides *which rows* can be updated, not *which
-- columns*. Without these, an editor could hand the board to someone else by
-- updating boards.owner_id, or rewrite created_by / board_id / membership keys.
revoke update on table public.boards from authenticated;
grant update (title) on table public.boards to authenticated;

revoke update on table public.board_members from authenticated;
grant update (role) on table public.board_members to authenticated;

revoke update on table public.board_columns from authenticated;
grant update (title, position) on table public.board_columns to authenticated;

revoke update on table public.cards from authenticated;
grant update (column_id, title, description, position, due_at, completed_at, archived_at)
  on table public.cards to authenticated;

revoke update on table public.board_labels from authenticated;
grant update (name, color) on table public.board_labels to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.board_columns enable row level security;
alter table public.cards enable row level security;
alter table public.board_labels enable row level security;
alter table public.card_labels enable row level security;
alter table public.card_assignees enable row level security;

-- boards ---------------------------------------------------------------------

-- owner_id is included so INSERT ... RETURNING works: the owner membership row is
-- created by an AFTER trigger, which runs after the RETURNING visibility check.
create policy "boards: members can read"
  on public.boards for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or public.has_board_role(id, '{owner,editor,viewer}')
  );

create policy "boards: users can create their own"
  on public.boards for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "boards: owners and editors can update"
  on public.boards for update
  to authenticated
  using (public.has_board_role(id, '{owner,editor}'))
  with check (public.has_board_role(id, '{owner,editor}'));

create policy "boards: owners can delete"
  on public.boards for delete
  to authenticated
  using (public.has_board_role(id, '{owner}'));

-- board_members --------------------------------------------------------------

create policy "board_members: members can read"
  on public.board_members for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "board_members: owners can add"
  on public.board_members for insert
  to authenticated
  with check (public.has_board_role(board_id, '{owner}'));

create policy "board_members: owners can change roles"
  on public.board_members for update
  to authenticated
  using (public.has_board_role(board_id, '{owner}'))
  with check (public.has_board_role(board_id, '{owner}'));

create policy "board_members: owners can remove, members can leave"
  on public.board_members for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_board_role(board_id, '{owner}')
  );

-- board_columns --------------------------------------------------------------

create policy "board_columns: members can read"
  on public.board_columns for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "board_columns: owners and editors can create"
  on public.board_columns for insert
  to authenticated
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "board_columns: owners and editors can update"
  on public.board_columns for update
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'))
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "board_columns: owners and editors can delete"
  on public.board_columns for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));

-- cards ----------------------------------------------------------------------

create policy "cards: members can read"
  on public.cards for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "cards: owners and editors can create"
  on public.cards for insert
  to authenticated
  with check (
    public.has_board_role(board_id, '{owner,editor}')
    and created_by = (select auth.uid())
  );

create policy "cards: owners and editors can update"
  on public.cards for update
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'))
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "cards: owners and editors can delete"
  on public.cards for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));

-- board_labels ---------------------------------------------------------------

create policy "board_labels: members can read"
  on public.board_labels for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "board_labels: owners and editors can create"
  on public.board_labels for insert
  to authenticated
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "board_labels: owners and editors can update"
  on public.board_labels for update
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'))
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "board_labels: owners and editors can delete"
  on public.board_labels for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));

-- card_labels ----------------------------------------------------------------

create policy "card_labels: members can read"
  on public.card_labels for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "card_labels: owners and editors can create"
  on public.card_labels for insert
  to authenticated
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "card_labels: owners and editors can update"
  on public.card_labels for update
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'))
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "card_labels: owners and editors can delete"
  on public.card_labels for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));

-- card_assignees -------------------------------------------------------------

create policy "card_assignees: members can read"
  on public.card_assignees for select
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor,viewer}'));

create policy "card_assignees: owners and editors can create"
  on public.card_assignees for insert
  to authenticated
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "card_assignees: owners and editors can update"
  on public.card_assignees for update
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'))
  with check (public.has_board_role(board_id, '{owner,editor}'));

create policy "card_assignees: owners and editors can delete"
  on public.card_assignees for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner,editor}'));
