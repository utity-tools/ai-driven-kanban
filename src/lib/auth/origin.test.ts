import { describe, expect, it } from "vitest";

import { getRequestOrigin } from "./origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("getRequestOrigin", () => {
  it("prefers the Origin header", () => {
    expect(getRequestOrigin(h({ origin: "http://localhost:3000", host: "other" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back to forwarded host and proto", () => {
    expect(
      getRequestOrigin(h({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" })),
    ).toBe("https://app.example.com");
  });

  it("uses the first forwarded value", () => {
    expect(
      getRequestOrigin(
        h({ "x-forwarded-host": "a.com, b.com", "x-forwarded-proto": "http, https" }),
      ),
    ).toBe("http://a.com");
  });

  it("falls back to Host with https", () => {
    expect(getRequestOrigin(h({ host: "app.example.com" }))).toBe("https://app.example.com");
  });

  it("ignores opaque or non-http origins", () => {
    expect(getRequestOrigin(h({ origin: "null", host: "app.example.com" }))).toBe(
      "https://app.example.com",
    );
    expect(getRequestOrigin(h({ origin: "file:///x" }))).toBeNull();
  });

  it("returns null without usable headers", () => {
    expect(getRequestOrigin(h({}))).toBeNull();
  });
});
