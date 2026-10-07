"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ConfirmFormState } from "@/lib/auth/confirm";

type Props = {
  action: (state: ConfirmFormState, formData: FormData) => Promise<ConfirmFormState>;
  tokenHash: string;
  /** Already-sanitised path to go to afterwards. */
  next: string;
  submitLabel: string;
  pendingLabel: string;
  /** Where to get a new link when this one can't be used. */
  fallback: { href: string; label: string };
};

/**
 * The one button on a page an email links to (confirm, reset password). The
 * token is only spent when it is pressed, never on GET (ADR 0022).
 */
export function EmailLinkForm({
  action,
  tokenHash,
  next,
  submitLabel,
  pendingLabel,
  fallback,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  // A spent or invalid token can't be retried: point to where a new link comes from.
  if (state.error && !state.retryable) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">{state.error}</AlertDescription>
        </Alert>
        <Link href={fallback.href} className={buttonVariants({ size: "lg" })}>
          {fallback.label}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
