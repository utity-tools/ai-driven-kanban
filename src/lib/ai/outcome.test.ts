import { describe, expect, it } from "vitest";

import { classifyFinished, gatewayCostUsd } from "./outcome";
import { decompositionProposalSchema, dependencyProposalSchema } from "./schemas";

describe("gatewayCostUsd", () => {
  it.each([
    [{ gateway: { cost: "0.0042" } }, 0.0042],
    [{ gateway: { cost: "0" } }, 0],
    [{ gateway: { cost: "1" } }, 1],
    [{ gateway: { cost: 0.5 } }, 0.5],
    [{ gateway: { cost: "1.01" } }, undefined],
    [{ gateway: { cost: "-0.1" } }, undefined],
    [{ gateway: { cost: "abc" } }, undefined],
    [{ gateway: { cost: "" } }, undefined],
    [{ gateway: {} }, undefined],
    [{ other: { cost: "0.1" } }, undefined],
    [undefined, undefined],
  ])("%j -> %s", (metadata, expected) => {
    expect(gatewayCostUsd(metadata as never)).toBe(expected);
  });
});

describe("classifyFinished", () => {
  const dec = { schema: decompositionProposalSchema, itemsKey: "subtasks" };
  const dep = { schema: dependencyProposalSchema, itemsKey: "dependencies" };
  const subtask = { title: "Do it", estimate: 2 };

  it.each([
    ["valid decomposition", { ...dec, text: JSON.stringify({ subtasks: [subtask] }) }, "ok"],
    ["empty decomposition", { ...dec, text: '{"subtasks":[]}' }, "empty"],
    [
      "too many subtasks",
      { ...dec, text: JSON.stringify({ subtasks: Array(9).fill(subtask) }) },
      "invalid",
    ],
    ["bad estimate", { ...dec, text: '{"subtasks":[{"title":"x","estimate":4}]}' }, "invalid"],
    ["not JSON", { ...dec, text: "sorry, I can't" }, "invalid"],
    ["truncated JSON", { ...dec, text: '{"subtasks":[{"title":' }, "invalid"],
    ["JSON array", { ...dec, text: "[]" }, "invalid"],
    ["null", { ...dec, text: "null" }, "invalid"],
    ["missing key", { ...dec, text: "{}" }, "invalid"],
    [
      "valid dependencies",
      { ...dep, text: '{"dependencies":[{"blocker":"c1","rationale":"r"}]}' },
      "ok",
    ],
    ["empty dependencies", { ...dep, text: '{"dependencies":[]}' }, "empty"],
    [
      "bad dependency",
      { ...dep, text: '{"dependencies":[{"blocker":"","rationale":"r"}]}' },
      "invalid",
    ],
  ])("%s -> %s", (_name, input, expected) => {
    expect(classifyFinished({ finishReason: "stop", ...input })).toBe(expected);
  });

  it("maps finishReason error to error, even with valid text", () => {
    expect(
      classifyFinished({
        ...dec,
        finishReason: "error",
        text: '{"subtasks":[{"title":"x","estimate":null}]}',
      }),
    ).toBe("error");
  });

  it("treats a length-truncated response as invalid", () => {
    expect(classifyFinished({ ...dec, finishReason: "length", text: '{"subtasks":[{"ti' })).toBe(
      "invalid",
    );
  });
});
