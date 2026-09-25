-- v0.1 delivery 6: demo mode.
--
-- "Try the demo" signs the visitor in with supabase.auth.signInAnonymously(), which inserts
-- an auth.users row with is_anonymous = true. The sign-up trigger now gives that user a
-- pre-filled demo board, in the same transaction as the insert (no half-seeded demo).
--
-- * private.seed_demo_board(user_id): creates the demo board (columns, labels, cards, due
--   dates, the visitor assigned to two cards). SECURITY DEFINER, not callable by API roles.
-- * public.handle_new_user(): unchanged for permanent users (profile + "My board").
--   Anonymous users get a profile named "Demo visitor" (unless their metadata has a name)
--   and the demo board instead of "My board".
-- * private.delete_expired_demo_users(): deletes anonymous users older than 7 days: first
--   the boards they own (and everything on them), then the users (FK cascades remove their
--   profile and memberships). Scheduled daily with pg_cron ('delete-expired-demo-users',
--   03:17 UTC).
--
-- Anonymous users are 'authenticated' in PostgREST, so the existing RLS (ADR 0004)
-- applies unchanged: a visitor owns their demo board and sees nobody else's.

-- ---------------------------------------------------------------------------
-- Demo board
-- ---------------------------------------------------------------------------

-- Called from handle_new_user(), i.e. inside the sign-up transaction: any error blocks the
-- anonymous sign-in. Only constant, valid values (they satisfy every check constraint) and
-- dates relative to current_date; no lookups.
--
-- Requires the user's profile to exist (board_members and card_assignees reference
-- profiles). There is no auth.uid() during sign-up, so owner_id is set explicitly; the
-- boards_add_owner_member trigger then adds the user as owner member, which is what makes
-- the card_assignees rows below valid.
--
-- cards.created_by is null: the visitor did not write these cards, the system did. Cards
-- the visitor adds later do carry their id; delete_expired_demo_users() handles both.
create function private.seed_demo_board(p_user_id uuid)
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
  insert into public.board_columns (id, board_id, title, position)
  values
    (v_backlog, v_board_id, 'Backlog', 'a0'),
    (v_todo, v_board_id, 'To do', 'a1'),
    (v_doing, v_board_id, 'In progress', 'a2'),
    (v_done, v_board_id, 'Done', 'a3');

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
  '(4 columns, 5 labels, 8 cards, user assigned to 2). Requires the user''s profile. '
  'Returns the board id.';

revoke execute on function private.seed_demo_board(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user: anonymous users get the demo board
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

  -- Anonymous users have no email or provider name; the demo board assigns them to cards,
  -- so give them a readable name.
  if new.is_anonymous is true then
    v_display_name := coalesce(v_display_name, 'Demo visitor');
  end if;

  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, new.email, v_display_name, v_avatar_url)
  on conflict (id) do nothing;

  if new.is_anonymous is true then
    perform private.seed_demo_board(new.id);
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
  'To do / In progress / Done columns (permanent users) or the pre-filled demo board '
  '(anonymous users, see private.seed_demo_board).';

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cleanup of expired demo users
-- ---------------------------------------------------------------------------

-- Two steps over one set of users, so the result does not depend on the order in which
-- Postgres runs the FK cascades from auth.users:
--   1. Delete the boards they own: columns, cards, labels, card labels, memberships and
--      assignments go with them (cascades that only delete).
--   2. Delete the users: auth.identities / sessions, public.profiles and any remaining
--      memberships cascade; cards.created_by on other boards is set to null.
-- Deleting the user in one step also cascades to the boards, but then the ON DELETE SET
-- NULL on cards.created_by can run after the card's column is gone. Postgres re-checks the
-- cards -> board_columns FK for rows inserted in the current transaction, so that order
-- fails there; step 1 removes those cards before any SET NULL can touch them.
--
-- The users are captured once (row-locked) and both deletes use that set. Permanent users
-- (including converted anonymous users, whose is_anonymous is false) are never touched.
-- protect_board_owners() allows the owner removals caused by deleting the board.
create function private.delete_expired_demo_users()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_ids uuid[];
  v_deleted integer;
begin
  select coalesce(array_agg(u.id), '{}')
  into v_user_ids
  from (
    select u.id
    from auth.users u
    where u.is_anonymous is true
      and u.created_at < now() - interval '7 days'
    for update
  ) u;

  delete from public.boards b
  where b.owner_id = any (v_user_ids);

  delete from auth.users u
  where u.id = any (v_user_ids);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function private.delete_expired_demo_users() is
  'Deletes anonymous (demo) users created more than 7 days ago: first the boards they own, '
  'then the users (FK cascades remove the rest). Returns the number of users deleted. '
  'Run daily by pg_cron.';

revoke execute on function private.delete_expired_demo_users() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily schedule (pg_cron)
-- ---------------------------------------------------------------------------

-- The Supabase way to enable pg_cron (its objects live in the "cron" schema).
create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule() with a job name upserts: re-running it updates the existing job instead
-- of adding a duplicate. 03:17 UTC: a quiet hour, off the :00 mark other jobs use.
select cron.schedule(
  'delete-expired-demo-users',
  '17 3 * * *',
  'select private.delete_expired_demo_users()'
);
