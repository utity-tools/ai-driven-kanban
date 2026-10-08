import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { loginPathWithNext } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const next = sanitizeNextPath((await searchParams).next);

  return (
    <>
      <AuthHeading
        title="Forgot your password?"
        description="Enter your account's email and we'll send you a link to choose a new one."
      />
      <div className="grid gap-6">
        <ForgotPasswordForm next={next} />
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link
            href={loginPathWithNext(next)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
