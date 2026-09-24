import { describe, expect, it } from "vitest";

import { DEFAULT_AFTER_LOGIN_PATH, sanitizeNextPath } from "./redirect";

describe("sanitizeNextPath", () => {
  it.each([
    ["/boards", "/boards"],
    ["/boards/123", "/boards/123"],
    ["/boards?view=list#top", "/boards?view=list#top"],
    ["/boards/../settings", "/settings"],
    ["/", "/"],
  ])("keeps same-origin relative path %j", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });

  it.each([
    ["absolute http URL", "https://evil.com"],
    ["absolute URL to self", "http://localhost:3000/boards"],
    ["protocol-relative URL", "//evil.com"],
    ["protocol-relative with path", "//evil.com/boards"],
    ["backslash host", "/\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["encoded-free backslash in path", "/boards\\..\\evil"],
    ["javascript URL", "javascript:alert(1)"],
    ["data URL", "data:text/html,hi"],
    ["relative path without slash", "boards"],
    ["tab injection", "/\t/evil.com"],
    ["newline injection", "/\n/evil.com"],
    ["empty string", ""],
    ["too long", `/${"a".repeat(2048)}`],
  ])("rejects %s", (_label, input) => {
    expect(sanitizeNextPath(input)).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });

  it.each([null, undefined, 42, ["/boards"], {}])("rejects non-string %j", (input) => {
    expect(sanitizeNextPath(input)).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });

  it("uses a custom fallback", () => {
    expect(sanitizeNextPath("//evil.com", "/")).toBe("/");
  });
});
