"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ConfirmFormState } from "@/lib/auth/confirm";
import { LOGIN_PATH } from "@/lib/auth/routes";

type Props = {
  action: (state: ConfirmFormState, formData: FormData) => Promise<ConfirmFormState>;
  tokenHash: string;
  /** Already-sanitised path to go to once confirmed. */
  next: string;
};

export function ConfirmEmailForm({ action, tokenHash, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.error) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">{state.error}</AlertDescription>
        </Alert>
        <Link
          href={`${LOGIN_PATH}?${new URLSearchParams({ next }).toString()}`}
          className={buttonVariants({ size: "lg" })}
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
        {pending ? "Confirming…" : "Confirm email"}
      </Button>
    </form>
  );
}
