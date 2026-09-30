import { describe, expect, it } from "vitest";

import { visibleOutcome } from "./visible-outcome";

describe("visibleOutcome", () => {
  it("shows an accepted proposal with the success tone", () => {
    expect(visibleOutcome("added", "Added 2 subtasks.")).toEqual({
      tone: "success",
      text: "Added 2 subtasks.",
    });
  });

  it("shows a stop with nothing streamed in the muted tone", () => {
    expect(visibleOutcome("stopped", "Stopped. No blockers were suggested.")).toEqual({
      tone: "muted",
      text: "Stopped. No blockers were suggested.",
    });
  });

  it("keeps a discard screen-reader only", () => {
    expect(visibleOutcome("discarded", "Suggestions discarded.")).toBeNull();
  });
});
