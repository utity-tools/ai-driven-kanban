-- Schema shape: tables, RLS, policies, privileges, types, functions, indexes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Tables -----------------------------------------------------------------------

select has_table('public', 'boards', 'boards exists');
select has_table('public', 'board_members', 'board_members exists');
select has_table('public', 'board_columns', 'board_columns exists');
select has_table('public', 'cards', 'cards exists');
select has_table('public', 'board_labels', 'board_labels exists');
select has_table('public', 'card_labels', 'card_labels exists');
select has_table('public', 'card_assignees', 'card_assignees exists');
select hasnt_column('public', 'cards', 'status', 'cards has no status column (state = column)');

-- RLS enabled on every table ----------------------------------------------------

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'every public table has RLS enabled'
);

select ok((select relrowsecurity from pg_class where oid = 'public.boards'::regclass), 'RLS on boards');
select ok((select relrowsecurity from pg_class where oid = 'public.board_members'::regclass), 'RLS on board_members');
select ok((select relrowsecurity from pg_class where oid = 'public.board_columns'::regclass), 'RLS on board_columns');
select ok((select relrowsecurity from pg_class where oid = 'public.cards'::regclass), 'RLS on cards');
select ok((select relrowsecurity from pg_class where oid = 'public.board_labels'::regclass), 'RLS on board_labels');
select ok((select relrowsecurity from pg_class where oid = 'public.card_labels'::regclass), 'RLS on card_labels');
select ok((select relrowsecurity from pg_class where oid = 'public.card_assignees'::regclass), 'RLS on card_assignees');

-- Policies: every table has select/insert/update/delete, all TO authenticated only ---

select is(
  (select count(*)::int
   from (select tablename from pg_policies where schemaname = 'public'
         group by tablename
         having array_agg(distinct cmd order by cmd) = array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) t),
  8,
  'all 8 tables have select, insert, update and delete policies'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and roles <> '{authenticated}'),
  0,
  'every policy applies to authenticated only'
);

-- Privileges -------------------------------------------------------------------

select is(
  (select count(*)::int
   from pg_class c
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv)
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, p.priv)),
  0,
  'anon has no table privileges'
);

select is(
  (select count(*)::int
   from pg_class c
   cross join unnest(array['TRUNCATE', 'MAINTAIN', 'TRIGGER', 'REFERENCES']) p(priv)
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and has_table_privilege('authenticated', c.oid, p.priv)),
  0,
  'authenticated cannot TRUNCATE (bypasses RLS), MAINTAIN, TRIGGER or REFERENCES'
);

select ok(
  not has_column_privilege('authenticated', 'public.boards', 'owner_id', 'UPDATE')
  and has_column_privilege('authenticated', 'public.boards', 'title', 'UPDATE'),
  'boards.owner_id is not updatable by clients; title is'
);

select ok(
  not has_column_privilege('authenticated', 'public.cards', 'board_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.cards', 'created_by', 'UPDATE'),
  'cards.board_id and cards.created_by are not updatable by clients'
);

-- Types & functions --------------------------------------------------------------

select enum_has_labels('public', 'board_role', array['owner', 'editor', 'viewer'], 'board_role enum values');

select ok(
  (select p.prosecdef and p.provolatile = 's'
          and p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.oid = 'public.has_board_role(uuid, public.board_role[])'::regprocedure),
  'has_board_role is security definer, stable, with empty search_path'
);

select ok(
  not has_function_privilege('anon', 'public.has_board_role(uuid, public.board_role[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.has_board_role(uuid, public.board_role[])', 'EXECUTE'),
  'has_board_role executable by authenticated only'
);

select is(
  (select count(*)::int
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0,
  'every security definer function pins search_path'
);

select has_trigger('public', 'boards', 'boards_add_owner_member', 'owner membership trigger exists');
select has_trigger('public', 'board_members', 'board_members_protect_owners', 'owner protection trigger exists');

-- Ordering keys ------------------------------------------------------------------

select is(
  (select array_agg(collname::text order by collname)
   from pg_attribute a join pg_collation co on co.oid = a.attcollation
   where a.attname = 'position' and a.attrelid in ('public.board_columns'::regclass, 'public.cards'::regclass)),
  array['C', 'C'],
  'position columns use the C (byte order) collation'
);

-- Indexes ------------------------------------------------------------------------

select has_index('public', 'board_columns', 'board_columns_board_id_position_idx', 'index on board_columns(board_id, position)');
select has_index('public', 'cards', 'cards_column_id_position_active_idx', 'partial index on cards(column_id, position)');
select has_index('public', 'cards', 'cards_board_id_idx', 'index on cards(board_id)');

-- Every FK has a non-partial index led by the FK's first column (for composite FKs the
-- first column is a unique id, so that is enough for cascades and joins).
select is(
  (select array_agg(con.conrelid::regclass::text || '.' || con.conname order by con.conname)
   from pg_constraint con
   where con.contype = 'f'
     and con.connamespace = 'public'::regnamespace
     and not exists (
       select 1
       from pg_index i
       where i.indrelid = con.conrelid
         and i.indpred is null
         and i.indkey[0] = con.conkey[1]
     )),
  null,
  'every foreign key is covered by an index'
);

select * from finish();
rollback;
