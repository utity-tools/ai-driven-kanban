-- Card details (v0.1 delivery 4b): date-only due dates, labels, assignees, and the shared
-- default-columns helper.
--
-- Editors can manage board labels, attach/detach labels, assign/unassign members and
-- set/clear due_on and completed_at; viewers and outsiders can do none of these.
-- An RLS-blocked UPDATE/DELETE is not an error (0 rows); a blocked INSERT raises 42501.
begin;
create extension if not exists pgtap with schema extensions;

select plan(59);

-- ---------------------------------------------------------------------------
-- Schema: cards.due_on replaces cards.due_at
-- ---------------------------------------------------------------------------

select has_column('public', 'cards', 'due_on', 'cards.due_on exists');
select col_type_is('public', 'cards', 'due_on', 'date', 'cards.due_on is a date (no time, no time zone)');
select col_is_null('public', 'cards', 'due_on', 'cards.due_on is optional');
select hasnt_column('public', 'cards', 'due_at', 'cards.due_at (timestamptz) is gone');
select col_type_is('public', 'cards', 'completed_at', 'timestamp with time zone', 'cards.completed_at is unchanged');
select col_has_check('public', 'cards', 'due_on', 'cards.due_on has a range check');

-- Exactly these cards columns are updatable by clients (table-level UPDATE is revoked).
select is(
  (select array_agg(a.attname::text order by a.attname)
   from pg_attribute a
   where a.attrelid = 'public.cards'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  array['archived_at', 'column_id', 'completed_at', 'description', 'due_on', 'position', 'title'],
  'authenticated can update exactly the editable cards columns (due_on, not due_at)'
);

select ok(
  not has_table_privilege('authenticated', 'public.cards', 'UPDATE'),
  'cards has no table-level UPDATE grant for authenticated'
);

-- ---------------------------------------------------------------------------
-- Shared default-columns helper
-- ---------------------------------------------------------------------------

select has_function('internal', 'add_default_columns', array['uuid'], 'internal.add_default_columns(uuid) exists');

select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'internal.add_default_columns(uuid)'::regprocedure),
  'add_default_columns is security invoker with empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'internal.add_default_columns(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.add_default_columns(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'internal.add_default_columns(uuid)', 'EXECUTE'),
  'add_default_columns is executable by authenticated only'
);

select ok(
  has_schema_privilege('authenticated', 'internal', 'USAGE')
  and not has_schema_privilege('anon', 'internal', 'USAGE')
  and not has_schema_privilege('public', 'internal', 'USAGE'),
  'the internal schema is usable by authenticated only'
);

select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'internal'::regnamespace and p.prosecdef),
  0,
  'the internal schema holds no security definer functions'
);

-- The default columns are defined once: neither caller repeats them.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p
   where p.oid in ('public.handle_new_user()'::regprocedure, 'public.create_board(text)'::regprocedure)
     and p.prosrc like '%internal.add_default_columns(%'
     and p.prosrc not like '%In progress%'),
  array['create_board', 'handle_new_user'],
  'handle_new_user and create_board both use add_default_columns instead of their own column list'
);

-- ---------------------------------------------------------------------------
-- Fixtures: O = owner, E = editor, V = viewer, X = outsider
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000701', 'o7@test.local'),
  ('00000000-0000-4000-a000-000000000702', 'e7@test.local'),
  ('00000000-0000-4000-a000-000000000703', 'v7@test.local'),
  ('00000000-0000-4000-a000-000000000704', 'x7@test.local');

grant usage on schema extensions to anon, authenticated;
grant all on all tables in schema pg_temp to anon, authenticated;
grant all on all sequences in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000701", "role": "authenticated"}', true);

-- create_board goes through the helper as the caller (RLS applies and passes for the owner).
select set_config('test.board_id', public.create_board('Details')::text, true);
select set_config(
  'test.todo_id',
  (select id::text from public.board_columns
   where board_id = current_setting('test.board_id')::uuid and position = 'a0'),
  true
);

select lives_ok(
  $$
    insert into public.board_members (board_id, user_id, role) values
      (current_setting('test.board_id')::uuid, '00000000-0000-4000-a000-000000000702', 'editor'),
      (current_setting('test.board_id')::uuid, '00000000-0000-4000-a000-000000000703', 'viewer');
    insert into public.cards (id, board_id, column_id, title, position) values
      ('00000000-0000-4000-d000-000000000701', current_setting('test.board_id')::uuid,
       current_setting('test.todo_id')::uuid, 'Card', 'a0');
  $$,
  'owner adds an editor, a viewer and a card'
);

-- ---------------------------------------------------------------------------
-- Editor: labels
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000702", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.board_labels (id, board_id, name, color) values
       ('00000000-0000-4000-e000-000000000701', current_setting('test.board_id')::uuid, 'bug', 'red'),
       ('00000000-0000-4000-e000-000000000702', current_setting('test.board_id')::uuid, '', 'green') $$,
  'editor can create board labels (named and colour-only)'
);

select results_eq(
  $$ update public.board_labels set name = 'defect', color = 'orange'
     where id = '00000000-0000-4000-e000-000000000701' returning name, color $$,
  $$ values ('defect', 'orange') $$,
  'editor can rename and recolour a label'
);

select throws_ok(
  $$ update public.board_labels set board_id = gen_random_uuid()
     where id = '00000000-0000-4000-e000-000000000701' $$,
  '42501', null,
  'editor cannot move a label to another board (board_id is not updatable)'
);

select lives_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id) values
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-e000-000000000701',
        current_setting('test.board_id')::uuid),
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-e000-000000000702',
        current_setting('test.board_id')::uuid) $$,
  'editor can attach labels to a card'
);

select results_eq(
  $$ delete from public.card_labels
     where card_id = '00000000-0000-4000-d000-000000000701'
       and label_id = '00000000-0000-4000-e000-000000000702'
     returning label_id $$,
  $$ values ('00000000-0000-4000-e000-000000000702'::uuid) $$,
  'editor can detach a label from a card'
);

-- ---------------------------------------------------------------------------
-- Editor: assignees
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.card_assignees (card_id, user_id, board_id) values
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-a000-000000000701',
        current_setting('test.board_id')::uuid),
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-a000-000000000702',
        current_setting('test.board_id')::uuid),
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-a000-000000000703',
        current_setting('test.board_id')::uuid) $$,
  'editor can assign members (owner, themselves, a viewer) to a card'
);

select throws_ok(
  $$ insert into public.card_assignees (card_id, user_id, board_id) values
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-a000-000000000704',
        current_setting('test.board_id')::uuid) $$,
  '23503', null,
  'editor cannot assign a user who is not a board member'
);

select results_eq(
  $$ delete from public.card_assignees
     where card_id = '00000000-0000-4000-d000-000000000701'
       and user_id = '00000000-0000-4000-a000-000000000703'
     returning user_id $$,
  $$ values ('00000000-0000-4000-a000-000000000703'::uuid) $$,
  'editor can unassign a member'
);

-- ---------------------------------------------------------------------------
-- Editor: due date and done checkbox
-- ---------------------------------------------------------------------------

select results_eq(
  $$ update public.cards set due_on = '2026-10-02'
     where id = '00000000-0000-4000-d000-000000000701' returning due_on $$,
  $$ values ('2026-10-02'::date) $$,
  'editor can set a due date'
);

select results_eq(
  $$ update public.cards set completed_at = '2026-10-01 18:30:00+00'
     where id = '00000000-0000-4000-d000-000000000701' returning completed_at $$,
  $$ values ('2026-10-01 18:30:00+00'::timestamptz) $$,
  'editor can mark the due date as done'
);

select throws_ok(
  $$ update public.cards set due_on = '20261-10-02'
     where id = '00000000-0000-4000-d000-000000000701' $$,
  '23514', null,
  'a due date outside 2000-01-01..9999-12-31 is rejected'
);

-- Snapshot for the viewer/outsider checks below: 1 label attached (defect), assignees O and E,
-- due 2026-10-02, completed.

-- ---------------------------------------------------------------------------
-- Viewer: none of the above
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000703", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.board_labels (board_id, name, color)
     values (current_setting('test.board_id')::uuid, 'viewer label', 'blue') $$,
  '42501', null,
  'viewer cannot create a label'
);
select is_empty(
  $$ update public.board_labels set name = 'hacked', color = 'black'
     where board_id = current_setting('test.board_id')::uuid returning 1 $$,
  'viewer cannot rename or recolour labels'
);
select is_empty(
  $$ delete from public.board_labels where board_id = current_setting('test.board_id')::uuid returning 1 $$,
  'viewer cannot delete labels'
);
select throws_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id) values
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-e000-000000000702',
        current_setting('test.board_id')::uuid) $$,
  '42501', null,
  'viewer cannot attach a label'
);
select is_empty(
  $$ delete from public.card_labels where card_id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'viewer cannot detach labels'
);
select throws_ok(
  $$ insert into public.card_assignees (card_id, user_id, board_id) values
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-a000-000000000703',
        current_setting('test.board_id')::uuid) $$,
  '42501', null,
  'viewer cannot assign (not even themselves)'
);
select is_empty(
  $$ delete from public.card_assignees where card_id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'viewer cannot unassign'
);
select is_empty(
  $$ update public.cards set due_on = '2030-01-01'
     where id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'viewer cannot change the due date'
);
select is_empty(
  $$ update public.cards set due_on = null
     where id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'viewer cannot clear the due date'
);
select is_empty(
  $$ update public.cards set completed_at = null
     where id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'viewer cannot uncheck done'
);
select throws_ok(
  $$ select internal.add_default_columns(current_setting('test.board_id')::uuid) $$,
  '42501', null,
  'viewer cannot add default columns through the helper (runs under the viewer''s RLS)'
);

-- The viewer still reads the card details.
select results_eq(
  $$ select c.due_on, c.completed_at is not null,
            (select array_agg(l.name order by l.name) from public.card_labels cl
             join public.board_labels l on l.id = cl.label_id where cl.card_id = c.id),
            (select count(*)::int from public.card_assignees a where a.card_id = c.id)
     from public.cards c where c.id = '00000000-0000-4000-d000-000000000701' $$,
  $$ values ('2026-10-02'::date, true, array['defect'], 2) $$,
  'viewer reads the card details, unchanged'
);

-- ---------------------------------------------------------------------------
-- Outsider: sees nothing, changes nothing
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000704", "role": "authenticated"}', true);

select is_empty(
  $$ select 1 from public.board_labels where board_id = current_setting('test.board_id')::uuid
     union all select 1 from public.card_labels where board_id = current_setting('test.board_id')::uuid
     union all select 1 from public.card_assignees where board_id = current_setting('test.board_id')::uuid $$,
  'outsider cannot see labels, card labels or assignees'
);
select throws_ok(
  $$ insert into public.board_labels (board_id, name, color)
     values (current_setting('test.board_id')::uuid, 'x', 'blue') $$,
  '42501', null,
  'outsider cannot create a label'
);
select throws_ok(
  $$ insert into public.card_labels (card_id, label_id, board_id) values
       ('00000000-0000-4000-d000-000000000701', '00000000-0000-4000-e000-000000000702',
        current_setting('test.board_id')::uuid) $$,
  '42501', null,
  'outsider cannot attach a label'
);
select is_empty(
  $$ delete from public.card_assignees where card_id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'outsider cannot unassign'
);
select is_empty(
  $$ update public.cards set due_on = null, completed_at = null
     where id = '00000000-0000-4000-d000-000000000701' returning 1 $$,
  'outsider cannot change the due date or done state'
);
select throws_ok(
  $$ select internal.add_default_columns(current_setting('test.board_id')::uuid) $$,
  '42501', null,
  'outsider cannot add columns to someone else''s board through the helper'
);

-- ---------------------------------------------------------------------------
-- Editor: clear due date / done, delete a label (cascades to cards)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000702", "role": "authenticated"}', true);

select results_eq(
  $$ update public.cards set completed_at = null
     where id = '00000000-0000-4000-d000-000000000701' returning completed_at $$,
  $$ values (null::timestamptz) $$,
  'editor can uncheck done'
);

select results_eq(
  $$ update public.cards set due_on = null
     where id = '00000000-0000-4000-d000-000000000701' returning due_on $$,
  $$ values (null::date) $$,
  'editor can clear the due date'
);

select results_eq(
  $$ delete from public.board_labels where id = '00000000-0000-4000-e000-000000000701' returning id $$,
  $$ values ('00000000-0000-4000-e000-000000000701'::uuid) $$,
  'editor can delete a label that is attached to a card'
);

select is_empty(
  $$ select 1 from public.card_labels where label_id = '00000000-0000-4000-e000-000000000701' $$,
  'deleting a label removes it from every card (cascade)'
);

select results_eq(
  $$ select count(*)::int from public.cards where id = '00000000-0000-4000-d000-000000000701' $$,
  $$ values (1) $$,
  'the card itself survives the label deletion'
);

select results_eq(
  $$ select l.name, l.color from public.board_labels l
     where l.board_id = current_setting('test.board_id')::uuid $$,
  $$ values ('', 'green') $$,
  'the other label is untouched'
);

-- Editor can remove the last assignees (themselves and the owner).
select results_eq(
  $$ with d as (
       delete from public.card_assignees where card_id = '00000000-0000-4000-d000-000000000701'
       returning user_id
     )
     select user_id from d order by user_id $$,
  $$ values ('00000000-0000-4000-a000-000000000701'::uuid), ('00000000-0000-4000-a000-000000000702'::uuid) $$,
  'editor can unassign everyone, including the owner'
);

-- ---------------------------------------------------------------------------
-- The helper, as an editor, behaves like direct column inserts
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select internal.add_default_columns(current_setting('test.board_id')::uuid) $$,
  'editor may call the helper on their board (same as inserting columns directly)'
);
select results_eq(
  $$ select count(*)::int from public.board_columns where board_id = current_setting('test.board_id')::uuid $$,
  $$ values (6) $$,
  'the helper added three more columns'
);

-- ---------------------------------------------------------------------------
-- Sign-up path: the helper runs as definer (no auth.uid()) and still creates the columns
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$ insert into auth.users (id, email) values ('00000000-0000-4000-a000-000000000705', 'new7@test.local') $$,
  'sign-up (no JWT) succeeds'
);
select results_eq(
  $$ select c.title, c.position collate "default"
     from public.board_columns c join public.boards b on b.id = c.board_id
     where b.owner_id = '00000000-0000-4000-a000-000000000705'
     order by c.position, c.id $$,
  $$ values ('To do', 'a0'), ('In progress', 'a1'), ('Done', 'a2') $$,
  'the sign-up board gets the default columns from the shared helper'
);

-- ---------------------------------------------------------------------------
-- Backfill rule used by the migration: a timestamptz due date maps to its UTC date
-- ---------------------------------------------------------------------------

select is(
  ('2026-10-02 23:30:00-05'::timestamptz at time zone 'UTC')::date,
  '2026-10-03'::date,
  'backfill: 2026-10-02 23:30 at UTC-5 is 2026-10-03 in UTC'
);
select is(
  ('2026-10-02 00:00:00+00'::timestamptz at time zone 'UTC')::date,
  '2026-10-02'::date,
  'backfill: midnight UTC keeps its UTC date'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

select throws_ok(
  $$ select internal.add_default_columns(gen_random_uuid()) $$,
  '42501', null,
  'anon cannot call the helper'
);
select throws_ok(
  $$ update public.cards set due_on = null $$,
  '42501', null,
  'anon cannot update cards'
);

reset role;
select * from finish();
rollback;
