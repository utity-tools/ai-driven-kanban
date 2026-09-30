import { describe, expect, it } from "vitest";

import { decomposeFeature } from "./features/decompose";
import { dependenciesFeature, toDependenciesInput } from "./features/dependencies";
import { reportFileName, toMarkdown } from "./report";
import { runFeature } from "./runner";

// The whole pipeline (real prompt builders, schemas and post-filtering) against fixture models.
describe("eval pipeline with mock models", () => {
  it("scores every decompose case and passes them all", async () => {
    const report = await runFeature(decomposeFeature, {
      model: (c) => decomposeFeature.mockModel(c),
      modelName: "mock",
      mock: true,
    });
    expect(report.cases).toHaveLength(decomposeFeature.cases.length);
    for (const c of report.cases) {
      expect(c.error).toBeUndefined();
      expect(
        Object.values(c.scores).every((s) => s.pass),
        c.id,
      ).toBe(true);
      expect(c.inputTokens).toBe(100);
    }
  });

  it("scores every dependencies case and passes them all", async () => {
    const report = await runFeature(dependenciesFeature, {
      model: (c) => dependenciesFeature.mockModel(c),
      modelName: "mock",
      mock: true,
    });
    expect(report.cases).toHaveLength(dependenciesFeature.cases.length);
    for (const c of report.cases) {
      expect(
        Object.values(c.scores).every((s) => s.pass),
        c.id,
      ).toBe(true);
    }
  });

  it("filters a single case by id", async () => {
    const report = await runFeature(decomposeFeature, {
      model: (c) => decomposeFeature.mockModel(c),
      modelName: "mock",
      mock: true,
      caseId: "es-basic",
    });
    expect(report.cases.map((c) => c.id)).toEqual(["es-basic"]);
  });

  it("records a scorer failure instead of throwing, and reports it", async () => {
    // A model answering with an off-schema proposal must show up as failed scores.
    const report = await runFeature(decomposeFeature, {
      model: () => dependenciesFeature.mockModel(dependenciesFeature.cases[0]!),
      modelName: "wrong",
      mock: true,
      caseId: "es-basic",
    });
    const scores = report.cases[0]!.scores;
    expect(scores["schema-valid"]?.pass).toBe(false);
    expect(toMarkdown(report)).toContain("## Failures");
    expect(reportFileName(report)).toMatch(/^decompose-decompose-v2-\d{4}-/);
  });
});

describe("toDependenciesInput", () => {
  it("offers neither the target, archived cards, existing blockers nor cycle closers", () => {
    const cases = Object.fromEntries(dependenciesFeature.cases.map((c) => [c.id, c.input]));
    const ids = (id: string) => cases[id]!.candidates.map((c) => c.id);
    expect(ids("done-and-archived-cards")).toEqual(["cart-api", "payments-service", "email"]);
    expect(ids("cycle-candidate-filtered")).toEqual(["queue"]);
    expect(ids("already-blocked-not-repeated")).toEqual(["tokens", "blog"]);
    expect(cases["done-and-archived-cards"]!.candidates[0]!.done).toBe(true);
    expect(
      toDependenciesInput({
        target: { id: "t", title: "T", description: null, column: "c" },
        cards: [],
      }).candidates,
    ).toEqual([]);
  });
});
