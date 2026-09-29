import { describe, expect, it } from "vitest";

import { accessLostHref, accessLostMessage } from "./access-lost";

describe("access lost notice", () => {
  it("round-trips a title through the URL", () => {
    const href = accessLostHref("Q3 & roadmap?");
    const value = new URL(href, "http://x").searchParams.get("left") ?? undefined;
    expect(accessLostMessage(value)).toBe("You no longer have access to “Q3 & roadmap?”");
  });

  it("ignores missing or blank params", () => {
    expect(accessLostMessage(undefined)).toBeNull();
    expect(accessLostMessage("   ")).toBeNull();
  });

  it("takes the first of repeated params and caps the length", () => {
    expect(accessLostMessage(["A", "B"])).toContain("“A”");
    expect(accessLostMessage("x".repeat(500))?.length).toBeLessThan(160);
  });
});
