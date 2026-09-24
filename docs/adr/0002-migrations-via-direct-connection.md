# 0002. Apply migrations through a direct database connection, not a Supabase access token

- **Status:** accepted
- **Date:** 2026-09-24

## Context

Migrations must reach the cloud databases only through CI (ADR 0001). The first version of the
workflow used the Supabase CLI the usual way: `supabase link` with a Supabase access token,
then `supabase db push`.

We created a scoped (fine-grained) access token limited to the staging project with the minimum
permissions we expected: Migrations (read-write), Project Settings, Database Config and
Connection Pooling (read). The first run failed:

```
Missing required permission(s): api_gateway_keys_read
```

`supabase link` reads the project's API keys, including the **secret key**, which bypasses Row
Level Security. Granting that to a CI token only to "link" the project widens its blast radius
far beyond applying migrations.

GitHub-hosted runners only have IPv4, and the direct database host is IPv6, so CI must connect
through the Supabase **session pooler** (port 5432).

## Decision

CI applies migrations with `supabase db push --db-url <connection string>`, connecting through
the session pooler. No `supabase link`, no Supabase access token.

Per GitHub environment (`staging`, `production`):

- secret `SUPABASE_DB_PASSWORD`,
- variables `SUPABASE_PROJECT_REF` and `SUPABASE_POOLER_HOST` (not secret).

The workflow URL-encodes the password, masks it in logs and builds the connection string at
runtime.

## Alternatives considered

- **Add `api_gateway_keys_read` to the scoped token:** works, but the token could read the secret
  key. Also needs one more credential to store and rotate (tokens expire every 90 days).
- **Legacy (full account) access token:** access to every project in the account. Rejected.
- **Direct connection (IPv6) host:** not reachable from GitHub-hosted runners without the paid
  IPv4 add-on.

## Consequences

- One secret per environment instead of two; nothing to rotate every 90 days.
- The database password is a powerful credential: it is only stored in GitHub environments
  (`production` requires manual approval) and in the maintainer's password manager.
- Changing the database password in Supabase requires updating the environment secret.
- CLI commands that need `link` (e.g. generating types from a remote project) are not used in
  CI; types are generated from the local database.
