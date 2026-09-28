import { describe, expect, it } from "vitest";

import { DEFAULT_AI_MODEL, parsePublicEnv, parseServerEnv } from "./env";

describe("parsePublicEnv", () => {
  it("accepts valid values", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
  });

  it("lists every problem in one clear error", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not a url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects missing values", () => {
    expect(() => parsePublicEnv({})).toThrowError(/Invalid public environment variables/);
  });
});

describe("parseServerEnv", () => {
  it("defaults AI_MODEL when unset", () => {
    expect(parseServerEnv({ AI_MODEL: undefined })).toEqual({ AI_MODEL: DEFAULT_AI_MODEL });
  });

  it("accepts an override", () => {
    expect(parseServerEnv({ AI_MODEL: "openai/gpt-5" })).toEqual({ AI_MODEL: "openai/gpt-5" });
  });

  it("rejects a blank override", () => {
    expect(() => parseServerEnv({ AI_MODEL: "   " })).toThrowError(
      /Invalid server environment variables/,
    );
  });
});
