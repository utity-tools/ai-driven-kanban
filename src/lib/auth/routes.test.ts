import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "./redirect";
import {
  getAuthRedirect,
  isAuthPage,
  isPublicPath,
  loginPathWithNext,
  signupPathWithNext,
  forgotPasswordPathWithNext,
} from "./routes";

describe("isPublicPath", () => {
  it.each([
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/login/",
    "/auth/callback",
    "/auth/anything/else",
    "/api/cards/1/decompose",
  ])("treats %s as public", (path) => expect(isPublicPath(path)).toBe(true));

  it.each(["/boards", "/boards/1", "/authx", "/loginx", "/settings", "/reset-password"])(
    "treats %s as protected",
    (path) => expect(isPublicPath(path)).toBe(false),
  );
});

describe("isAuthPage", () => {
  it("matches only login and signup", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/signup/")).toBe(true);
    // Both must stay reachable while signed in (ADR 0023).
    expect(isAuthPage("/forgot-password")).toBe(false);
    expect(isAuthPage("/reset-password")).toBe(false);
    expect(isAuthPage("/auth/callback")).toBe(false);
    expect(isAuthPage("/")).toBe(false);
  });
});

describe("loginPathWithNext", () => {
  it("encodes the next path", () => {
    expect(loginPathWithNext("/boards/1?x=1&y=2")).toBe(
      "/login?next=%2Fboards%2F1%3Fx%3D1%26y%3D2",
    );
  });
});

describe("getAuthRedirect", () => {
  it("sends signed-out users on protected routes to login with next", () => {
    expect(getAuthRedirect({ pathname: "/boards/1", search: "?tab=a", isSignedIn: false })).toBe(
      "/login?next=%2Fboards%2F1%3Ftab%3Da",
    );
  });

  it("sends signed-out invitees to login and back to the invite", () => {
    const token = "A".repeat(43);
    const target = getAuthRedirect({ pathname: `/invite/${token}`, search: "", isSignedIn: false });
    expect(target).toBe(`/login?next=%2Finvite%2F${token}`);
    expect(sanitizeNextPath(new URLSearchParams(target?.split("?")[1]).get("next"))).toBe(
      `/invite/${token}`,
    );
  });

  it("lets signed-out users reach public routes", () => {
    for (const pathname of ["/", "/login", "/signup", "/auth/callback"]) {
      expect(getAuthRedirect({ pathname, search: "", isSignedIn: false })).toBeNull();
    }
  });

  it("sends signed-in users away from login and signup", () => {
    expect(getAuthRedirect({ pathname: "/login", search: "", isSignedIn: true })).toBe("/boards");
    expect(getAuthRedirect({ pathname: "/signup", search: "", isSignedIn: true })).toBe("/boards");
  });

  it("lets signed-in users reach protected routes and the callback", () => {
    expect(getAuthRedirect({ pathname: "/boards", search: "", isSignedIn: true })).toBeNull();
    expect(
      getAuthRedirect({ pathname: "/auth/callback", search: "", isSignedIn: true }),
    ).toBeNull();
  });
});

describe("signupPathWithNext", () => {
  it("keeps a safe same-origin path", () => {
    const path = `/invite/${"A".repeat(43)}`;
    expect(signupPathWithNext(path)).toBe(`/signup?next=%2Finvite%2F${"A".repeat(43)}`);
  });

  it.each(["//evil.com", "https://evil.com", "/boards", undefined, null])(
    "falls back to plain /signup for %s",
    (value) => {
      expect(signupPathWithNext(value)).toBe("/signup");
    },
  );
});

describe("forgotPasswordPathWithNext", () => {
  it("keeps a non-default next", () => {
    expect(forgotPasswordPathWithNext("/invite/abc")).toBe("/forgot-password?next=%2Finvite%2Fabc");
  });

  it.each([undefined, "/boards", "https://evil.example"])("is the plain path for %j", (next) => {
    expect(forgotPasswordPathWithNext(next)).toBe("/forgot-password");
  });
});
