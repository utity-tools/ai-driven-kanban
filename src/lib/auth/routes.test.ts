import { describe, expect, it } from "vitest";

import { getAuthRedirect, isAuthPage, isPublicPath, loginPathWithNext } from "./routes";

describe("isPublicPath", () => {
  it.each(["/", "/login", "/signup", "/login/", "/auth/callback", "/auth/anything/else"])(
    "treats %s as public",
    (path) => expect(isPublicPath(path)).toBe(true),
  );

  it.each(["/boards", "/boards/1", "/authx", "/loginx", "/settings"])(
    "treats %s as protected",
    (path) => expect(isPublicPath(path)).toBe(false),
  );
});

describe("isAuthPage", () => {
  it("matches only login and signup", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/signup/")).toBe(true);
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
