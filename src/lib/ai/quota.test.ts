import { describe, expect, it } from "vitest";

import {
  parseQuotaRemaining,
  quotaExceededKind,
  quotaRemainingMessage,
  secondsUntilQuotaReset,
} from "./quota";

describe("quotaExceededKind", () => {
  it("maps the reservation's custom SQLSTATEs", () => {
    expect(quotaExceededKind("AIQ01")).toBe("user");
    expect(quotaExceededKind("AIQ02")).toBe("global");
  });

  it("returns null for any other error", () => {
    expect(quotaExceededKind("42501")).toBeNull();
    expect(quotaExceededKind("")).toBeNull();
    expect(quotaExceededKind(undefined)).toBeNull();
    expect(quotaExceededKind("toString")).toBeNull();
  });
});

describe("secondsUntilQuotaReset", () => {
  it("counts up to the next midnight UTC", () => {
    expect(secondsUntilQuotaReset(new Date("2026-09-28T23:00:00Z"))).toBe(3600);
    expect(secondsUntilQuotaReset(new Date("2026-09-28T00:00:00Z"))).toBe(86400);
  });

  it("rounds partial seconds up and crosses month ends", () => {
    expect(secondsUntilQuotaReset(new Date("2026-09-30T23:59:59.500Z"))).toBe(1);
    expect(secondsUntilQuotaReset(new Date("2026-12-31T12:00:00Z"))).toBe(43200);
  });
});

describe("parseQuotaRemaining", () => {
  it("reads a non-negative integer", () => {
    expect(parseQuotaRemaining("0")).toBe(0);
    expect(parseQuotaRemaining("19")).toBe(19);
  });

  it("ignores a missing or malformed header", () => {
    expect(parseQuotaRemaining(null)).toBeNull();
    expect(parseQuotaRemaining("")).toBeNull();
    expect(parseQuotaRemaining("-1")).toBeNull();
    expect(parseQuotaRemaining("2.5")).toBeNull();
    expect(parseQuotaRemaining("abc")).toBeNull();
  });
});

describe("quotaRemainingMessage", () => {
  it("pluralises and explains when none are left", () => {
    expect(quotaRemainingMessage(2)).toBe("2 AI suggestions left today.");
    expect(quotaRemainingMessage(1)).toBe("1 AI suggestion left today.");
    expect(quotaRemainingMessage(0)).toMatch(/^No AI suggestions left today/);
  });
});
