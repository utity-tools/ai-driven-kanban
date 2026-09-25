import { describe, expect, it, vi } from "vitest";

import {
  DEMO_ERROR_PATH,
  decideOpenDemo,
  demoBoardPath,
  landingPageErrorMessage,
  launchDemo,
  type OpenDemoResult,
  visitorKind,
} from "./demo";

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

describe("decideOpenDemo", () => {
  const id = "5b0d8c1e-2f4a-4c6b-9d3e-7a1f2b3c4d5e";

  it("sends members to their boards", () => {
    expect(decideOpenDemo("member", null)).toEqual({
      result: { status: "open", path: "/boards" },
      signOut: false,
    });
  });

  it("asks signed-out visitors to sign in first", () => {
    expect(decideOpenDemo("signed-out", null)).toEqual({
      result: { status: "restart" },
      signOut: false,
    });
  });

  it("opens the demo board of a demo visitor", () => {
    expect(decideOpenDemo("demo", id)).toEqual({
      result: { status: "open", path: `/boards/${id}` },
      signOut: false,
    });
  });

  it("signs out and restarts an expired demo without a board", () => {
    expect(decideOpenDemo("demo", null)).toEqual({ result: { status: "restart" }, signOut: true });
  });
});

describe("launchDemo", () => {
  const open = (path: string): OpenDemoResult => ({ status: "open", path });
  const restart: OpenDemoResult = { status: "restart" };

  function deps(signIns: boolean[], opens: OpenDemoResult[]) {
    const signInAnonymously = vi.fn(async () => ({ ok: signIns.shift() ?? false }));
    const openDemo = vi.fn(async () => opens.shift() ?? restart);
    return { signInAnonymously, openDemo };
  }

  it("signs a signed-out visitor in, then opens the demo", async () => {
    const d = deps([true], [open("/boards/1")]);
    await expect(launchDemo(d, { hasDemoSession: false })).resolves.toBe("/boards/1");
    expect(d.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(d.openDemo).toHaveBeenCalledTimes(1);
  });

  it("goes to the error page when the sign-in fails, without calling the server", async () => {
    const d = deps([false], []);
    await expect(launchDemo(d, { hasDemoSession: false })).resolves.toBe(DEMO_ERROR_PATH);
    expect(d.openDemo).not.toHaveBeenCalled();
  });

  it("reuses an existing demo session without signing in", async () => {
    const d = deps([], [open("/boards/2")]);
    await expect(launchDemo(d, { hasDemoSession: true })).resolves.toBe("/boards/2");
    expect(d.signInAnonymously).not.toHaveBeenCalled();
  });

  it("restarts an expired demo session with one fresh sign-in", async () => {
    const d = deps([true], [restart, open("/boards/3")]);
    await expect(launchDemo(d, { hasDemoSession: true })).resolves.toBe("/boards/3");
    expect(d.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(d.openDemo).toHaveBeenCalledTimes(2);
  });

  it("never signs in twice", async () => {
    const fresh = deps([true, true], [restart, restart]);
    await expect(launchDemo(fresh, { hasDemoSession: false })).resolves.toBe(DEMO_ERROR_PATH);
    expect(fresh.signInAnonymously).toHaveBeenCalledTimes(1);

    const expired = deps([true, true], [restart, restart]);
    await expect(launchDemo(expired, { hasDemoSession: true })).resolves.toBe(DEMO_ERROR_PATH);
    expect(expired.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("goes to the error page when a step throws", async () => {
    const d = deps([true], []);
    d.openDemo.mockRejectedValueOnce(new Error("network"));
    await expect(launchDemo(d, { hasDemoSession: false })).resolves.toBe(DEMO_ERROR_PATH);
  });
});
