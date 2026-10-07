import type { Metadata } from "next";
import Link from "next/link";

import { EmailLinkForm } from "@/components/auth/email-link-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseConfirmLink } from "@/lib/auth/confirm";
import { LOGIN_PATH, loginPathWithNext } from "@/lib/auth/routes";

import { confirmEmail } from "../../actions";

export const metadata: Metadata = {
  title: "Confirm your email",
  // The URL carries a one-time token: never search-indexed, never sent as a Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Landing page of the confirmation email. It never spends the token on GET:
 * mail scanners open links before users do, so confirming takes a button press
 * (a Server Action POST). See ADR 0022.
 *
 * Lives in the (auth) group for its layout; the OAuth callback route handler
 * shares the /auth segment from src/app/auth/callback. Paths never collide.
 */
export default async function ConfirmEmailPage({ searchParams }: PageProps<"/auth/confirm">) {
  const link = parseConfirmLink(await searchParams);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Confirm your email</h1>
        </CardTitle>
        <CardDescription>
          {link
            ? "One last step: confirm your email address to start using your boards."
            : "This confirmation link is incomplete or invalid."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {link ? (
          <EmailLinkForm
            action={confirmEmail}
            tokenHash={link.tokenHash}
            next={link.next}
            submitLabel="Confirm email"
            pendingLabel="Confirming…"
            fallback={{ href: loginPathWithNext(link.next), label: "Go to sign in" }}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Open the link from your latest email again, or sign in to get a new one.
            </p>
            <Link href={LOGIN_PATH} className={buttonVariants({ size: "lg" })}>
              Go to sign in
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
