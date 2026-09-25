import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce, securityHeaders } from "./headers";

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

  it("leaves scripts unrestricted without a nonce (static assets, next.config.ts)", () => {
    const csp = contentSecurityPolicy("https://abc.supabase.co");
    expect(csp).not.toMatch(/script-src|style-src|default-src/);
  });

  it("allows only nonced scripts and what they load when given a nonce", () => {
    const csp = contentSecurityPolicy("https://abc.supabase.co", { nonce: "abc123", isDev: false });
    expect(csp).toMatch(/; script-src 'self' 'nonce-abc123' 'strict-dynamic'$/);
    expect(csp).not.toContain("unsafe");
  });

  it("allows eval only in development", () => {
    const csp = contentSecurityPolicy(undefined, { nonce: "abc123", isDev: true });
    expect(csp).toContain("'strict-dynamic' 'unsafe-eval'");
  });

  it("never restricts styles: Tailwind, Radix and dnd-kit use inline styles", () => {
    const csp = contentSecurityPolicy(undefined, { nonce: "abc123", isDev: false });
    expect(csp).not.toMatch(/style-src|default-src/);
  });
});

describe("createNonce", () => {
  it("returns 128 random bits as base64", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(atob(nonce)).toHaveLength(16);
  });

  it("is different on every call", () => {
    expect(createNonce()).not.toBe(createNonce());
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
