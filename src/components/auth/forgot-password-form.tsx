"use client";

import { useActionState, useId } from "react";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ForgotPasswordFormState } from "@/lib/auth/recovery";

/** Asks for a reset link. The answer never says whether the email has an account. */
export function ForgotPasswordForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<ForgotPasswordFormState, FormData>(
    requestPasswordReset,
    {},
  );
  const id = useId();
  const emailId = `${id}-email`;
  const errorId = `${id}-email-error`;

  return (
    <form action={formAction} noValidate className="grid gap-4">
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          // Remount when the echoed email changes: Base UI inputs must not
          // change defaultValue after mount.
          key={state.email ?? ""}
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email ?? ""}
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? errorId : undefined}
          autoFocus={Boolean(state.fieldError)}
        />
        {state.fieldError ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {state.fieldError}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p role="status" className="text-sm text-muted-foreground">
        {/* Cleared while sending, so a repeat answer is announced again. */}
        {pending ? "" : (state.notice ?? "")}
      </p>
    </form>
  );
}
