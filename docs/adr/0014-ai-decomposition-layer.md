# 0014. AI decomposition layer

- **Status:** accepted
- **Date:** 2026-09-28

## Context

v0.2 adds the first AI feature: given a card's title and description, propose technical
subtasks with story-point estimates. The proposal must never be trusted or persisted directly —
it is model output shown to a human who confirms what to keep (delivery 4) — and the card
content it reads is untrusted user text that must not be able to change the model's
instructions. We also need this to be testable without ever calling a real model, and to fit
the project's existing patterns (versioned prompts, Zod-validated output, server-only model
calls, Supabase/RLS for access control).

## Decision

Use the Vercel AI SDK v6 (`ai@^6`) via the AI Gateway, called from a Next.js Route Handler:

- **Model resolution:** a plain AI Gateway model string (`"anthropic/claude-haiku-4.5"` by
  default), overridable with the `AI_MODEL` env var (`src/lib/env.ts#getServerEnv`). No
  provider package is installed: the string resolves through `ai`'s default global Gateway
  provider. `AI_GATEWAY_API_KEY` authenticates locally; Vercel deployments use OIDC and need no
  key.
- **Streaming structured output:** `streamText` with `output: Output.object({ schema })` from
  `ai`, returned to the client with
  `result.toTextStreamResponse()` — the format `experimental_useObject` (delivery 4's UI) reads
  chunked JSON text from.
- **Schema:** `src/lib/ai/schemas.ts` exports `decompositionProposalSchema`
  (`{ subtasks: [{ title, estimate }] }`), 1–8 subtasks (`MAX_PROPOSED_SUBTASKS = 8`), titles
  trimmed and 1–200 chars, `estimate` reusing `estimateSchema` from
  `src/lib/subtasks/schemas.ts` (the same Fibonacci-or-null scale the checklist already uses).
  No rationale field: the proposal is the smallest shape the review UI needs.
- **Versioned prompt:** `src/lib/ai/prompts/decompose-v1.ts` exports `PROMPT_VERSION` and pure
  functions only. The card's title and description are wrapped in `<card_title>` /
  `<card_description>` delimiters and the system prompt tells the model to treat their content
  as data, never instructions; any literal delimiter-like tag already present in the card text
  is neutralised before it is interpolated, so a card can't forge a closing tag and inject
  fake instructions.
- **Route handler:** `POST /api/cards/[cardId]/decompose` validates `cardId` as a UUID,
  requires a session (401 otherwise), denies anonymous demo users outright (403 — a quota for
  them is scoped to delivery 5, not this one), and reads the card through the session-scoped
  Supabase client so RLS decides visibility (a missing/invisible card is a 404, indistinguishable
  on purpose, matching `getBoard`'s existing convention). The request's abort signal is passed
  to the model call, so closing the stream stops generation (and token spend).
- **Nothing persisted:** `streamDecomposition` only returns a stream; no write path exists yet.
  Saving accepted subtasks is delivery 4's job, with explicit user confirmation. Because the
  `card_subtasks` INSERT policy forces `source = 'manual'`, rows with `source = 'ai'` must be
  written through a dedicated server-side path, not the existing manual Server Action.
- **Proxy:** `/api/` was added to `PUBLIC_PREFIXES` in `src/lib/auth/routes.ts` so the proxy
  does not redirect unauthenticated API requests to `/login`; API routes authenticate
  themselves and must be able to return a JSON 401, not an HTML redirect.

## Alternatives considered

- **`generateText` (non-streaming):** simpler, but the card modal would show nothing until the
  full proposal arrives; streaming lets the review UI render subtasks as they're generated.
- **A dedicated `@ai-sdk/anthropic` provider package:** pins the app to one provider and adds a
  dependency; the Gateway's model string already gives provider choice via `AI_MODEL` with no
  extra package.
- **Validating the model's raw JSON text ourselves:** `Output.object()` already validates the
  complete output against the Zod schema and rejects with `NoObjectGeneratedError` on
  malformed output, so a hand-rolled parser would just duplicate that.

## Consequences

- Model calls are isolated to `src/lib/ai/` and take an injected `LanguageModel`, so
  `decompose.test.ts` uses `MockLanguageModelV3` / `simulateReadableStream` from `ai/test` —
  no real model is ever called in tests, and the module needs no `import "server-only"` guard
  (unlike `src/lib/db/server.ts` or `src/lib/boards/queries.ts`) because it touches no
  cookies/session; the actual call only happens inside the Route Handler, which is always
  server-side.
- Prompt changes are traceable: bump `PROMPT_VERSION` (`decompose-v2`, ...) whenever the
  wording or output shape changes, and re-run `evals/` before/after.
- CSP is unaffected: the client calls `/api/cards/[id]/decompose` same-origin (no `connect-src`
  exists or is needed today), and the model call itself happens server-side, not from the
  browser.
- The AI Gateway's free monthly credit does not cover Anthropic models ("Free tier users do not
  have access to this model"): every environment that calls the default model needs paid
  Gateway credits. We keep auto-reload off and a Gateway spend budget as a hard cap until
  delivery 5 adds per-user quotas and a global daily cost cap.
- Errors after the stream starts can't change the HTTP status: a model failure (no credits,
  provider outage, invalid output) reaches the client as a `200` with an empty or truncated
  body, and the cause is only in the server log (`ai.decompose.error`). The review UI must treat
  an empty or schema-invalid final object as a failure, not as "no subtasks".
- **Revisit:** delivery 4 adds the review UI and the confirm-to-save Server Action; delivery 5
  adds a decomposition quota for anonymous demo users (today they get a flat 403).
