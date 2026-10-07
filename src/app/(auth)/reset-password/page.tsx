import type { Metadata } from "next";
import Link from "next/link";

import { NewPasswordForm } from "@/components/auth/new-password-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Choose a new password</h1>
        </CardTitle>
        <CardDescription>
          {user
            ? `For ${user.email ?? "your account"}. Other devices will be signed out.`
            : "To change your password, open a reset link from your email first."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {user ? (
          <NewPasswordForm next={next} email={user.email} />
        ) : (
          <Link href={FORGOT_PASSWORD_PATH} className={buttonVariants({ size: "lg" })}>
            Get a reset link
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
