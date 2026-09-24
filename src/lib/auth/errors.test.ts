import { describe, expect, it } from "vitest";

import {
  authErrorToFormState,
  GENERIC_AUTH_ERROR,
  loginPageErrorMessage,
  toFriendlyAuthError,
} from "./errors";

describe("toFriendlyAuthError", () => {
  it("maps invalid credentials to a form-level message", () => {
    expect(toFriendlyAuthError({ code: "invalid_credentials", status: 400 })).toEqual({
      field: null,
      message: "Incorrect email or password.",
    });
  });

  it.each(["user_already_exists", "email_exists"])("maps %s to the email field", (code) => {
    expect(toFriendlyAuthError({ code })).toMatchObject({ field: "email" });
  });

  it("maps weak_password to the password field", () => {
    expect(toFriendlyAuthError({ code: "weak_password" })).toMatchObject({ field: "password" });
  });

  it("maps rate limiting by status when the code is unknown", () => {
    expect(toFriendlyAuthError({ status: 429 }).message).toMatch(/too many attempts/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(toFriendlyAuthError({ code: "unexpected_failure", status: 500 })).toEqual({
      field: null,
      message: GENERIC_AUTH_ERROR,
    });
    expect(toFriendlyAuthError(null).message).toBe(GENERIC_AUTH_ERROR);
  });
});

describe("authErrorToFormState", () => {
  it("puts field errors on the field", () => {
    expect(authErrorToFormState({ code: "weak_password" }, "a@b.co")).toEqual({
      fieldErrors: { password: [expect.stringMatching(/too weak/)] },
      email: "a@b.co",
    });
  });

  it("puts other errors at form level", () => {
    expect(authErrorToFormState({ code: "invalid_credentials" }, "a@b.co")).toEqual({
      formError: "Incorrect email or password.",
      email: "a@b.co",
    });
  });
});

describe("loginPageErrorMessage", () => {
  it("returns a message for known codes only", () => {
    expect(loginPageErrorMessage("oauth")).toMatch(/GitHub/);
    expect(loginPageErrorMessage("<script>")).toBeUndefined();
    expect(loginPageErrorMessage("toString")).toBeUndefined();
    expect(loginPageErrorMessage(["oauth"])).toBeUndefined();
  });
});
