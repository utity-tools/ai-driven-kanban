import type { Metadata } from "next";
import Link from "next/link";

import { CredentialsForm } from "@/components/auth/credentials-form";
import { GitHubSignInForm } from "@/components/auth/github-sign-in-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginPageErrorMessage } from "@/lib/auth/errors";
import { DEFAULT_AFTER_LOGIN_PATH, sanitizeNextPath } from "@/lib/auth/redirect";
import { SIGNUP_PATH } from "@/lib/auth/routes";

import { login } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next);
  const pageError = loginPageErrorMessage(params.error);
  const signupHref =
    next === DEFAULT_AFTER_LOGIN_PATH
      ? SIGNUP_PATH
      : `${SIGNUP_PATH}?${new URLSearchParams({ next }).toString()}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Sign in</h1>
        </CardTitle>
        <CardDescription>Welcome back. Sign in to see your boards.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {pageError ? (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">{pageError}</AlertDescription>
          </Alert>
        ) : null}
        <GitHubSignInForm next={next} />
        <Divider />
        <CredentialsForm mode="login" action={login} next={next} />
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href={signupHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
