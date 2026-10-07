"use client";

import { useActionState, useId } from "react";

import { updatePassword } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NewPasswordFormState } from "@/lib/auth/recovery";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/schemas";

export function NewPasswordForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<NewPasswordFormState, FormData>(
    updatePassword,
    {},
  );
  const id = useId();
  const ids = { password: `${id}-password`, hint: `${id}-hint`, error: `${id}-error` };
  const describedBy = [ids.hint, state.fieldError ? ids.error : null].filter(Boolean).join(" ");

  return (
    <form action={formAction} noValidate className="grid gap-4">
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={ids.password}>New password</Label>
        <Input
          id={ids.password}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={describedBy}
        />
        <p id={ids.hint} className="text-sm text-muted-foreground">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>
        {state.fieldError ? (
          <p id={ids.error} role="alert" className="text-sm text-destructive">
            {state.fieldError}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
