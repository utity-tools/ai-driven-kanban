# 0006. Public profiles visible to board co-members

- **Status:** accepted
- **Date:** 2026-09-24

## Context

The board view (v0.1 delivery 3) shows who is assigned to each card and who belongs to a board.
Names, emails and avatars live in `auth.users`, which the API must never expose.

## Decision

- **`public.profiles`** (`id`, `email`, `display_name`, `avatar_url`), one row per auth user,
  created by `handle_new_user()` before the default board, so memberships can reference it.
  - `display_name` and `avatar_url` come from sign-up metadata. GitHub provides `full_name`,
    `name`, `user_name` and `avatar_url`.
  - Metadata is parsed by `private.profile_fields_from_metadata()`, which never raises: odd
    values become `null`. Only `https://` avatars are accepted.
  - An `auth.users` update trigger keeps `email` in sync. It fills the name and avatar only while
    they are empty, so a name the user edited is never overwritten.
- **Visibility:** you can read your own profile and the profiles of people who share at least one
  board with you (`public.shares_board_with()`). Strangers and `anon` see nothing.
- **Writes:** users can update only their own `display_name` (column-level grant). Rows are
  created and deleted only by triggers and cascades.
- **Embedding:** `board_members.user_id` and `card_assignees.user_id` reference `profiles(id)`, so
  the app fetches members and assignees with their profiles in one query.
- **`private` schema:** internal helpers live in a schema the API cannot reach and that is not part
  of the generated types.

## Alternatives considered

- **A view over `auth.users`:** exposes the auth schema through the API and is easy to get wrong
  with RLS.
- **Copying names into `board_members`:** duplicated data, and it goes stale when a user changes
  their name.
- **Hiding emails from co-members (column-level select grant):** more private, but breaks
  `select=*` and is unusual for collaboration tools, where you invite people by email. Revisit if
  boards ever become shareable with untrusted users.

## Consequences

- Board co-members can see each other's email.
- Anonymous (demo) users get a profile without an email; the UI falls back to initials.
- Rendering GitHub avatars requires allowing `avatars.githubusercontent.com` in the Next image
  configuration.
- [ADR 0005](0005-authentication.md) asked `handle_new_user()` to stay minimal because a failure
  blocks sign-up. It now also reads metadata, but only through a helper that cannot fail, and the
  pgTAP tests cover odd metadata.
