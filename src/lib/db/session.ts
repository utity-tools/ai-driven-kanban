import { createServerClient } from "@supabase/ssr";
import type { JwtPayload } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "./types";

/**
 * Refreshes the Supabase session for the proxy and returns the response that
 * carries any updated auth cookies, plus the verified JWT claims (or `null`).
 *
 * Any response returned by the proxy instead of this one (e.g. a redirect)
 * must copy its cookies with `withSessionCookies`, or the refreshed session is
 * lost and the user gets logged out.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; claims: JwtPayload | null }> {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // No-cache headers so a CDN never serves one user's session to another.
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // Do not run code between creating the client and this call. getClaims()
  // verifies the JWT (and refreshes it if expired); never trust getSession()
  // alone on the server.
  const { data } = await supabase.auth.getClaims();

  return { response, claims: data?.claims ?? null };
}

/** Copies auth cookies and cache headers from the session response onto another response. */
export function withSessionCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(key);
    if (value !== null) target.headers.set(key, value);
  }
  return target;
}
