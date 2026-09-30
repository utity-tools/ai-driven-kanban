import { describe, expect, it } from "vitest";

import {
  parseQuotaRemaining,
  parseReservation,
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

describe("parseReservation", () => {
  const usageId = "0b1f6c3e-8d2a-4b7e-9c11-2f3a4b5c6d7e";

  it("reads remaining and usage_id from the reservation row", () => {
    expect(
      parseReservation({ remaining: 4, daily_limit: 5, resets_at: "x", usage_id: usageId }),
    ).toEqual({ remaining: 4, usageId });
  });

  it.each([
    null,
    undefined,
    {},
    { remaining: 4 },
    { remaining: -1, usage_id: usageId },
    { remaining: 4, usage_id: "nope" },
  ])("returns null for %j", (row) => {
    expect(parseReservation(row)).toBeNull();
  });
});
