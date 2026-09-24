-- Local and CI seed data. Runs after migrations on `pnpm db:reset`.
-- Never runs against staging or prod.
--
-- Demo accounts (password: password123, emails confirmed):
--   alice@example.com  owner of "Demo board"
--   bob@example.com    editor on "Demo board"
--
-- Like any real sign-up, inserting Alice and Bob into auth.users also gives each of
-- them an empty default "My board" (To do / In progress / Done) via the
-- on_auth_user_created trigger.

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
  jsonb_build_object('name', u.name),
  now(),
  now(),
  '', '', '', '', '', '', '', ''
from (
  values
    ('a11ce000-0000-4000-8000-000000000001'::uuid, 'alice@example.com', 'Alice'),
    ('b0b00000-0000-4000-8000-000000000002'::uuid, 'bob@example.com', 'Bob')
) as u (id, email, name);

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

insert into public.boards (id, title, owner_id)
values ('b0a4d000-0000-4000-8000-000000000001', 'Demo board', 'a11ce000-0000-4000-8000-000000000001');

insert into public.board_members (board_id, user_id, role)
values ('b0a4d000-0000-4000-8000-000000000001', 'b0b00000-0000-4000-8000-000000000002', 'editor');

-- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2, ...
insert into public.board_columns (id, board_id, title, position)
values
  ('c0100000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001', 'To do', 'a0'),
  ('c0100000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001', 'In progress', 'a1'),
  ('c0100000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001', 'Done', 'a2');

insert into public.board_labels (id, board_id, name, color)
values
  ('1abe1000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001', 'Bug', 'red'),
  ('1abe1000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001', 'Feature', 'green'),
  ('1abe1000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001', '', 'purple');

insert into public.cards (
  id, board_id, column_id, title, description, position, due_at, completed_at, archived_at, created_by
)
values
  ('ca4d0000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000001', 'Set up authentication',
   E'Email + password sign-in with Supabase Auth.\n\n- [ ] Sign-in page\n- [ ] Sign-out',
   'a0', now() + interval '3 days', null, null, 'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000001', 'Design the card detail dialog',
   null, 'a1', null, null, null, 'b0b00000-0000-4000-8000-000000000002'),
  ('ca4d0000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000002', 'Drag and drop cards between columns',
   'Use dnd-kit; persist order with fractional indexing keys.',
   'a0', now() + interval '7 days', null, null, 'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000004', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000003', 'Create the board data model',
   null, 'a0', now() - interval '1 day', now() - interval '2 days', null,
   'a11ce000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000005', 'b0a4d000-0000-4000-8000-000000000001',
   'c0100000-0000-4000-8000-000000000003', 'Old spike: evaluate other Kanban libraries',
   null, 'a1', null, null, now() - interval '5 days', 'b0b00000-0000-4000-8000-000000000002');

insert into public.card_labels (card_id, label_id, board_id)
values
  ('ca4d0000-0000-4000-8000-000000000001', '1abe1000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000003', '1abe1000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000003', '1abe1000-0000-4000-8000-000000000003', 'b0a4d000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000002', '1abe1000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001');

insert into public.card_assignees (card_id, user_id, board_id)
values
  ('ca4d0000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001', 'b0a4d000-0000-4000-8000-000000000001'),
  ('ca4d0000-0000-4000-8000-000000000003', 'b0b00000-0000-4000-8000-000000000002', 'b0a4d000-0000-4000-8000-000000000001');
