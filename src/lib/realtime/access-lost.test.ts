import { describe, expect, it } from "vitest";

import { ACCESS_LOST_HREF, rememberAccessLost, takeAccessLostMessage } from "./access-lost";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("access lost notice", () => {
  it("keeps the title out of the URL", () => {
    expect(ACCESS_LOST_HREF).toBe("/boards?left=1");
  });

  it("reads the remembered title once", () => {
    const storage = memoryStorage();
    rememberAccessLost("Q3 & roadmap?", storage);
    expect(takeAccessLostMessage(storage)).toBe("You no longer have access to “Q3 & roadmap?”");
    expect(takeAccessLostMessage(storage)).toBeNull();
  });

  it("shows nothing when storage is empty, blank or missing", () => {
    expect(takeAccessLostMessage(memoryStorage())).toBeNull();
    const storage = memoryStorage();
    rememberAccessLost("   ", storage);
    expect(takeAccessLostMessage(storage)).toBeNull();
    expect(takeAccessLostMessage(null)).toBeNull();
  });

  it("caps the title length", () => {
    const storage = memoryStorage();
    rememberAccessLost("x".repeat(500), storage);
    expect(takeAccessLostMessage(storage)?.length).toBeLessThan(160);
  });

  it("never throws when storage does", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => rememberAccessLost("A", broken)).not.toThrow();
    expect(takeAccessLostMessage(broken)).toBeNull();
  });
});
