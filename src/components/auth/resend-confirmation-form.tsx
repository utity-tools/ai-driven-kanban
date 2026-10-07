"use client";

import { useActionState } from "react";

import { resendConfirmation } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import type { ResendFormState } from "@/lib/auth/confirm";

type Props = {
  email: string;
  /** Already-sanitised path the new link should return to. */
  next: string;
};

/** "Resend confirmation email" button, with its outcome announced to screen readers. */
export function ResendConfirmationForm({ email, next }: Props) {
  const [state, formAction, pending] = useActionState<ResendFormState, FormData>(
    resendConfirmation,
    {},
  );

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="outline" disabled={pending} aria-disabled={pending}>
        {pending ? "Sending…" : "Resend confirmation email"}
      </Button>
      <p
        role="status"
        className={state.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {state.error ?? state.notice ?? ""}
      </p>
    </form>
  );
}
