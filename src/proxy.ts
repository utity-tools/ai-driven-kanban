import { type NextRequest, NextResponse } from "next/server";

import { getAuthRedirect } from "@/lib/auth/routes";
import { updateSession, withSessionCookies } from "@/lib/db/session";
import { getPublicEnv } from "@/lib/env";
import { contentSecurityPolicy, createNonce } from "@/lib/security/headers";

export async function proxy(request: NextRequest) {
  // Next.js reads the nonce from the request's CSP and adds it to its own scripts;
  // `x-nonce` exposes it to Server Components for third-party inline scripts (next-themes).
  const nonce = createNonce();
  const csp = contentSecurityPolicy(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, {
    nonce,
    isDev: process.env.NODE_ENV === "development",
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const { response, claims } = await updateSession(request);
  // Replaces the nonce-less CSP from next.config.ts.
  response.headers.set("content-security-policy", csp);

  const target = getAuthRedirect({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    isSignedIn: claims !== null,
  });
  if (target === null) return response;

  return withSessionCookies(NextResponse.redirect(new URL(target, request.url)), response);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
