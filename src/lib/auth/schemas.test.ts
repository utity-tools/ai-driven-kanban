import { describe, expect, it } from "vitest";

import { loginSchema, readCredentials, signupSchema, validateCredentials } from "./schemas";

describe("loginSchema", () => {
  it("accepts valid credentials and trims the email", () => {
    expect(loginSchema.parse({ email: "  alice@example.com ", password: "x" })).toEqual({
      email: "alice@example.com",
      password: "x",
    });
  });

  it("requires an email", () => {
    const result = loginSchema.safeParse({ email: "", password: "x" });
    expect(result.error?.issues[0]?.message).toBe("Enter your email address.");
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address.");
  });

  it("requires a password", () => {
    const result = loginSchema.safeParse({ email: "a@b.co", password: "" });
    expect(result.error?.issues[0]?.message).toBe("Enter your password.");
  });

  it("rejects missing (null) fields from FormData", () => {
    const result = loginSchema.safeParse({ email: null, password: null });
    expect(result.success).toBe(false);
  });

  it("does not enforce a minimum length when signing in", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
  });
});

describe("signupSchema", () => {
  it("accepts an 8-character password", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = signupSchema.safeParse({ email: "a@b.co", password: "1234567" });
    expect(result.error?.issues[0]?.message).toBe("Use at least 8 characters.");
  });

  it("rejects passwords longer than 72 characters", () => {
    const result = signupSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) });
    expect(result.error?.issues[0]?.message).toBe("Use at most 72 characters.");
  });
});

describe("validateCredentials", () => {
  it("returns parsed data on success", () => {
    const form = new FormData();
    form.set("email", "alice@example.com");
    form.set("password", "password123");
    expect(validateCredentials(loginSchema, readCredentials(form))).toEqual({
      success: true,
      data: { email: "alice@example.com", password: "password123" },
    });
  });

  it("returns field errors and echoes the email on failure", () => {
    const result = validateCredentials(signupSchema, { email: "nope", password: "short" });
    expect(result).toEqual({
      success: false,
      state: {
        fieldErrors: {
          email: ["Enter a valid email address."],
          password: ["Use at least 8 characters."],
        },
        email: "nope",
      },
    });
  });

  it("never echoes the password", () => {
    const result = validateCredentials(signupSchema, { email: "", password: "short" });
    expect(JSON.stringify(result)).not.toContain('short"');
  });
});
