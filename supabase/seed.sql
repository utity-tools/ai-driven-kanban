-- Local and CI seed data. Runs after migrations on `pnpm db:reset`.
-- Never runs against staging or prod.
--
-- Demo accounts (password: password123, emails confirmed):
--   alice@example.com  "Alice Martin", owner of "Demo board"
--   bob@example.com    "Bob Chen", editor on "Demo board"
--
-- Like any real sign-up, inserting Alice and Bob into auth.users runs the
-- on_auth_user_created trigger, which:
--   * creates their public.profiles row (display_name comes from full_name in the
--     metadata below; no avatar_url, so the UI falls back to initials), and
--   * gives each of them an empty default "My board" (To do / In progress / Done).

-- ---------------------------------------------------------------------------
-- Auth users + email identities
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now(),
  now(),
  '', '', '', '', '', '', '', ''
from (
  values
    ('a11ce000-0000-4000-8000-000000000001'::uuid, 'alice@example.com', 'Alice Martin'),
    ('b0b00000-0000-4000-8000-000000000002'::uuid, 'bob@example.com', 'Bob Chen')
) as u (id, email, full_name);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(),
  now(),
  now()
from auth.users u
where u.email in ('alice@example.com', 'bob@example.com');

-- ---------------------------------------------------------------------------
-- Demo board (the AFTER INSERT trigger makes Alice its owner member)
-- ---------------------------------------------------------------------------
-- Alice = a11ce000-...-001, Bob = b0b00000-...-002

insert into public.boards (id, title, owner_id)
values ('b0a4d000-0000-4000-8000-000000000001', 'Demo board', 'a11ce000-0000-4000-8000-000000000001');

insert into public.board_members (board_id, user_id, role)
values ('b0a4d000-0000-4000-8000-000000000001', 'b0b00000-0000-4000-8000-000000000002', 'editor');

-- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2, ...
insert into public.board_columns (id, board_id, title, position)
values
  ('c0100000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001', 'To do', 'a0'),
  ('c0100000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001', 'In progress', 'a1'),
  ('c0100000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001', 'Review', 'a2'),
  ('c0100000-0000-4000-8000-000000000004', 'b0a4d000-0000-4000-8000-000000000001', 'Done', 'a3');

-- The last label is colour-only (empty name).
insert into public.board_labels (id, board_id, name, color)
values
  ('1abe1000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001', 'frontend', 'blue'),
  ('1abe1000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001', 'backend', 'purple'),
  ('1abe1000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001', 'bug', 'red'),
  ('1abe1000-0000-4000-8000-000000000004', 'b0a4d000-0000-4000-8000-000000000001', 'design', 'pink'),
  ('1abe1000-0000-4000-8000-000000000005', 'b0a4d000-0000-4000-8000-000000000001', '', 'green');

-- Due dates are date-only (cards.due_on) and relative to the reset date, so "overdue" /
-- "due soon" stay true: card 5 overdue (2 days ago), card 4 due tomorrow (due soon),
-- card 9 done (due 3 days ago, completed_at set), cards 2 and 8 due later, the rest have
-- no due date. Card 11 is archived.
insert into public.cards (
  id, board_id, column_id, title, description, position, due_on, completed_at, archived_at, created_by
)
values
  -- To do
  ('ca4d0000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000001', 'Add keyboard shortcuts for moving cards',
   null, 'a0', null, null, null, 'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000001', 'Rate-limit the AI proposal endpoint',
   E'Protect the model budget from abuse.\n\n' ||
   E'- Per-user limit: **10 proposals / hour**\n' ||
   E'- Return `429` with a `Retry-After` header\n' ||
   E'- Log rejected requests (no user text in logs)',
   'a1', current_date + 10, null, null, 'b0b00000-0000-4000-8000-000000000002'),
  ('ca4d0000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000001', 'Empty state for boards without cards',
   'Friendly illustration plus a "Create your first card" call to action.',
   'a2', null, null, null, 'a11ce000-0000-4000-8000-000000000001'),

  -- In progress
  ('ca4d0000-0000-4000-8000-000000000004', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000002', 'Drag and drop cards between columns',
   E'Use **dnd-kit** and persist the order with fractional indexing keys.\n\n' ||
   E'### Acceptance criteria\n\n' ||
   E'- [x] Reorder within a column\n' ||
   E'- [ ] Move to another column\n' ||
   E'- [ ] Keyboard accessible (see the shortcuts card)',
   'a0', current_date + 1, null, null, 'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000005', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000002', 'Card order resets after refreshing the page',
   E'**Steps to reproduce**\n\n' ||
   E'1. Move a card to the top of *To do*\n' ||
   E'2. Refresh the page\n\n' ||
   E'**Expected:** the card stays on top. **Actual:** it goes back to its old position.',
   'a1', current_date - 2, null, null, 'b0b00000-0000-4000-8000-000000000002'),
  ('ca4d0000-0000-4000-8000-000000000006', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000002', 'Spike: Supabase Realtime for live board updates',
   null, 'a2', null, null, null, 'b0b00000-0000-4000-8000-000000000002'),

  -- Review
  ('ca4d0000-0000-4000-8000-000000000007', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000003', 'Show board members in the header',
   E'Overlapping avatars, initials as a fallback, `+N` after four members.',
   'a0', null, null, null, 'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000008', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000003', 'pgTAP tests for label and assignee policies',
   null, 'a1', current_date + 5, null, null, 'b0b00000-0000-4000-8000-000000000002'),

  -- Done
  ('ca4d0000-0000-4000-8000-000000000009', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000004', 'Create the board data model',
   E'Boards, members with roles, columns, cards, labels and assignees. See ADR 0004.',
   'a0', current_date - 3, now() - interval '4 days', null, 'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-00000000000a', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000004', 'Sign in with GitHub',
   null, 'a1', null, null, null, 'a11ce000-0000-4000-8000-000000000001'),

  -- Archived (hidden from the board)
  ('ca4d0000-0000-4000-8000-00000000000b', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000004', 'Evaluate other Kanban libraries',
   null, 'a2', null, null, now() - interval '5 days', 'b0b00000-0000-4000-8000-000000000002');

insert into public.card_labels (card_id, label_id, board_id)
select c.card_id::uuid, c.label_id::uuid, 'b0a4d000-0000-4000-8000-000000000001'
from (
  values
    -- 1: frontend
    ('ca4d0000-0000-4000-8000-000000000001', '1abe1000-0000-4000-8000-000000000001'),
    -- 2: backend
    ('ca4d0000-0000-4000-8000-000000000002', '1abe1000-0000-4000-8000-000000000002'),
    -- 3: design, frontend
    ('ca4d0000-0000-4000-8000-000000000003', '1abe1000-0000-4000-8000-000000000004'),
    ('ca4d0000-0000-4000-8000-000000000003', '1abe1000-0000-4000-8000-000000000001'),
    -- 4: frontend
    ('ca4d0000-0000-4000-8000-000000000004', '1abe1000-0000-4000-8000-000000000001'),
    -- 5: bug, frontend
    ('ca4d0000-0000-4000-8000-000000000005', '1abe1000-0000-4000-8000-000000000003'),
    ('ca4d0000-0000-4000-8000-000000000005', '1abe1000-0000-4000-8000-000000000001'),
    -- 6: backend, green (colour-only)
    ('ca4d0000-0000-4000-8000-000000000006', '1abe1000-0000-4000-8000-000000000002'),
    ('ca4d0000-0000-4000-8000-000000000006', '1abe1000-0000-4000-8000-000000000005'),
    -- 7: frontend, design
    ('ca4d0000-0000-4000-8000-000000000007', '1abe1000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-000000000007', '1abe1000-0000-4000-8000-000000000004'),
    -- 8: no labels
    -- 9: backend
    ('ca4d0000-0000-4000-8000-000000000009', '1abe1000-0000-4000-8000-000000000002'),
    -- 10: frontend, backend, green
    ('ca4d0000-0000-4000-8000-00000000000a', '1abe1000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-00000000000a', '1abe1000-0000-4000-8000-000000000002'),
    ('ca4d0000-0000-4000-8000-00000000000a', '1abe1000-0000-4000-8000-000000000005')
) as c (card_id, label_id);

insert into public.card_assignees (card_id, user_id, board_id)
select a.card_id::uuid, a.user_id::uuid, 'b0a4d000-0000-4000-8000-000000000001'
from (
  values
    -- Alice: 3, 7, 9, 10; Bob: 2, 5, 8; both: 4; nobody: 1, 6
    ('ca4d0000-0000-4000-8000-000000000003', 'a11ce000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-000000000007', 'a11ce000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-000000000009', 'a11ce000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-000000000002', 'b0b00000-0000-4000-8000-000000000002'),
    ('ca4d0000-0000-4000-8000-000000000005', 'b0b00000-0000-4000-8000-000000000002'),
    ('ca4d0000-0000-4000-8000-000000000008', 'b0b00000-0000-4000-8000-000000000002'),
    ('ca4d0000-0000-4000-8000-000000000004', 'a11ce000-0000-4000-8000-000000000001'),
    ('ca4d0000-0000-4000-8000-000000000004', 'b0b00000-0000-4000-8000-000000000002')
) as a (card_id, user_id);
