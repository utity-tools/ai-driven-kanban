import type { AuthField, AuthFormState } from "./schemas";

export type FriendlyAuthError = {
  /** Field the message belongs to, or `null` for a form-level message. */
  field: AuthField | null;
  message: string;
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

/**
 * Maps a Supabase Auth error to a message safe to show users. Only the error
 * `code` is inspected; raw messages are never forwarded, so internals don't leak.
 */
export function toFriendlyAuthError(
  error: { code?: string | undefined; status?: number | undefined } | null | undefined,
): FriendlyAuthError {
  switch (error?.code) {
    case "invalid_credentials":
      return { field: null, message: "Incorrect email or password." };
    case "user_already_exists":
    case "email_exists":
      return {
        field: "email",
        message: "An account with this email already exists. Sign in instead.",
      };
    case "weak_password":
      return {
        field: "password",
        message: "That password is too weak. Use a longer password that is harder to guess.",
      };
    case "email_address_invalid":
      return { field: "email", message: "Enter a valid email address." };
    case "email_not_confirmed":
      return { field: null, message: "Confirm your email address before signing in." };
    case "signup_disabled":
    case "email_provider_disabled":
      return { field: null, message: "Sign-ups are currently disabled." };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return { field: null, message: "Too many attempts. Wait a moment and try again." };
    default:
      if (error?.status === 429) {
        return { field: null, message: "Too many attempts. Wait a moment and try again." };
      }
      return { field: null, message: GENERIC_AUTH_ERROR };
  }
}

/** Messages for `/login?error=<code>` (e.g. a failed OAuth callback). */
const LOGIN_PAGE_ERRORS: Record<string, string> = {
  oauth: "We couldn't sign you in with GitHub. Please try again.",
};

export function loginPageErrorMessage(code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(LOGIN_PAGE_ERRORS, code)
    ? LOGIN_PAGE_ERRORS[code]
    : undefined;
}

/** Converts a Supabase Auth error into form state for `useActionState`. */
export function authErrorToFormState(
  error: { code?: string | undefined; status?: number | undefined },
  email: string,
): AuthFormState {
  const friendly = toFriendlyAuthError(error);
  return friendly.field
    ? { fieldErrors: { [friendly.field]: [friendly.message] }, email }
    : { formError: friendly.message, email };
}
