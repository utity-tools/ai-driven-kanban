import { z } from "zod";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL (e.g. http://127.0.0.1:54321).",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required." })
    .trim()
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required." }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Validates raw values and throws one readable error listing every problem. */
export function parsePublicEnv(raw: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(
      `Invalid public environment variables:\n${problems}\n` +
        "Run `pnpm env:local` (local Supabase) or check your deployment settings.",
    );
  }
  return result.data;
}

let cached: PublicEnv | undefined;

/**
 * Public env vars, validated on first use and memoised.
 *
 * Validation is lazy (not at import time) so `next build` can compile routes
 * without Supabase configured; any request that needs Supabase fails fast with
 * a clear message instead. Each variable is referenced explicitly so Next.js
 * inlines it into the browser bundle.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}

/** AI Gateway model string (`provider/model`) used when no override is given. */
export const DEFAULT_AI_MODEL = "anthropic/claude-haiku-4.5";

export const serverEnvSchema = z.object({
  // AI Gateway model id ("provider/model"). AI_GATEWAY_API_KEY (local only; Vercel
  // deployments authenticate via OIDC) is read directly by the AI SDK, not here.
  AI_MODEL: z
    .string({ error: "AI_MODEL must be a non-empty string." })
    .trim()
    .min(1, { error: "AI_MODEL must be a non-empty string." })
    .optional()
    .default(DEFAULT_AI_MODEL),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates raw values and throws one readable error listing every problem. */
export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    throw new Error(`Invalid server environment variables:\n${problems}`);
  }
  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;

/**
 * Server-only env vars, validated on first use and memoised. Not imported by
 * client code: only server modules (e.g. src/lib/ai) call this.
 */
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv({ AI_MODEL: process.env.AI_MODEL });
  return cachedServerEnv;
}
