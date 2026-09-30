import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("detects Spanish", () => {
    expect(detectLanguage("Crear el modelo de datos para la tarjeta")).toBe("es");
  });

  it("detects English", () => {
    expect(detectLanguage("Add the data model for the card")).toBe("en");
  });

  it("is inconclusive without function words", () => {
    expect(detectLanguage("OAuth PKCE")).toBeNull();
    expect(detectLanguage("")).toBeNull();
  });
});
