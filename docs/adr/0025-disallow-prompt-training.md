# 0025. Route AI calls only to providers that don't train on prompts

- **Status:** accepted
- **Date:** 2026-10-13

## Context

The landing FAQ should answer "Is my data used to train AI models?". Today the honest answer
rests only on policy: Anthropic does not train on API inputs or outputs by default, and the AI
Gateway states it does not use prompts for training
([Gateway docs](https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training)). But the model is configurable (`AI_MODEL`,
[ADR 0014](0014-ai-decomposition-layer.md)) and the Gateway can fall back to other providers, so
nothing in the code guarantees the promise.

Board text reaches the model in two calls; the README's "AI: privacy and limits" section lists
exactly what each one sends ([ADR 0014](0014-ai-decomposition-layer.md),
[ADR 0020](0020-ai-proposed-dependencies.md)).

## Decision

Every model call sends `providerOptions.gateway.disallowPromptTraining: true`
(`src/lib/ai/gateway-options.ts`). The Gateway then routes only to providers it has an
agreement with not to train on prompts, fallbacks included, and fails the call with `no_providers_available`
instead of routing elsewhere. The FAQ states the promise in user terms.

## Alternatives considered

- **Zero data retention (`zeroDataRetention: true`):** a stricter superset (no storage at all),
  but only available on Vercel Pro and Enterprise; the team is on Hobby.
- **Policy only, no flag:** true today with Anthropic, but silently breaks if `AI_MODEL` or a
  Gateway fallback points to a provider that trains on prompts.

## Consequences

- Choosing a model with no compliant provider fails every AI call (surfaced as the existing
  error state in the review UI), so a model change must be checked against the Gateway's
  provider list. At the time of writing, every provider the Gateway lists for the default model
  (`anthropic/claude-haiku-4.5`: Anthropic, Amazon Bedrock, Google Vertex AI, Claude Platform on
  AWS) is on its no-training list.
- BYOK keys are skipped while the flag is on. The app uses none today; adding provider keys later
  would need them to be covered by the provider's own no-training terms.
- Providers may still retain requests for a limited time (e.g. abuse monitoring); the FAQ
  promises no training, not no retention.
- **Revisit:** if the team moves to Pro, switch to `zeroDataRetention` and update the FAQ.
