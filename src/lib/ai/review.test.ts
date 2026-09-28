import { describe, expect, it } from "vitest";

import { SUBTASKS_PER_CARD_MAX } from "@/lib/subtasks/schemas";

import {
  DECOMPOSITION_REQUEST_ERROR,
  type ReviewItem,
  addSubtasksLabel,
  decompositionErrorMessage,
  optimisticAiSubtasks,
  reviewSelection,
  reviewTitleError,
  streamedSubtasks,
  suggestAvailability,
  toAcceptPayload,
  toReviewItems,
} from "./review";
import { MAX_PROPOSED_SUBTASKS, acceptProposalSchema } from "./schemas";

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const CARD_ID = "22222222-2222-4222-8222-222222222222";

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return { key: "k", checked: true, title: "Write the migration", estimate: 3, ...overrides };
}

describe("suggestAvailability", () => {
  const base = { featureEnabled: true, editable: true, subtaskCount: 0 };

  it("is enabled for owners and editors on an active card", () => {
    expect(suggestAvailability(base)).toBe("enabled");
  });

  it("is hidden when the feature flag is off", () => {
    expect(suggestAvailability({ ...base, featureEnabled: false })).toBe("hidden");
  });

  it("is hidden for viewers and archived cards (not editable)", () => {
    expect(suggestAvailability({ ...base, editable: false })).toBe("hidden");
  });

  it("is hidden when the checklist is full", () => {
    expect(suggestAvailability({ ...base, subtaskCount: SUBTASKS_PER_CARD_MAX })).toBe("hidden");
    expect(suggestAvailability({ ...base, subtaskCount: SUBTASKS_PER_CARD_MAX - 1 })).toBe(
      "enabled",
    );
  });
});

describe("streamedSubtasks", () => {
  it("returns nothing before anything arrives", () => {
    expect(streamedSubtasks(undefined)).toEqual([]);
    expect(streamedSubtasks({})).toEqual([]);
  });

  it("guards partial items: no title yet is skipped, a missing estimate is none", () => {
    expect(
      streamedSubtasks({
        subtasks: [{ title: "Add the table", estimate: 2 }, { title: "Add the ro" }, {}, undefined],
      }),
    ).toEqual([
      { title: "Add the table", estimate: 2 },
      { title: "Add the ro", estimate: null },
    ]);
  });

  it("skips blank titles and reads off-scale estimates as none", () => {
    expect(
      streamedSubtasks({
        subtasks: [
          { title: "   ", estimate: 1 },
          { title: "Seed data", estimate: 4 as never },
        ],
      }),
    ).toEqual([{ title: "Seed data", estimate: null }]);
  });

  it("never returns more than the cap", () => {
    const subtasks = Array.from({ length: MAX_PROPOSED_SUBTASKS + 3 }, (_, i) => ({
      title: `Step ${i}`,
      estimate: 1 as const,
    }));
    expect(streamedSubtasks({ subtasks })).toHaveLength(MAX_PROPOSED_SUBTASKS);
  });
});

describe("toReviewItems", () => {
  it("checks every row, normalises titles and gives each a key", () => {
    let n = 0;
    const items = toReviewItems(
      [
        { title: "  Add   index ", estimate: 1 },
        { title: "Test it", estimate: null },
      ],
      () => `key-${n++}`,
    );
    expect(items).toEqual([
      { key: "key-0", checked: true, title: "Add index", estimate: 1 },
      { key: "key-1", checked: true, title: "Test it", estimate: null },
    ]);
  });
});

describe("reviewTitleError", () => {
  it("accepts 1 to 200 characters after trimming", () => {
    expect(reviewTitleError("a")).toBeNull();
    expect(reviewTitleError(`  ${"a".repeat(200)}  `)).toBeNull();
  });

  it("rejects empty and overlong titles", () => {
    expect(reviewTitleError("   ")).toMatch(/empty/);
    expect(reviewTitleError("a".repeat(201))).toMatch(/200/);
  });
});

describe("reviewSelection", () => {
  it("can submit valid checked rows", () => {
    expect(reviewSelection([item(), item({ checked: false })], 0)).toEqual({
      checkedCount: 1,
      canSubmit: true,
      problem: null,
    });
  });

  it("needs at least one checked row", () => {
    const selection = reviewSelection([item({ checked: false })], 0);
    expect(selection.canSubmit).toBe(false);
    expect(selection.checkedCount).toBe(0);
    expect(selection.problem).toMatch(/at least one/);
  });

  it("blocks on an invalid checked title but ignores unchecked ones", () => {
    expect(reviewSelection([item({ title: " " })], 0).canSubmit).toBe(false);
    expect(reviewSelection([item(), item({ title: " ", checked: false })], 0).canSubmit).toBe(true);
  });

  it("blocks when the card has no room for the selection", () => {
    const selection = reviewSelection([item(), item()], SUBTASKS_PER_CARD_MAX - 1);
    expect(selection.canSubmit).toBe(false);
    expect(selection.problem).toMatch(/at most 1\b/);
    expect(reviewSelection([item()], SUBTASKS_PER_CARD_MAX - 1).canSubmit).toBe(true);
  });
});

describe("addSubtasksLabel", () => {
  it("pluralises", () => {
    expect(addSubtasksLabel(1)).toBe("Add 1 subtask");
    expect(addSubtasksLabel(3)).toBe("Add 3 subtasks");
  });
});

describe("toAcceptPayload", () => {
  it("sends only checked rows, normalised, in order, without keys", () => {
    const payload = toAcceptPayload(BOARD_ID, CARD_ID, [
      item({ key: "a", title: "  First   step " }),
      item({ key: "b", checked: false, title: "Dropped" }),
      item({ key: "c", title: "Third", estimate: null }),
    ]);
    expect(payload).toEqual({
      boardId: BOARD_ID,
      cardId: CARD_ID,
      subtasks: [
        { title: "First step", estimate: 3 },
        { title: "Third", estimate: null },
      ],
    });
    expect(acceptProposalSchema.safeParse(payload).success).toBe(true);
  });
});

describe("optimisticAiSubtasks", () => {
  it("appends AI subtasks after the last existing position, in order", () => {
    let n = 0;
    const rows = optimisticAiSubtasks(
      [{ position: "a1" }, { position: "a0" }],
      [
        { title: "First", estimate: 2 },
        { title: "Second", estimate: null },
      ],
      () => `tmp-${n++}`,
    );
    expect(rows).toEqual([
      { id: "tmp-0", title: "First", estimate: 2, position: "a2", completedAt: null, source: "ai" },
      {
        id: "tmp-1",
        title: "Second",
        estimate: null,
        position: "a3",
        completedAt: null,
        source: "ai",
      },
    ]);
  });

  it("starts a fresh key sequence on an empty checklist", () => {
    const rows = optimisticAiSubtasks([], [{ title: "Only", estimate: 1 }], () => "x");
    expect(rows[0]?.position).toBe("a0");
  });
});

describe("decompositionErrorMessage", () => {
  it("shows the route's safe error message", () => {
    expect(
      decompositionErrorMessage(
        new Error(JSON.stringify({ error: "Only owners and editors can use AI decomposition." })),
      ),
    ).toBe("Only owners and editors can use AI decomposition.");
  });

  it("never shows a raw body", () => {
    expect(decompositionErrorMessage(new Error("<html>502 Bad Gateway</html>"))).toBe(
      DECOMPOSITION_REQUEST_ERROR,
    );
    expect(decompositionErrorMessage(new Error(JSON.stringify({ message: "stack…" })))).toBe(
      DECOMPOSITION_REQUEST_ERROR,
    );
    expect(decompositionErrorMessage(new Error(JSON.stringify({ error: "x".repeat(500) })))).toBe(
      DECOMPOSITION_REQUEST_ERROR,
    );
  });

  it("handles non-errors and network failures", () => {
    expect(decompositionErrorMessage("boom")).toBe(DECOMPOSITION_REQUEST_ERROR);
    expect(decompositionErrorMessage(new TypeError("Failed to fetch"))).toBe(
      DECOMPOSITION_REQUEST_ERROR,
    );
  });
});
