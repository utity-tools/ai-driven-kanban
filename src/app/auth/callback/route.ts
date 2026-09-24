import { type NextRequest, NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/redirect";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/db/server";

/** OAuth (PKCE) callback: exchanges the code for a session cookie, then redirects to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  // Only same-origin relative paths: anything else falls back to /boards.
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failure = new URL(LOGIN_PATH, request.url);
  failure.searchParams.set("error", "oauth");
  failure.searchParams.set("next", next);
  return NextResponse.redirect(failure);
}
