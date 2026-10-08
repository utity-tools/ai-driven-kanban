import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "@/components/auth/auth-heading";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { buttonVariants } from "@/components/ui/button";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/routes";
import { getPasswordResetUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Only for a session opened by a reset (or confirmation) link moments ago: any
 * other session, even a signed-in one, is sent to request a link (ADR 0023).
 * Signed-out visitors never get here: the proxy sends them to /login.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const next = sanitizeNextPath((await searchParams).next);
  const user = await getPasswordResetUser();

  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description={
          user
            ? `For ${user.email ?? "your account"}. Other devices will be signed out.`
            : "To change your password, open a reset link from your email first."
        }
      />
      <div className="grid gap-4">
        {user ? (
          <NewPasswordForm next={next} email={user.email} />
        ) : (
          <Link href={FORGOT_PASSWORD_PATH} className={buttonVariants({ size: "lg" })}>
            Get a reset link
          </Link>
        )}
      </div>
    </>
  );
}
