import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { loginPathWithNext } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const next = sanitizeNextPath((await searchParams).next);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Forgot your password?</h1>
        </CardTitle>
        <CardDescription>
          Enter your account&apos;s email and we&apos;ll send you a link to choose a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
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
      </CardContent>
    </Card>
  );
}
