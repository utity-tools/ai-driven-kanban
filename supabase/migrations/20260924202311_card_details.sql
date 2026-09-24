-- v0.1 delivery 4b: card details (due date, labels, assignees).
--
-- * Due dates become DATE-ONLY: cards.due_at (timestamptz) is replaced by cards.due_on
--   (date). "Due Oct 2" means until the end of Oct 2 in the viewer's time zone; a
--   timestamptz made that ambiguous (midnight UTC is Oct 1 in the Americas).
--   Existing values are backfilled as their UTC calendar date. completed_at (the "done"
--   checkbox) is unchanged.
-- * Labels and assignees need no schema change: the policies and grants of
--   20260924153052_board_data_model.sql already cover them (see 07_card_details.test.sql).
-- * The default columns (To do / In progress / Done) were defined twice, in
--   handle_new_user() and create_board(). Both now call internal.add_default_columns().

-- ---------------------------------------------------------------------------
-- cards.due_at (timestamptz) -> cards.due_on (date)
-- ---------------------------------------------------------------------------

alter table public.cards add column due_on date;

-- Rows whose due_at was set through the old API are interpreted as their UTC date.
update public.cards
set due_on = (due_at at time zone 'UTC')::date
where due_at is not null;

-- Nothing depends on due_at except its column-level UPDATE grant, which is dropped
-- with the column (no index, view, policy or constraint references it).
alter table public.cards drop column due_at;

-- A sanity range: catches typos such as year 20261 (and keeps ISO strings 4-digit years,
-- which is what JavaScript's Date and date pickers expect).
alter table public.cards
  add constraint cards_due_on_range
  check (due_on between date '2000-01-01' and date '9999-12-31');

comment on column public.cards.due_on is
  'Date-only due date: the card is due until the end of this day in the viewer''s time zone.';

-- Column-level UPDATE grant: re-grant the full editable list, with due_on instead of
-- due_at (grants reference columns, so the new column is not updatable until granted).
revoke update on table public.cards from authenticated;
grant update (column_id, title, description, position, due_on, completed_at, archived_at)
  on table public.cards to authenticated;

-- ---------------------------------------------------------------------------
-- Default columns: one definition for sign-up and create_board
-- ---------------------------------------------------------------------------

-- Why a new "internal" schema and not "private":
--   create_board() is SECURITY INVOKER, so it runs as the API caller (authenticated),
--   and calling a function requires USAGE on its schema. "private" deliberately grants
--   no USAGE to API roles (it holds definer-only helpers; see 05_profiles.test.sql), and
--   a helper in "public" would be exposed as an RPC endpoint and in the generated types.
--   "internal" is reachable from SQL by authenticated but is NOT an API-exposed schema
--   (config.toml [api].schemas), so it adds no HTTP surface.
--
-- Rules for this schema: only SECURITY INVOKER helpers that grant nothing beyond what the
-- caller could already do with direct statements. Never add it to the exposed schemas.
create schema if not exists internal;

comment on schema internal is
  'SECURITY INVOKER helpers callable from SQL by authenticated (e.g. from public RPCs). '
  'Not exposed through the Data API. Never put SECURITY DEFINER functions here.';

revoke all on schema internal from public, anon;
grant usage on schema internal to authenticated;

-- New functions default to EXECUTE for PUBLIC; in this schema every function must opt in.
alter default privileges in schema internal revoke execute on functions from public;

-- SECURITY INVOKER: runs with the privileges of whoever calls it.
--   * From create_board() (authenticated): board_columns RLS applies, so it only works on
--     boards where the caller is owner or editor, exactly like a direct insert.
--   * From handle_new_user() (SECURITY DEFINER, owned by postgres): runs as the table
--     owner during sign-up, when there is no auth.uid() yet.
create function internal.add_default_columns(p_board_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  -- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2.
  insert into public.board_columns (board_id, title, position)
  values
    (p_board_id, 'To do', 'a0'),
    (p_board_id, 'In progress', 'a1'),
    (p_board_id, 'Done', 'a2');
$$;

comment on function internal.add_default_columns(uuid) is
  'Adds To do / In progress / Done (a0, a1, a2) to a board. SECURITY INVOKER: subject to the '
  'caller''s RLS. Used by handle_new_user() and create_board().';

revoke execute on function internal.add_default_columns(uuid) from public, anon;
grant execute on function internal.add_default_columns(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user (same behaviour; columns come from the shared helper)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid;
  v_display_name text;
  v_avatar_url text;
begin
  select f.display_name, f.avatar_url
  into v_display_name, v_avatar_url
  from private.profile_fields_from_metadata(new.raw_user_meta_data) f;

  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, new.email, v_display_name, v_avatar_url)
  on conflict (id) do nothing;

  if new.is_anonymous is true then
    return new;
  end if;

  -- The boards_add_owner_member trigger adds new.id as the owner member.
  insert into public.boards (title, owner_id)
  values ('My board', new.id)
  returning id into v_board_id;

  perform internal.add_default_columns(v_board_id);

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'After sign-up: creates the user''s profile (every user), then a default "My board" with '
  'To do / In progress / Done columns (non-anonymous users only).';

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_board (same behaviour; columns come from the shared helper)
-- ---------------------------------------------------------------------------

create or replace function public.create_board(p_title text)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_title text := btrim(p_title);
  v_board_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to create a board'
      using errcode = 'insufficient_privilege';
  end if;

  -- Same rules as boards_title_length, applied to the trimmed title (which is what is
  -- stored), with an error message the UI can show.
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 100 then
    raise exception 'Board title must be between 1 and 100 characters'
      using errcode = 'check_violation',
            hint = 'Leading and trailing spaces are ignored.';
  end if;

  -- owner_id defaults to auth.uid(); the "users can create their own" policy checks it
  -- and the boards_add_owner_member trigger adds the caller as owner member, so the
  -- column inserts done by the helper pass the owner/editor policy.
  insert into public.boards (title)
  values (v_title)
  returning id into v_board_id;

  perform internal.add_default_columns(v_board_id);

  return v_board_id;
end;
$$;

comment on function public.create_board(text) is
  'Creates a board owned by the caller with To do / In progress / Done columns. '
  'Title is trimmed and must be 1-100 characters (raises 23514 otherwise).';

revoke execute on function public.create_board(text) from public, anon;
grant execute on function public.create_board(text) to authenticated;
