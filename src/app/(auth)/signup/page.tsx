import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "@/components/auth/auth-heading";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { DEFAULT_AFTER_LOGIN_PATH, sanitizeNextPath } from "@/lib/auth/redirect";
import { LOGIN_PATH } from "@/lib/auth/routes";

import { signup } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next);
  const loginHref =
    next === DEFAULT_AFTER_LOGIN_PATH
      ? LOGIN_PATH
      : `${LOGIN_PATH}?${new URLSearchParams({ next }).toString()}`;

  return (
    <>
      <AuthHeading
        title="Create your account"
        description="You'll get a board to start with right away."
      />
      <div className="grid gap-6">
        <CredentialsForm mode="signup" action={signup} next={next} />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
