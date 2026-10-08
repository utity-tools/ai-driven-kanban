import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "@/components/auth/auth-heading";
import { EmailLinkForm } from "@/components/auth/email-link-form";
import { buttonVariants } from "@/components/ui/button";
import { parseRecoveryLink } from "@/lib/auth/recovery";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/routes";

import { verifyRecovery } from "../../actions";

export const metadata: Metadata = {
  title: "Reset your password",
  // The URL carries a one-time token: never search-indexed, never sent as a Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Landing page of the password reset email. Like /auth/confirm, it never spends
 * the token on GET: the button does (ADR 0022, ADR 0023).
 */
export default async function ResetLinkPage({ searchParams }: PageProps<"/auth/reset">) {
  const link = parseRecoveryLink(await searchParams);

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description={
          link
            ? "Continue to choose a new password for your account."
            : "This reset link is incomplete or invalid."
        }
      />
      <div className="grid gap-4">
        {link ? (
          <EmailLinkForm
            action={verifyRecovery}
            tokenHash={link.tokenHash}
            next={link.next}
            submitLabel="Choose a new password"
            pendingLabel="Checking link…"
            fallback={{ href: FORGOT_PASSWORD_PATH, label: "Request a new link" }}
          />
        ) : (
          <Link href={FORGOT_PASSWORD_PATH} className={buttonVariants({ size: "lg" })}>
            Request a new link
          </Link>
        )}
      </div>
    </>
  );
}
