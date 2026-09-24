import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "./types";

/** Supabase client for Client Components. Session lives in cookies shared with the server. */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
