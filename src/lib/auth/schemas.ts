import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt (used by Supabase Auth) ignores bytes beyond 72.
export const PASSWORD_MAX_LENGTH = 72;

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .min(1, { error: "Enter your email address." })
  .pipe(z.email({ error: "Enter a valid email address." }));

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Enter your password." }).min(1, { error: "Enter your password." }),
});

export const signupSchema = z.object({
  email,
  password: z
    .string({ error: "Enter a password." })
    .min(PASSWORD_MIN_LENGTH, {
      error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    })
    .max(PASSWORD_MAX_LENGTH, {
      error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

export type AuthField = "email" | "password";

/** State returned by the login/signup Server Actions to `useActionState`. */
export type AuthFormState = {
  fieldErrors?: Partial<Record<AuthField, string[]>>;
  formError?: string;
  /** Echoed back so the email survives React's form reset after an action. */
  email?: string;
};

/** Reads the credential fields from FormData without trusting their types. */
export function readCredentials(formData: FormData): { email: unknown; password: unknown } {
  return { email: formData.get("email"), password: formData.get("password") };
}

/** Validates credentials, returning either data or `AuthFormState` field errors. */
export function validateCredentials<S extends typeof loginSchema | typeof signupSchema>(
  schema: S,
  raw: { email: unknown; password: unknown },
): { success: true; data: z.infer<S> } | { success: false; state: AuthFormState } {
  const result = schema.safeParse(raw);
  if (result.success) return { success: true, data: result.data as z.infer<S> };

  const { fieldErrors } = z.flattenError(result.error);
  return {
    success: false,
    state: {
      fieldErrors: { email: fieldErrors.email, password: fieldErrors.password },
      email: typeof raw.email === "string" ? raw.email : undefined,
    },
  };
}
