-- v0.3 delivery 3a: board invitations (DB layer). The UI comes in a later PR.
--
-- An owner creates a single-use invite link for the role editor or viewer. The link carries a
-- random token; whoever opens it while signed in with a permanent account can join the board
-- with that role, once, within 7 days.
--
-- * public.board_invites: one row per invite. Only the SHA-256 hash of the token is stored;
--   the plaintext is returned once by create_board_invite() and never persisted, so a
--   database leak (backup, log, SELECT by an owner) cannot be replayed as a link.
--   - role is public.board_role restricted to editor/viewer by a CHECK: an invite never
--     grants 'owner' (owners promote members later, through the board_members policies).
--   - created_by cascades with the inviter's auth account: an invite is "the inviter vouches
--     for whoever holds this link"; once the inviter is gone the voucher is gone too.
--   - accepted_by is SET NULL when the acceptor's account is deleted (the invite stays used:
--     accepted_at is the source of truth for "used"), hence the one-way consistency check
--     "accepted_by requires accepted_at".
--   - Revoking an invite = deleting its row (owners only, through RLS).
--
-- * Privileges / RLS (ADR 0004):
--   - anon: nothing. authenticated: SELECT and DELETE only, rows limited by RLS to owners of
--     the invite's board. No INSERT/UPDATE grant or policy: invites are created and accepted
--     only through the RPCs below, which own the token generation, the pending-invite cap
--     and the atomic accept.
--   - token_hash is excluded from the column-level SELECT grant, so no client can read it,
--     not even an owner. Consequence for the app: select explicit columns; `select=*` on
--     board_invites fails with 42501 (permission denied), because * includes token_hash.
--
-- * public.create_board_invite(p_board_id, p_role) -> (invite_id, token, expires_at)
-- * public.get_board_invite(p_token) -> 0 or 1 row describing the invite (peek, for the
--   /invite/[token] page before the user clicks "Join")
-- * public.accept_board_invite(p_token) -> board_id
--   Each is a thin SECURITY DEFINER wrapper around a private.* SECURITY DEFINER function,
--   the same shape as public.accept_ai_subtasks (20260928143151_accept_ai_subtasks.sql):
--   the wrapper is the only way to reach private without granting EXECUTE on it. The work
--   needs definer rights because it reads token_hash (not granted), inserts invites and
--   memberships (no INSERT grant/policy for the invitee) and marks invites used (no UPDATE).
--
-- * Custom SQLSTATEs, same style as AIQ01/AIQ02 and DEP01/DEP02:
--     INV01  invite not found (unknown, malformed or revoked token)
--     INV02  invite expired
--     INV03  invite already used
--     INV04  demo (anonymous) accounts cannot create or accept invites
--     INV05  the board already has 20 pending invites
--   plus 42501 (no session; or "Board not found" when the caller is not an owner) and 23514
--   (role other than editor/viewer). Distinguishing INV01/INV02/INV03 does not leak anything
--   useful: the token is a 256-bit secret, so only someone who holds a real link can tell
--   "expired" from "used", and that person should get an actionable message ("ask for a new
--   link") instead of a generic one.
--
-- * Already a member: accept_board_invite() returns the board id WITHOUT consuming the invite
--   and WITHOUT changing the caller's role (no promotion, and above all no demotion of an
--   owner who opens an editor/viewer link). Rationale: the common case is the inviter or a
--   co-member clicking the link (to test it, or because it was pasted in a shared channel);
--   burning it would silently deny the person it was meant for. Not consuming it grants
--   nothing new: the link was already a live bearer token until expiry. This check runs
--   before the used/expired checks, so a member who opens an old link is simply sent to
--   the board.
--
-- * Former owners: when an owner is demoted or leaves/is removed, their still-pending
--   invites on that board are deleted (trigger below), so a link cannot outlive the
--   inviter's authority. Used invites are kept as the record of who invited whom.
--
-- * Removed members can rejoin through a still-pending invite (conscious choice): an invite
--   is a bearer link, not bound to a person, so whoever holds a pending link can join,
--   including someone an owner removed earlier. Owners who remove someone should also revoke
--   the invites that person could hold. Binding invites to an email was considered and
--   deferred (the app has no outgoing email). Pinned by a pgTAP test.
--
-- * Member management needed no new policies: 20260924153052_board_data_model.sql already
--   lets owners change roles (column-level UPDATE grant on role only) and remove members,
--   lets any member delete their own membership (leave), protects the creator and the last
--   owner (protect_board_owners trigger) and unassigns removed members from cards
--   (card_assignees_member_fkey cascades). supabase/tests/database/13_board_invites.test.sql
--   covers all of it.
--
-- Tokens: 32 bytes from extensions.gen_random_bytes (pgcrypto, CSPRNG), encoded as
-- unpadded base64url (43 chars, URL-safe, shorter than 64 hex chars). PG17 has no
-- 'base64url' encoding, so it is built with translate(). Hash: sha256() (core Postgres) of
-- the token's UTF-8 bytes. Lookups by hash use the unique index, so no timing side channel
-- on the token itself.

-- ---------------------------------------------------------------------------
-- board_invites
-- ---------------------------------------------------------------------------

create table public.board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  role public.board_role not null
    constraint board_invites_role_check check (role in ('editor', 'viewer')),
  token_hash bytea not null
    constraint board_invites_token_hash_key unique
    constraint board_invites_token_hash_length check (octet_length(token_hash) = 32),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  constraint board_invites_expires_after_created check (expires_at > created_at),
  -- accepted_by may become null later (account deleted); accepted_at stays and means "used".
  constraint board_invites_accepted_consistency check (accepted_by is null or accepted_at is not null)
);

comment on table public.board_invites is
  'Single-use invite links to a board (role editor or viewer, 7-day expiry). Only the SHA-256 '
  'of the token is stored. Created and accepted only through create_board_invite / '
  'accept_board_invite; owners can list and revoke (delete) them.';
comment on column public.board_invites.token_hash is
  'sha256 of the plaintext token (UTF-8). Not readable by API roles (column-level grant).';
comment on column public.board_invites.accepted_at is 'Set when the invite is used. Non-null = used.';
comment on column public.board_invites.accepted_by is 'Who used the invite (null if pending or their account was deleted).';

-- RLS lookups, FK cascade from boards, the pending-invite cap and the former-owner cleanup.
create index board_invites_board_id_idx on public.board_invites (board_id);
-- FK cascades from auth.users.
create index board_invites_created_by_idx on public.board_invites (created_by);
create index board_invites_accepted_by_idx on public.board_invites (accepted_by);

-- ---------------------------------------------------------------------------
-- Former owners' pending invites are revoked
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: the user who leaves is no longer an owner once their row is gone, so
-- RLS would not let them delete these invites as themselves.
create function private.revoke_invites_of_former_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return null;
  end if;

  delete from public.board_invites i
  where i.board_id = old.board_id
    and i.created_by = old.user_id
    and i.accepted_at is null;

  return null;
end;
$$;

comment on function private.revoke_invites_of_former_owner() is
  'AFTER UPDATE OF role / DELETE trigger on board_members: when an owner is demoted or leaves, '
  'deletes the pending invites they created on that board.';

revoke execute on function private.revoke_invites_of_former_owner() from public, anon, authenticated;

-- "update of role" on purpose: board_id and user_id are not client-updatable (the only
-- column-level UPDATE grant on board_members is role), so a role change is the only way an
-- existing row can stop being an owner.
create trigger board_members_revoke_invites_of_former_owner
  after update of role or delete on public.board_members
  for each row
  when (old.role = 'owner')
  execute function private.revoke_invites_of_former_owner();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.board_invites from anon;
revoke truncate, references, trigger, maintain on table public.board_invites from authenticated;
-- Created and accepted only through the RPCs.
revoke insert, update on table public.board_invites from authenticated;
-- Every column except token_hash.
revoke select on table public.board_invites from authenticated;
grant select (id, board_id, role, created_by, created_at, expires_at, accepted_by, accepted_at)
  on table public.board_invites to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.board_invites enable row level security;

create policy "board_invites: owners can read"
  on public.board_invites for select
  to authenticated
  using (public.has_board_role(board_id, '{owner}'));

create policy "board_invites: owners can revoke"
  on public.board_invites for delete
  to authenticated
  using (public.has_board_role(board_id, '{owner}'));

-- No insert/update policies: those privileges are revoked above, and without a policy RLS
-- denies them anyway (defence in depth).

-- ---------------------------------------------------------------------------
-- Token helpers
-- ---------------------------------------------------------------------------

-- Null for anything that is not a well-formed token (43 base64url chars), so garbage input
-- is never hashed and simply behaves as "not found".
create function private.board_invite_token_hash(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select case
    when p_token ~ '^[A-Za-z0-9_-]{43}$' then pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
  end;
$$;

comment on function private.board_invite_token_hash(text) is
  'sha256 of a well-formed invite token (43 base64url chars); null for anything else.';

revoke execute on function private.board_invite_token_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_board_invite
-- ---------------------------------------------------------------------------

create function private.create_board_invite(p_board_id uuid, p_role public.board_role)
returns table(invite_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
  v_invite public.board_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to invite people'
      using errcode = 'insufficient_privilege';
  end if;

  if (select auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'Demo accounts cannot invite people. Create an account first.'
      using errcode = 'INV04';
  end if;

  -- Ownership is checked with a row lock, not public.has_board_role(): a plain read would
  -- race with a concurrent demotion/removal of the caller. That transaction's trigger
  -- (revoke_invites_of_former_owner) deletes the pending invites it can see, then it
  -- commits, and an invite created here in the meantime would survive as a live link from a
  -- former owner. FOR SHARE conflicts with the UPDATE/DELETE of the membership row:
  --   * if the demotion came first, we wait for it and then (READ COMMITTED re-checks the
  --     locked row) no longer find an owner row -> 'Board not found';
  --   * if we came first, the demotion waits for this transaction and its trigger then
  --     sees and deletes the new invite.
  -- "doesn't exist" and "not an owner" stay indistinguishable on purpose.
  perform 1
  from public.board_members m
  where m.board_id = p_board_id
    and m.user_id = v_uid
    and m.role = 'owner'
  for share;

  if not found then
    raise exception 'Board not found'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role is null or p_role not in ('editor', 'viewer') then
    raise exception 'Invites can only grant the editor or viewer role'
      using errcode = 'check_violation';
  end if;

  -- Serialise invite creation per board so two concurrent calls cannot both pass the cap.
  -- Key family 84200003, next to the AI quota (84200001) and dependency (84200002) locks.
  perform pg_advisory_xact_lock(84200003, hashtext(p_board_id::text));

  if (select count(*) from public.board_invites i
      where i.board_id = p_board_id
        and i.accepted_at is null
        and i.expires_at > now()) >= 20 then
    raise exception 'This board already has 20 pending invites. Revoke some before creating more.'
      using errcode = 'INV05';
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  insert into public.board_invites (board_id, role, token_hash, created_by)
  values (p_board_id, p_role, private.board_invite_token_hash(v_token), v_uid)
  returning * into v_invite;

  return query select v_invite.id, v_token, v_invite.expires_at;
end;
$$;

comment on function private.create_board_invite(uuid, public.board_role) is
  'Creates a single-use invite (editor or viewer, 7 days) on a board the caller owns and '
  'returns the plaintext token once. Not exposed: called only from public.create_board_invite.';

revoke execute on function private.create_board_invite(uuid, public.board_role) from public, anon, authenticated;

create function public.create_board_invite(p_board_id uuid, p_role public.board_role)
returns table(invite_id uuid, token text, expires_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from private.create_board_invite(p_board_id, p_role);
$$;

comment on function public.create_board_invite(uuid, public.board_role) is
  'Owners only, permanent accounts only: creates a single-use invite link (role editor or '
  'viewer, expires in 7 days) and returns (invite_id, token, expires_at). The token is shown '
  'once; only its hash is stored. Errors: 42501 not signed in / Board not found, INV04 demo '
  'account, 23514 role not editor/viewer, INV05 20 pending invites. Use .rpc(...).single().';

revoke execute on function public.create_board_invite(uuid, public.board_role) from public, anon;
grant execute on function public.create_board_invite(uuid, public.board_role) to authenticated;

-- ---------------------------------------------------------------------------
-- get_board_invite (peek)
-- ---------------------------------------------------------------------------

-- Callable by any signed-in user, demo (anonymous) users included, so the invite page can
-- tell a demo visitor "create an account to join <board>" instead of a dead end. That shows
-- the board title to a demo user holding the link, which is fine: the link is a secret the
-- inviter chose to share. anon (no session) cannot call it: the page sends visitors to
-- sign in first.
--
-- Board title, board id and inviter are only revealed while the invite is pending, or to
-- a caller who is already a member of the board. Someone holding an old (used or expired)
-- link learns only that it is used or expired, not which board it was for.
-- Unknown, malformed or revoked tokens return no row (not an error).
--
-- Result contract (generated TypeScript types say `string` for all text columns and do not
-- mark any as nullable; the app should Zod-parse the row):
--   status        'pending' | 'expired' | 'accepted' (never null)
--   role          'editor' | 'viewer'; expires_at, is_member: never null
--   board_id      uuid | null   (null unless the caller is a member)
--   board_title   text | null   (null unless pending or the caller is a member)
--   inviter_name  text | null   (also null when the inviter has no display name)
create function private.get_board_invite(p_token text)
returns table(
  status text,
  role public.board_role,
  expires_at timestamptz,
  is_member boolean,
  board_id uuid,
  board_title text,
  inviter_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'You must be signed in to view an invite'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with invite as (
    select
      i.*,
      case
        when i.accepted_at is not null then 'accepted'
        when i.expires_at <= now() then 'expired'
        else 'pending'
      end as status,
      exists (
        select 1 from public.board_members m
        where m.board_id = i.board_id and m.user_id = v_uid
      ) as is_member
    from public.board_invites i
    where i.token_hash = private.board_invite_token_hash(p_token)
  )
  select
    inv.status,
    inv.role,
    inv.expires_at,
    inv.is_member,
    case when inv.is_member then inv.board_id end,
    case when inv.status = 'pending' or inv.is_member then b.title end,
    case when inv.status = 'pending' or inv.is_member then p.display_name end
  from invite inv
  join public.boards b on b.id = inv.board_id
  left join public.profiles p on p.id = inv.created_by;
end;
$$;

comment on function private.get_board_invite(text) is
  'Describes an invite by token for the invite page. Not exposed: called only from '
  'public.get_board_invite.';

revoke execute on function private.get_board_invite(text) from public, anon, authenticated;

create function public.get_board_invite(p_token text)
returns table(
  status text,
  role public.board_role,
  expires_at timestamptz,
  is_member boolean,
  board_id uuid,
  board_title text,
  inviter_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_board_invite(p_token);
$$;

comment on function public.get_board_invite(text) is
  'Peek at an invite before accepting it. Any signed-in user (demo users included). Returns '
  'no row for an unknown/malformed/revoked token, else one row: status (pending | expired | '
  'accepted), role, expires_at, is_member (caller already on the board); board_id only for '
  'members; board_title and inviter_name (display name only, never the email) while pending or '
  'for members. Errors: 42501 not signed in. Use .rpc(...).maybeSingle().';

revoke execute on function public.get_board_invite(text) from public, anon;
grant execute on function public.get_board_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_board_invite
-- ---------------------------------------------------------------------------

create function private.accept_board_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.board_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept an invite'
      using errcode = 'insufficient_privilege';
  end if;

  if (select auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'Demo accounts cannot join boards. Create an account to accept this invite.'
      using errcode = 'INV04';
  end if;

  -- Row lock: of two concurrent accepts of the same token, the second waits here and then
  -- sees the first one's accepted_at (READ COMMITTED re-reads the locked row), so it fails
  -- with INV03 instead of adding a second member.
  select * into v_invite
  from public.board_invites i
  where i.token_hash = private.board_invite_token_hash(p_token)
  for update;

  if not found then
    raise exception 'Invite not found. It may have been revoked.'
      using errcode = 'INV01';
  end if;

  -- Already a member: send them to the board, keep their role, keep the invite unused
  -- (see migration header).
  if exists (
    select 1 from public.board_members m
    where m.board_id = v_invite.board_id and m.user_id = v_uid
  ) then
    return v_invite.board_id;
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used. Ask the board owner for a new link.'
      using errcode = 'INV03';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'This invite has expired. Ask the board owner for a new link.'
      using errcode = 'INV02';
  end if;

  insert into public.board_members (board_id, user_id, role)
  values (v_invite.board_id, v_uid, v_invite.role)
  on conflict (board_id, user_id) do nothing;

  -- Joined concurrently through another invite of the same board: same as already a member.
  if not found then
    return v_invite.board_id;
  end if;

  update public.board_invites i
  set accepted_by = v_uid,
      accepted_at = now()
  where i.id = v_invite.id;

  return v_invite.board_id;
end;
$$;

comment on function private.accept_board_invite(text) is
  'Joins the caller to the invite''s board with the invite''s role and marks the invite used, '
  'atomically. Not exposed: called only from public.accept_board_invite.';

revoke execute on function private.accept_board_invite(text) from public, anon, authenticated;

create function public.accept_board_invite(p_token text)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select private.accept_board_invite(p_token);
$$;

comment on function public.accept_board_invite(text) is
  'Permanent accounts only: joins the board of a pending invite with its role, marks the '
  'invite used, and returns the board id. If the caller is already a member, returns the '
  'board id without consuming the invite or changing their role. Errors: 42501 not signed '
  'in, INV04 demo account, INV01 not found, INV03 already used, INV02 expired.';

revoke execute on function public.accept_board_invite(text) from public, anon;
grant execute on function public.accept_board_invite(text) to authenticated;
