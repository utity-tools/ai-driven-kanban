import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("merges conditional class names", () => {
    expect(cn("px-2", false && "hidden", "py-1")).toBe("px-2 py-1");
  });

  it("lets later Tailwind classes override conflicting ones", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
