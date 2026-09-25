import { describe, expect, it } from "vitest";

import { comparePositions } from "@/lib/boards/ordering";

import {
  keyboardMoveIndex,
  neighborSubtaskId,
  neighborsForMove,
  nextSubtaskPosition,
  subtaskMovedMessage,
} from "./reorder";

const IDS = ["a", "b", "c", "d"];

describe("neighborsForMove", () => {
  it("moves down: between the items around the new index", () => {
    expect(neighborsForMove(IDS, "a", 2)).toEqual({ previousId: "c", nextId: "d" });
  });

  it("moves up", () => {
    expect(neighborsForMove(IDS, "d", 1)).toEqual({ previousId: "a", nextId: "b" });
  });

  it("moves to either end", () => {
    expect(neighborsForMove(IDS, "c", 0)).toEqual({ previousId: null, nextId: "a" });
    expect(neighborsForMove(IDS, "b", 3)).toEqual({ previousId: "d", nextId: null });
  });

  it("returns null when nothing changes or the move is invalid", () => {
    expect(neighborsForMove(IDS, "b", 1)).toBeNull();
    expect(neighborsForMove(IDS, "zz", 0)).toBeNull();
    expect(neighborsForMove(IDS, "a", -1)).toBeNull();
    expect(neighborsForMove(IDS, "a", 4)).toBeNull();
  });
});

describe("nextSubtaskPosition", () => {
  it("sorts after every existing subtask, without renumbering", () => {
    const position = nextSubtaskPosition([
      { position: "a0" },
      { position: "a2" },
      { position: "a1" },
    ]);
    expect(comparePositions(position, "a2")).toBe(1);
  });

  it("works for an empty checklist", () => {
    expect(nextSubtaskPosition([])).toMatch(/^[0-9A-Za-z]+$/);
  });
});

describe("neighborSubtaskId", () => {
  it("prefers the next subtask, then the previous one", () => {
    expect(neighborSubtaskId(IDS, "b")).toBe("c");
    expect(neighborSubtaskId(IDS, "d")).toBe("c");
    expect(neighborSubtaskId(["a"], "a")).toBeNull();
    expect(neighborSubtaskId(IDS, "zz")).toBeNull();
  });
});

describe("keyboardMoveIndex", () => {
  it("moves one place with the arrows, to either end with Home and End", () => {
    expect(keyboardMoveIndex("ArrowUp", 2, 4)).toBe(1);
    expect(keyboardMoveIndex("ArrowDown", 2, 4)).toBe(3);
    expect(keyboardMoveIndex("Home", 2, 4)).toBe(0);
    expect(keyboardMoveIndex("End", 1, 4)).toBe(3);
  });

  it("does nothing past either end, in place, or for other keys", () => {
    expect(keyboardMoveIndex("ArrowUp", 0, 4)).toBeNull();
    expect(keyboardMoveIndex("ArrowDown", 3, 4)).toBeNull();
    expect(keyboardMoveIndex("Home", 0, 4)).toBeNull();
    expect(keyboardMoveIndex("End", 3, 4)).toBeNull();
    expect(keyboardMoveIndex("ArrowLeft", 1, 4)).toBeNull();
    expect(keyboardMoveIndex(" ", 1, 4)).toBeNull();
    expect(keyboardMoveIndex("ArrowUp", -1, 4)).toBeNull();
  });
});

describe("subtaskMovedMessage", () => {
  const subtasks = [
    { id: "a", title: "Write tests" },
    { id: "b", title: "Ship it" },
  ];

  it("names the subtask and its new position", () => {
    expect(subtaskMovedMessage(subtasks, ["b", "a"], "b")).toBe(
      "Subtask Ship it is now in position 1 of 2.",
    );
  });

  it("is empty for unknown ids", () => {
    expect(subtaskMovedMessage(subtasks, ["a", "b"], "zz")).toBe("");
  });
});
