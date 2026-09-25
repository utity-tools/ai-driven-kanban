import { describe, expect, it } from "vitest";

import { DEMO_ERROR_PATH, demoBoardPath, landingPageErrorMessage, visitorKind } from "./demo";

describe("visitorKind", () => {
  it("distinguishes signed-out, demo and member visitors", () => {
    expect(visitorKind(null)).toBe("signed-out");
    expect(visitorKind({ isAnonymous: true })).toBe("demo");
    expect(visitorKind({ isAnonymous: false })).toBe("member");
  });
});

describe("demoBoardPath", () => {
  it("links to the demo board", () => {
    const id = "5b0d8c1e-2f4a-4c6b-9d3e-7a1f2b3c4d5e";
    expect(demoBoardPath(id)).toBe(`/boards/${id}`);
  });

  it.each([null, undefined, "", "not-a-uuid", "../settings"])(
    "falls back to the boards list for %j",
    (id) => {
      expect(demoBoardPath(id)).toBe("/boards");
    },
  );
});

describe("DEMO_ERROR_PATH", () => {
  it("points back to the landing page with the demo error code", () => {
    expect(DEMO_ERROR_PATH).toBe("/?error=demo");
  });
});

describe("landingPageErrorMessage", () => {
  it("returns a message for known codes only", () => {
    expect(landingPageErrorMessage("demo")).toMatch(/couldn't start the demo/);
    expect(landingPageErrorMessage("<script>")).toBeUndefined();
    expect(landingPageErrorMessage("toString")).toBeUndefined();
    expect(landingPageErrorMessage(["demo"])).toBeUndefined();
    expect(landingPageErrorMessage(undefined)).toBeUndefined();
  });
});
