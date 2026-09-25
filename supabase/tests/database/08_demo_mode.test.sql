-- Demo mode: anonymous sign-up seeds the demo board, visitors are isolated by RLS, and
-- expired anonymous users are cleaned up daily by pg_cron.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ---------------------------------------------------------------------------
-- Shape: functions, privileges, extension, cron job
-- ---------------------------------------------------------------------------

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.seed_demo_board(uuid)'::regprocedure),
  'seed_demo_board is security definer with empty search_path'
);

select ok(
  not has_function_privilege('public', 'private.seed_demo_board(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.seed_demo_board(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.seed_demo_board(uuid)', 'EXECUTE'),
  'seed_demo_board is not executable by public, anon or authenticated'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.delete_expired_demo_users()'::regprocedure),
  'delete_expired_demo_users is security definer with empty search_path'
);

select ok(
  not has_function_privilege('public', 'private.delete_expired_demo_users()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.delete_expired_demo_users()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.delete_expired_demo_users()', 'EXECUTE'),
  'delete_expired_demo_users is not executable by public, anon or authenticated'
);

select has_extension('pg_cron', 'pg_cron is installed');

select results_eq(
  $$ select schedule, command, active from cron.job where jobname = 'delete-expired-demo-users' $$,
  $$ values ('17 3 * * *'::text, 'select private.delete_expired_demo_users()'::text, true) $$,
  'a daily cron job deletes expired demo users'
);

-- ---------------------------------------------------------------------------
-- An anonymous visitor signs in
-- ---------------------------------------------------------------------------
-- V1, V2 = anonymous visitors; P = permanent user

select lives_ok(
  $$ insert into auth.users (id, is_anonymous) values ('00000000-0000-4000-a000-000000000801', true) $$,
  'anonymous sign-up succeeds'
);

select results_eq(
  $$ select email, display_name, avatar_url from public.profiles where id = '00000000-0000-4000-a000-000000000801' $$,
  $$ values (null::text, 'Demo visitor'::text, null::text) $$,
  'the visitor gets a profile named "Demo visitor"'
);

select results_eq(
  $$ select title, owner_id from public.boards where owner_id = '00000000-0000-4000-a000-000000000801' $$,
  $$ values ('Demo: Launch a landing page', '00000000-0000-4000-a000-000000000801'::uuid) $$,
  'the visitor gets exactly one board, the demo board, owned by them'
);

select results_eq(
  $$ select m.user_id, m.role
     from public.board_members m
     join public.boards b on b.id = m.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000801' $$,
  $$ values ('00000000-0000-4000-a000-000000000801'::uuid, 'owner'::public.board_role) $$,
  'the visitor is the only member of the demo board, as owner'
);

select results_eq(
  $$ select c.title, c.position collate "default"
     from public.board_columns c
     join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000801'
     order by c.position, c.id $$,
  $$ values ('Backlog', 'a0'), ('To do', 'a1'), ('In progress', 'a2'), ('Done', 'a3') $$,
  'the demo board has Backlog / To do / In progress / Done, in that order'
);

select results_eq(
  $$ select l.name, l.color
     from public.board_labels l
     join public.boards b on b.id = l.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000801'
     order by l.name $$,
  $$ values ('Backend', 'purple'), ('Content', 'yellow'), ('Design', 'pink'),
            ('Frontend', 'blue'), ('Infra', 'orange') $$,
  'the demo board has five named labels'
);

-- due_on relative to today: overdue (-2), today (0), this week (+3), later (+14), done (-5).
select results_eq(
  $$ select col.title, c.title, c.position collate "default", c.due_on - current_date,
            c.completed_at is not null, c.archived_at is null,
            c.created_by is null
     from public.cards c
     join public.board_columns col on col.id = c.column_id
     join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000801'
     order by col.position, c.position $$,
  $$ values
       ('Backlog', 'A/B test the pricing section', 'a0', null::int, false, true, true),
       ('Backlog', 'Set up analytics events', 'a1', 14, false, true, true),
       ('To do', 'Write hero copy and CTA', 'a0', 3, false, true, true),
       ('To do', 'Configure custom domain and SSL', 'a1', null, false, true, true),
       ('In progress', 'Build responsive hero section', 'a0', 0, false, true, true),
       ('In progress', 'Integrate newsletter signup form', 'a1', -2, false, true, true),
       ('Done', 'Wireframe the page layout', 'a0', null, false, true, true),
       ('Done', 'Choose the stack and hosting', 'a1', -5, true, true, true) $$,
  'the demo board has eight system-created cards over the columns, with relative due dates'
);

select ok(
  (select bool_and(c.description is not null and char_length(c.description) between 1 and 10000)
   from public.cards c
   join public.boards b on b.id = c.board_id
   where b.owner_id = '00000000-0000-4000-a000-000000000801'),
  'every demo card has a description'
);

select results_eq(
  $$ select c.title, string_agg(l.name, ', ' order by l.name)
     from public.card_labels cl
     join public.cards c on c.id = cl.card_id
     join public.board_labels l on l.id = cl.label_id
     join public.boards b on b.id = cl.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000801'
     group by c.title
     order by c.title $$,
  $$ values
       ('A/B test the pricing section', 'Frontend'),
       ('Build responsive hero section', 'Design, Frontend'),
       ('Choose the stack and hosting', 'Infra'),
       ('Configure custom domain and SSL', 'Infra'),
       ('Integrate newsletter signup form', 'Backend, Frontend'),
       ('Set up analytics events', 'Frontend'),
       ('Wireframe the page layout', 'Design'),
       ('Write hero copy and CTA', 'Content') $$,
  'labels are attached to the demo cards'
);

select results_eq(
  $$ select c.title, a.user_id
     from public.card_assignees a
     join public.cards c on c.id = a.card_id
     join public.boards b on b.id = a.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000801'
     order by c.title $$,
  $$ values
       ('Build responsive hero section', '00000000-0000-4000-a000-000000000801'::uuid),
       ('Integrate newsletter signup form', '00000000-0000-4000-a000-000000000801'::uuid) $$,
  'the visitor is assigned to two demo cards'
);

-- A name supplied in the anonymous sign-in metadata wins over "Demo visitor".
insert into auth.users (id, is_anonymous, raw_user_meta_data)
values ('00000000-0000-4000-a000-000000000807', true, '{"full_name": "Grace"}');

select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-a000-000000000807'),
  'Grace',
  'an anonymous user with a name in their metadata keeps it'
);

-- ---------------------------------------------------------------------------
-- A permanent user is unaffected
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values ('00000000-0000-4000-a000-000000000803', 'p@test.local');

select results_eq(
  $$ select title from public.boards where owner_id = '00000000-0000-4000-a000-000000000803' $$,
  $$ values ('My board') $$,
  'a permanent user still gets only "My board"'
);

select is(
  (select count(*)::int from public.board_labels l
   join public.boards b on b.id = l.board_id
   where b.owner_id = '00000000-0000-4000-a000-000000000803'),
  0,
  'a permanent user gets no demo labels'
);

-- ---------------------------------------------------------------------------
-- Visitors are isolated by RLS
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values ('00000000-0000-4000-a000-000000000802', true);

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000000801", "role": "authenticated", "is_anonymous": true}', true);

select results_eq(
  $$ select b.owner_id, count(c.id)::int from public.boards b join public.cards c on c.board_id = b.id group by b.owner_id $$,
  $$ values ('00000000-0000-4000-a000-000000000801'::uuid, 8) $$,
  'V1 sees only their own demo board and its eight cards'
);

select results_eq(
  $$ update public.cards set title = 'Build the hero section'
     where title = 'Build responsive hero section'
     returning board_id in (select id from public.boards where owner_id = '00000000-0000-4000-a000-000000000801') $$,
  $$ values (true) $$,
  'V1 can edit their demo board (and only that card is touched)'
);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-4000-a000-000000000801'::uuid) $$,
  'V1 sees only their own profile'
);

select throws_ok(
  $$ select private.delete_expired_demo_users() $$,
  '42501', null,
  'a visitor cannot run the cleanup'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000000802", "role": "authenticated", "is_anonymous": true}', true);

select results_eq(
  $$ select owner_id from public.boards $$,
  $$ values ('00000000-0000-4000-a000-000000000802'::uuid) $$,
  'V2 sees only their own demo board'
);

select is_empty(
  $$ update public.cards set title = 'hijacked'
     where board_id in (select id from public.boards where owner_id = '00000000-0000-4000-a000-000000000801')
     returning id $$,
  'V2 cannot change V1''s cards'
);

select is_empty(
  $$ select 1 from public.card_assignees where user_id = '00000000-0000-4000-a000-000000000801' $$,
  'V2 cannot see V1''s assignments'
);

reset role;

-- ---------------------------------------------------------------------------
-- Cleanup of expired demo users
-- ---------------------------------------------------------------------------
-- O = anonymous, 8 days old (expired); R = anonymous, 6 days old; Q = permanent, 30 days old

insert into auth.users (id, is_anonymous, email, created_at) values
  ('00000000-0000-4000-a000-000000000804', true, null, now() - interval '8 days'),
  ('00000000-0000-4000-a000-000000000806', true, null, now() - interval '6 days'),
  ('00000000-0000-4000-a000-000000000805', false, 'q@test.local', now() - interval '30 days');

create temp table expired_boards on commit drop as
select id from public.boards where owner_id = '00000000-0000-4000-a000-000000000804';

select is(
  (select count(*)::int from expired_boards),
  1,
  'the expired visitor had a demo board'
);

select is(
  private.delete_expired_demo_users(),
  1,
  'the cleanup deletes exactly one user (the expired visitor)'
);

select results_eq(
  $$ select id from auth.users
     where id in ('00000000-0000-4000-a000-000000000801', '00000000-0000-4000-a000-000000000804',
                  '00000000-0000-4000-a000-000000000805', '00000000-0000-4000-a000-000000000806')
     order by id $$,
  $$ values ('00000000-0000-4000-a000-000000000801'::uuid), ('00000000-0000-4000-a000-000000000805'::uuid),
            ('00000000-0000-4000-a000-000000000806'::uuid) $$,
  'recent visitors and old permanent users are kept'
);

select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000804'
     union all
     select 1 from public.board_members where user_id = '00000000-0000-4000-a000-000000000804' $$,
  'the expired visitor''s profile and memberships are gone'
);

select is_empty(
  $$ select 1 from public.boards where id in (select id from expired_boards)
     union all select 1 from public.board_columns where board_id in (select id from expired_boards)
     union all select 1 from public.cards where board_id in (select id from expired_boards)
     union all select 1 from public.board_labels where board_id in (select id from expired_boards)
     union all select 1 from public.card_labels where board_id in (select id from expired_boards)
     union all select 1 from public.card_assignees where board_id in (select id from expired_boards) $$,
  'the expired visitor''s demo board and everything on it are gone'
);

select is(
  private.delete_expired_demo_users(),
  0,
  'running the cleanup again deletes nothing'
);

select * from finish();
rollback;
