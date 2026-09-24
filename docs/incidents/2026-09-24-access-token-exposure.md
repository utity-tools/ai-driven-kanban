# Incident: Supabase access token exposed as a GitHub secret name

- **Date:** 2026-09-24 (times in UTC)
- **Severity:** low
- **Status:** resolved
- **Format:** blameless post-mortem

## Summary

While configuring CI secrets, a Supabase access token was saved as the **name** of a GitHub
Actions secret instead of its value, which made it readable to anyone able to list the
repository's secrets. It was detected minutes later during a routine verification, revoked and
replaced. As a follow-up, CI was redesigned so it no longer needs a Supabase access token at all.

## Impact

- **Scope, limited by design:** the token was restricted to the `kanban-staging` project with
  minimal permissions (migrations read-write; project settings, database config and connection
  pooling read-only). It had no access to table data and no access to other projects.
- **Data at risk:** none. The staging database was empty (no schema yet).
- **Visibility:** secret names are only listed to repository administrators, not to the public.
- **Exposure window:** about 7 minutes, from saving the secret to revoking the token.
- **Not verified:** Supabase usage logs for the token were not reviewed. Given the scope above,
  the risk was assessed as low.

## Timeline

| Time (UTC) | Event                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10:59      | The secret is saved with the token as its name (`gh secret set <token>`)                                                                                                                                       |
| ~11:02     | **Detected:** before using the secrets, their names are listed (names only, never values) and one has the shape of a token                                                                                     |
| ~11:04     | The misnamed secret is deleted (by pattern, without printing it) and the token is removed from shell history. The repository and its git history are scanned: no copies                                        |
| ~11:06     | The token is revoked in Supabase. A new scoped token and the staging DB password are saved correctly                                                                                                           |
| 11:08      | The first run of the migrations workflow fails: `supabase link` needs a permission to read API keys, including the secret key                                                                                  |
| ~11:14     | **Structural fix:** migrations switch to a direct pooler connection that needs no access token ([ADR 0002](../adr/0002-migrations-via-direct-connection.md)). The new token is deleted from GitHub and revoked |

## Root cause

- `gh secret set NAME` reads the value from an interactive prompt, but it also accepts other
  arguments without warning. The setup instructions did not say explicitly that the value must be
  pasted **at the prompt**, never typed in the command. The token ended up in the position of the
  name.
- Beyond the slip itself, the design required handling a long-lived credential in CI that it did
  not actually need.

## What went well

- **Verification after configuration:** secret names were checked before being relied on, which
  caught the problem within minutes.
- **Least privilege:** the token was scoped to one project and a minimal set of permissions, so
  the potential impact was small.
- **Guardrails for the AI agent:** the agent cannot read `.env*` files. During the response it
  handled the secret by pattern and never printed it in full.

## What could be better

- The instruction to set a secret should have included the exact interaction ("run the command
  as is, paste the value when prompted").
- CI credentials should have been designed for least privilege from the start, not after the
  first failure.

## Action items

| Action                                                                                                          | Status |
| --------------------------------------------------------------------------------------------------------------- | ------ |
| Remove long-lived Supabase tokens from CI ([ADR 0002](../adr/0002-migrations-via-direct-connection.md))         | done   |
| Document the rule "secrets are pasted at the prompt, never passed as arguments" ([security.md](../security.md)) | done   |
| Document the "if a secret leaks" procedure ([security.md](../security.md#if-a-secret-leaks))                    | done   |
