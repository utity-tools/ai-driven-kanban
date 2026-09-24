-- Public user profiles: what the app shows for a user (name, avatar) without reading
-- auth.users, which is not (and must not be) exposed through the API.
--
-- * One row per auth user, created by the sign-up trigger (including anonymous users)
--   and backfilled here for users that already exist.
-- * Kept in sync with auth.users: email always follows; display_name / avatar_url are
--   only filled from provider metadata while still null, so a user-edited name is
--   never overwritten by the next GitHub sign-in.
-- * Visible to the user themselves and to users who share at least one board with
--   them. Clients can only update their own display_name. No client insert/delete.
-- * board_members.user_id and card_assignees.user_id get a second FK to profiles(id)
--   so PostgREST can embed profiles (auth.users is not in an exposed schema).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Null for anonymous (demo) users.
  email text,
  display_name text
    constraint profiles_display_name_format check (
      char_length(btrim(display_name)) between 1 and 80
      and display_name !~ '[[:cntrl:]]'
    ),
  avatar_url text
    constraint profiles_avatar_url_format check (
      avatar_url ~ '^https://[^[:space:][:cntrl:]]+$'
      and char_length(avatar_url) <= 2048
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile of each auth user. Readable by the user and by users sharing a board with them.';
comment on column public.profiles.email is 'Mirrors auth.users.email (null for anonymous users).';
comment on column public.profiles.display_name is
  'Max 80 chars. Seeded from provider metadata (full_name, name, user_name); editable by the user.';
comment on column public.profiles.avatar_url is 'https only. Seeded from provider metadata (avatar_url).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Metadata parsing helper (private schema: not exposed through the API)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Derives display_name / avatar_url from auth.users.raw_user_meta_data. Used by the
-- sign-up and sync triggers and by the backfill below.
--
-- Never raises: it runs inside the sign-up transaction. Anything odd (metadata that is
-- not an object, non-string values, http avatars, blank names) yields null.
--   display_name: first non-blank of full_name, name, user_name (GitHub sets these);
--                 whitespace/control runs collapsed to one space, trimmed, max 80 chars.
--   avatar_url:   trimmed avatar_url, only if https, without whitespace, <= 2048 chars.
-- The results always satisfy the check constraints on public.profiles.
create function private.profile_fields_from_metadata(
  p_meta jsonb,
  out display_name text,
  out avatar_url text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_meta jsonb;
begin
  begin
    v_meta := case when jsonb_typeof(p_meta) = 'object' then p_meta else '{}'::jsonb end;

    display_name := coalesce(
      nullif(btrim(regexp_replace(case when jsonb_typeof(v_meta -> 'full_name') = 'string'
                                       then v_meta ->> 'full_name' end,
                                  '[[:space:][:cntrl:]]+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(case when jsonb_typeof(v_meta -> 'name') = 'string'
                                       then v_meta ->> 'name' end,
                                  '[[:space:][:cntrl:]]+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(case when jsonb_typeof(v_meta -> 'user_name') = 'string'
                                       then v_meta ->> 'user_name' end,
                                  '[[:space:][:cntrl:]]+', ' ', 'g')), '')
    );
    -- Truncating can leave a trailing space.
    display_name := nullif(btrim(left(display_name, 80)), '');

    avatar_url := case when jsonb_typeof(v_meta -> 'avatar_url') = 'string'
                       then btrim(v_meta ->> 'avatar_url') end;
    if avatar_url !~ '^https://[^[:space:][:cntrl:]]+$' or char_length(avatar_url) > 2048 then
      avatar_url := null;
    end if;
  exception when others then
    display_name := null;
    avatar_url := null;
  end;
end;
$$;

comment on function private.profile_fields_from_metadata(jsonb) is
  'Safe display_name / avatar_url extraction from auth user metadata. Never raises.';

revoke execute on function private.profile_fields_from_metadata(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up: profile first, then the default board (replaces the previous version)
-- ---------------------------------------------------------------------------

-- The profile must exist before the default board is created, because the owner
-- membership row (board_members) now references profiles(id).
--
-- Runs inside the sign-up transaction: metadata parsing is delegated to
-- private.profile_fields_from_metadata(), which never raises.
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

  -- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2.
  insert into public.board_columns (board_id, title, position)
  values
    (v_board_id, 'To do', 'a0'),
    (v_board_id, 'In progress', 'a1'),
    (v_board_id, 'Done', 'a2');

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'After sign-up: creates the user''s profile (every user), then a default "My board" with '
  'To do / In progress / Done columns (non-anonymous users only).';

-- create or replace keeps existing grants, but be explicit.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep profiles in sync with auth.users
-- ---------------------------------------------------------------------------

create function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_avatar_url text;
begin
  select f.display_name, f.avatar_url
  into v_display_name, v_avatar_url
  from private.profile_fields_from_metadata(new.raw_user_meta_data) f;

  -- Upsert: also heals a user that somehow has no profile. Only null fields are filled
  -- from metadata, so user edits win; email always mirrors auth.users.
  insert into public.profiles as p (id, email, display_name, avatar_url)
  values (new.id, new.email, v_display_name, v_avatar_url)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(p.display_name, excluded.display_name),
        avatar_url = coalesce(p.avatar_url, excluded.avatar_url)
    where p.email is distinct from excluded.email
       or (p.display_name is null and excluded.display_name is not null)
       or (p.avatar_url is null and excluded.avatar_url is not null);

  return new;
end;
$$;

comment on function public.handle_user_updated() is
  'After an auth user''s email or metadata changes: syncs profiles.email and fills '
  'display_name / avatar_url only while they are still null.';

revoke execute on function public.handle_user_updated() from public, anon, authenticated;

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row
  when (old.email is distinct from new.email
        or old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.handle_user_updated();

-- ---------------------------------------------------------------------------
-- Backfill existing users (must run before the FKs below are added)
-- ---------------------------------------------------------------------------

insert into public.profiles (id, email, display_name, avatar_url, created_at)
select u.id, u.email, f.display_name, f.avatar_url, coalesce(u.created_at, now())
from auth.users u
cross join lateral private.profile_fields_from_metadata(u.raw_user_meta_data) f
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Relationships for PostgREST embedding
-- ---------------------------------------------------------------------------

-- Integrity is already guaranteed by the existing FKs to auth.users / board_members;
-- these exist so the API can embed profiles:
--   board_members  -> profiles   (board header: members)
--   card_assignees -> profiles   (card avatars)
alter table public.board_members
  add constraint board_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.card_assignees
  add constraint card_assignees_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- board_members(user_id) is already indexed (board_members_user_id_idx). card_assignees
-- only had (board_id, user_id); the new FK needs an index led by user_id.
create index card_assignees_user_id_idx on public.card_assignees (user_id);

-- ---------------------------------------------------------------------------
-- Authorization helper
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the profiles policy can read board_members regardless of
-- board_members' own RLS. Uses board_members_user_id_idx for the caller's boards and
-- the (board_id, user_id) primary key for the other user.
create function public.shares_board_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members mine
    join public.board_members theirs on theirs.board_id = mine.board_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

comment on function public.shares_board_with(uuid) is
  'True if the current user and the given user are members of at least one common board.';

revoke execute on function public.shares_board_with(uuid) from public, anon;
grant execute on function public.shares_board_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon;
revoke truncate, references, trigger, maintain on table public.profiles from authenticated;

-- Rows are created and deleted only by the auth.users triggers / FK cascade.
revoke insert, delete on table public.profiles from authenticated;

-- email mirrors auth.users and avatar_url comes from the provider: only the display
-- name is user-editable.
revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "profiles: users read their own and their board co-members'"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.shares_board_with(id)
  );

create policy "profiles: users update their own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert/delete policies: those privileges are revoked above, and without a policy
-- RLS denies them anyway (defence in depth).
