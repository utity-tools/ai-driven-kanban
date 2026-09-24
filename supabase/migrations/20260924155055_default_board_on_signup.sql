-- Onboarding: every new (non-anonymous) user gets a ready-to-use default board.
--
-- Runs for every sign-up path that creates an auth.users row (email/password,
-- GitHub OAuth, ...). Anonymous users are skipped: demo mode seeds its own board.
--
-- The function runs inside the sign-up transaction, so an error here would make
-- sign-up fail. It is kept deliberately simple and deterministic: constant, valid
-- values only (they satisfy every check constraint on boards / board_columns), no
-- lookups, no dependence on user metadata.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid;
begin
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
  'After sign-up, creates a default "My board" with To do / In progress / Done columns (skips anonymous users).';

-- Only the trigger may call it; security definer functions in public are otherwise
-- callable through PostgREST RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
