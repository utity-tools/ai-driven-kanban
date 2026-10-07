"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/auth/redirect";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { type AuthFormState, PASSWORD_MIN_LENGTH } from "@/lib/auth/schemas";

import { ResendConfirmationForm } from "./resend-confirmation-form";

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

  if (state.confirmationSentTo) {
    return <CheckYourEmail email={state.confirmationSentTo} next={next} />;
  }

  return (
    <>
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
      {state.unconfirmed && state.email ? (
        <ResendConfirmationForm email={state.email} next={next} />
      ) : null}
    </>
  );
}

function CheckYourEmail({ email, next }: { email: string; next: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loginHref =
    next === DEFAULT_AFTER_LOGIN_PATH
      ? LOGIN_PATH
      : `${LOGIN_PATH}?${new URLSearchParams({ next }).toString()}`;

  // The submit button that had focus is gone: keep keyboard users in place.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="grid gap-4">
      <div role="status" className="grid gap-1">
        <h2 ref={headingRef} tabIndex={-1} className="font-medium outline-none">
          Check your email
        </h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Open it to finish creating
          your account. Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in instead
          </Link>
          .
        </p>
      </div>
      <ResendConfirmationForm email={email} next={next} />
    </div>
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
