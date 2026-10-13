/**
 * AI Gateway options sent with every model call. `disallowPromptTraining` makes the
 * Gateway route only to providers that don't train on the prompts sent to them, and
 * fail the call rather than fall back to one that does (see ADR 0025).
 */
export const GATEWAY_PROVIDER_OPTIONS = {
  gateway: { disallowPromptTraining: true },
};
