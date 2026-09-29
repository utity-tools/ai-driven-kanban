import { describe, expect, it } from "vitest";

import { MAX_BLOCKERS } from "@/lib/boards/dependencies";

import {
  type DependencyReviewItem,
  addBlockersLabel,
  dependencyReviewSelection,
  dependencySuggestAvailability,
  toDependencyAcceptPayload,
  toDependencyReviewItems,
} from "./dependency-review";
import { acceptDependenciesSchema } from "./schemas";

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const CARD_ID = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";

function item(overrides: Partial<DependencyReviewItem> = {}): DependencyReviewItem {
  return {
    key: "k",
    checked: true,
    blockerId: A,
    title: "A",
    columnTitle: "To do",
    rationale: "why",
    ...overrides,
  };
}

describe("dependencySuggestAvailability", () => {
  const base = {
    featureEnabled: true,
    editable: true,
    archived: false,
    candidateCount: 3,
    blockerCount: 0,
  };

  it("is enabled for an editable active card with candidates and room", () => {
    expect(dependencySuggestAvailability(base)).toBe("enabled");
    expect(dependencySuggestAvailability({ ...base, blockerCount: MAX_BLOCKERS - 1 })).toBe(
      "enabled",
    );
  });

  it.each([
    ["feature off", { featureEnabled: false }],
    ["not editable", { editable: false }],
    ["archived", { archived: true }],
    ["no candidates", { candidateCount: 0 }],
    ["card at the blocker limit", { blockerCount: MAX_BLOCKERS }],
  ])("is hidden: %s", (_name, override) => {
    expect(dependencySuggestAvailability({ ...base, ...override })).toBe("hidden");
  });
});

describe("toDependencyReviewItems", () => {
  it("makes checked rows with fresh keys", () => {
    let n = 0;
    const rows = toDependencyReviewItems(
      [
        { blockerId: A, title: "A", columnTitle: "To do", rationale: "x" },
        { blockerId: B, title: "B", columnTitle: "Done", rationale: "y" },
      ],
      () => `k${n++}`,
    );
    expect(rows.map((r) => [r.key, r.checked, r.blockerId])).toEqual([
      ["k0", true, A],
      ["k1", true, B],
    ]);
  });
});

describe("dependencyReviewSelection", () => {
  it("needs at least one checked row", () => {
    const result = dependencyReviewSelection([item({ checked: false })], 0);
    expect(result).toMatchObject({ checkedCount: 0, canSubmit: false });
    expect(result.problem).toMatch(/at least one/);
  });

  it("can submit checked rows within the room left", () => {
    expect(dependencyReviewSelection([item(), item({ checked: false })], 5)).toEqual({
      checkedCount: 1,
      canSubmit: true,
      problem: null,
    });
  });

  it("can't submit more than the room under the blocker limit", () => {
    const result = dependencyReviewSelection([item(), item(), item()], MAX_BLOCKERS - 2);
    expect(result.canSubmit).toBe(false);
    expect(result.problem).toContain("select at most 2");
  });
});

describe("addBlockersLabel", () => {
  it("pluralises", () => {
    expect(addBlockersLabel(1)).toBe("Add 1 blocker");
    expect(addBlockersLabel(3)).toBe("Add 3 blockers");
  });
});

describe("toDependencyAcceptPayload", () => {
  it("sends only the checked rows' card ids, in order, and passes the schema", () => {
    const payload = toDependencyAcceptPayload(BOARD_ID, CARD_ID, [
      item({ blockerId: A }),
      item({ blockerId: B, checked: false }),
      item({ blockerId: B }),
    ]);
    expect(payload).toEqual({ boardId: BOARD_ID, cardId: CARD_ID, blockerIds: [A, B] });
    expect(acceptDependenciesSchema.safeParse(payload).success).toBe(true);
  });
});
