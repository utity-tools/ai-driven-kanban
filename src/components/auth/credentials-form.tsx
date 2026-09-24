"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthFormState, PASSWORD_MIN_LENGTH } from "@/lib/auth/schemas";

type Mode = "login" | "signup";

const COPY: Record<Mode, { submit: string; pending: string }> = {
  login: { submit: "Sign in", pending: "Signing in…" },
  signup: { submit: "Create account", pending: "Creating account…" },
};

type Props = {
  mode: Mode;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  /** Already-sanitised path to return to after success. */
  next: string;
};

export function CredentialsForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const ids = {
    email: `${id}-email`,
    emailError: `${id}-email-error`,
    password: `${id}-password`,
    passwordError: `${id}-password-error`,
    passwordHint: `${id}-password-hint`,
    formError: `${id}-form-error`,
  };

  const emailErrors = state.fieldErrors?.email;
  const passwordErrors = state.fieldErrors?.password;

  // After a failed submit, move focus to the first invalid field.
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const passwordDescribedBy =
    [mode === "signup" ? ids.passwordHint : null, passwordErrors ? ids.passwordError : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-describedby={state.formError ? ids.formError : undefined}
      className="grid gap-4"
    >
      <input type="hidden" name="next" value={next} />

      {state.formError ? (
        <Alert variant="destructive" id={ids.formError}>
          <AlertDescription className="text-destructive">{state.formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={ids.email}>Email</Label>
        <Input
          // Remount when the echoed email changes: Base UI inputs must not
          // change defaultValue after mount.
          key={state.email ?? ""}
          id={ids.email}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email ?? ""}
          aria-invalid={emailErrors ? true : undefined}
          aria-describedby={emailErrors ? ids.emailError : undefined}
        />
        <FieldError id={ids.emailError} errors={emailErrors} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.password}>Password</Label>
        <Input
          id={ids.password}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          aria-invalid={passwordErrors ? true : undefined}
          aria-describedby={passwordDescribedBy}
        />
        {mode === "signup" ? (
          <p id={ids.passwordHint} className="text-sm text-muted-foreground">
            At least {PASSWORD_MIN_LENGTH} characters.
          </p>
        ) : null}
        <FieldError id={ids.passwordError} errors={passwordErrors} />
      </div>

      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending ? COPY[mode].pending : COPY[mode].submit}
      </Button>
    </form>
  );
}

function FieldError({ id, errors }: { id: string; errors: string[] | undefined }) {
  if (!errors?.length) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {errors.join(" ")}
    </p>
  );
}
