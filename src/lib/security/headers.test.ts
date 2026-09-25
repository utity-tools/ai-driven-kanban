import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./headers";

describe("contentSecurityPolicy", () => {
  it("forbids framing, plugins and foreign <base> URLs", () => {
    const csp = contentSecurityPolicy("https://abc.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("lets forms reach Supabase Auth and GitHub for the OAuth redirect chain", () => {
    expect(contentSecurityPolicy("https://abc.supabase.co/some/path")).toContain(
      "form-action 'self' https://github.com https://abc.supabase.co",
    );
  });

  it("keeps the local Supabase port in the form-action origin", () => {
    expect(contentSecurityPolicy("http://127.0.0.1:54321")).toContain("http://127.0.0.1:54321");
  });

  it.each([undefined, "not a url"])("omits Supabase when the URL is %s", (url) => {
    expect(contentSecurityPolicy(url)).toMatch(/form-action 'self' https:\/\/github\.com$/);
  });

  it("does not restrict scripts or styles yet (ADR 0011)", () => {
    const csp = contentSecurityPolicy("https://abc.supabase.co");
    expect(csp).not.toMatch(/script-src|style-src|default-src/);
  });
});

describe("securityHeaders", () => {
  it("sends each header exactly once", () => {
    const keys = securityHeaders(undefined).map((header) => header.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ]);
  });
});
