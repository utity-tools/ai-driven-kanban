-- v0.1 delivery 4a: create/edit boards, columns and cards; archive/restore.
--
-- * public.create_board(p_title): creates a board plus the default To do / In progress /
--   Done columns in one transaction. SECURITY INVOKER, so RLS, the column-level grants
--   and the existing triggers (handle_new_board adds the caller as owner member) apply
--   exactly as for a direct insert.
-- * Archive-first deletion: a card can only be deleted permanently once it is archived
--   (archived_at is not null). Enforced by the cards DELETE policy, so it holds for every
--   client. FK cascades (deleting a column or a board) are not subject to RLS and still
--   remove all of their cards, archived or not.
--
-- Everything else 4a needs (rename boards, add/rename/reorder/delete columns, add/edit/
-- move/archive/restore cards) is already covered by the policies and column grants of
-- 20260924153052_board_data_model.sql.

-- ---------------------------------------------------------------------------
-- create_board
-- ---------------------------------------------------------------------------

create function public.create_board(p_title text)
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
  -- column inserts below pass the owner/editor policy.
  insert into public.boards (title)
  values (v_title)
  returning id into v_board_id;

  -- Fractional-indexing keys as produced by generateKeyBetween: a0, a1, a2.
  insert into public.board_columns (board_id, title, position)
  values
    (v_board_id, 'To do', 'a0'),
    (v_board_id, 'In progress', 'a1'),
    (v_board_id, 'Done', 'a2');

  return v_board_id;
end;
$$;

comment on function public.create_board(text) is
  'Creates a board owned by the caller with To do / In progress / Done columns. '
  'Title is trimmed and must be 1-100 characters (raises 23514 otherwise).';

revoke execute on function public.create_board(text) from public, anon;
grant execute on function public.create_board(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Cards: archive before deleting
-- ---------------------------------------------------------------------------

drop policy "cards: owners and editors can delete" on public.cards;

-- A DELETE on a non-archived card matches no rows (0 rows affected, no error).
create policy "cards: owners and editors can delete archived cards"
  on public.cards for delete
  to authenticated
  using (
    archived_at is not null
    and public.has_board_role(board_id, '{owner,editor}')
  );
