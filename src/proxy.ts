import { type NextRequest, NextResponse } from "next/server";

import { getAuthRedirect } from "@/lib/auth/routes";
import { updateSession, withSessionCookies } from "@/lib/db/session";

export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);

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
