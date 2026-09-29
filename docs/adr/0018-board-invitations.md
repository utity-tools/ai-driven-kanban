# 0018. Board invitations: single-use hashed links, accepted through an RPC

- **Status:** accepted
- **Date:** 2026-09-29

## Context

Boards have supported several members with roles since v0.1 (ADR 0004), but there was no way to
add anyone: the only path was the owner INSERT policy on `board_members`, which needs the other
user's id. v0.3 adds collaboration (invites, then Realtime), so people need a safe way to join a
board. There is no SMTP set up yet, so invites cannot be emailed.

## Decision

Owners create **single-use invitation links** that grant `editor` or `viewer` and expire after
7 days. The link carries a random token; the database stores only its hash, and joining goes
through a SECURITY DEFINER RPC.

- **Table `public.board_invites`:** board, role, `token_hash` (sha256, unique), `created_by`,
  `expires_at` (now + 7 days), `accepted_by`, `accepted_at`. Owners can read and revoke (delete)
  their board's invites; nobody can insert or update rows directly. `token_hash` is excluded
  from the column-level SELECT grant, so clients must list columns (`select *` fails).
- **Tokens:** 32 random bytes from `pgcrypto`, base64url (43 characters), generated and returned
  once by `create_board_invite`. Only the hash is stored, so a database leak does not leak
  usable links.
- **Roles:** invites grant `editor` or `viewer` only. Owners are made by promoting a member from
  the Members dialog, a deliberate second step.
- **RPCs** (public wrappers over `private` SECURITY DEFINER functions, `authenticated` only):
  - `create_board_invite(board_id, role)` → `(invite_id, token, expires_at)`: owners with a
    permanent account; at most 20 pending invites per board (`INV05`, per-board advisory lock).
  - `get_board_invite(token)` → status (`pending` / `expired` / `accepted`), role, whether the
    caller is already a member, and, while pending or for members, the board title and the
    inviter's **display name** (never their email). Unknown or revoked tokens return no row.
    Demo users may call it, so the page can tell them to create an account.
  - `accept_board_invite(token)` → board id. Locks the invite row, inserts the membership and
    marks the invite used in one transaction, so two people racing for one link cannot both
    join. Errors: `INV01` unknown or revoked, `INV02` expired, `INV03` already used, `INV04`
    demo user.
- **Already a member:** accepting returns the board without consuming the invite or changing
  the caller's role. The usual case is the inviter or a co-member opening the link; burning it
  would lock out the person it was meant for, and not burning it grants nothing new.
- **Former owners:** when an owner is demoted, leaves or is removed, the pending invites they
  created are deleted. Used invites are kept as the record of who invited whom, until the
  inviter's account is deleted (`created_by` cascades). `create_board_invite` locks the caller's
  owner membership row, so an invite cannot be created while a demotion is in flight.
- **Demo users** (anonymous, deleted after 7 days, ADR 0009) cannot create or accept invites.
- **Member management** needs no new policies: owners change roles (column-level UPDATE on
  `role`) and remove members; any member can leave; the existing triggers keep the creator an
  owner. Removing a member removes their card assignments on that board (FK cascade).

## Alternatives considered

- **Reusable board links:** convenient for teams, but a leaked link lets anyone in until it is
  revoked. Single-use links with expiry limit the damage to one join.
- **Storing the plaintext token:** simpler to show again later, but anyone with read access to
  the table could join any board.
- **Invite by email address:** needs SMTP and email verification, which the project does not
  have yet; the link can still be sent by email by the owner.
- **Accepting on GET (opening the link joins):** link previews, prefetching and scanners would
  consume invites. The page asks for an explicit "Join" click (POST).
- **Letting invites grant `owner`:** one leaked link would hand over the board.

## Consequences

- The `/invite/[token]` page has to sign people in first and then call the peek and accept RPCs.
- Owners must copy the link when it is created; it cannot be shown again (they can revoke it and
  create another).
- The existing owner INSERT policy on `board_members` still allows adding a user by id without
  an invite. Tightening it would break many test fixtures; revisit later.
- ADR 0006 lets co-members see each other's email. With invites, strangers can become
  co-members, so that choice should be revisited before sign-ups open widely.
- Links are bearer tokens: a member who opened a pending link (a no-op) and is later removed can
  still use it to rejoin with the invite's role. The Members UI should suggest revoking pending
  links after removing someone.
- The generated types show `get_board_invite`'s columns as non-null strings; `board_id`,
  `board_title` and `inviter_name` can be null and `status` is one of three values, so the app
  parses the result with Zod.
- The token travels in the URL path (`/invite/<token>`), so platform request logs (Vercel, the
  dev server) record it. App code never logs it and the page sends no referrer. Accepted: the
  token is single-use and short-lived, and only project admins can read those logs. A fragment
  (`#token`) would avoid it at the cost of a client-only accept flow.
- Used and expired invites are never purged. The rows are tiny and the pending cap bounds what
  matters; a pg_cron cleanup can come later.
