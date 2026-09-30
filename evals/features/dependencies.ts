import {
  dependencyCandidates,
  promptCandidates,
  proposeDependencies,
} from "@/lib/ai/dependency-proposals";
import { PROMPT_VERSION } from "@/lib/ai/prompts/dependencies-v1";
import { streamDependencySuggestions } from "@/lib/ai/suggest-dependencies";

import { dependenciesCases, type DependenciesCaseInput } from "../datasets/dependencies";
import { mockJsonModel } from "../mock";
import {
  dependenciesScorers,
  type DependenciesExpected,
  type DependenciesInput,
  type DependenciesOutput,
} from "../scorers/dependencies";
import type { EvalCase, Feature } from "../types";
import { collect } from "./collect";

/** Builds what the route would send: candidates filtered by the app's own `dependencyCandidates`. */
export function toDependenciesInput({
  target,
  cards,
  edges = [],
}: DependenciesCaseInput): DependenciesInput {
  const columns = new Map<string, { title: string; isDone: boolean; cards: typeof cards }>();
  for (const card of cards.filter((c) => !c.archived)) {
    const column = columns.get(card.column) ?? { title: card.column, isDone: false, cards: [] };
    column.isDone ||= card.done ?? false;
    column.cards.push(card);
    columns.set(card.column, column);
  }
  // The target sits on the board too; the app filters it out of its own candidates.
  const targetColumn = columns.get(target.column) ?? {
    title: target.column,
    isDone: false,
    cards: [],
  };
  targetColumn.cards.push({ id: target.id, title: target.title, column: target.column });
  columns.set(target.column, targetColumn);

  const dependencies = edges.map(({ blocker, blocked }) => ({
    blockerId: blocker,
    blockedId: blocked,
  }));
  return {
    targetId: target.id,
    target: { title: target.title, description: target.description, columnTitle: target.column },
    candidates: promptCandidates(
      dependencyCandidates({ columns: [...columns.values()], dependencies }, target.id),
    ),
    edges: dependencies,
  };
}

const cases: EvalCase<DependenciesInput, DependenciesExpected>[] = dependenciesCases.map(
  (evalCase) => ({ ...evalCase, input: toDependenciesInput(evalCase.input) }),
);

export const dependenciesFeature: Feature<
  DependenciesInput,
  DependenciesOutput,
  DependenciesExpected
> = {
  name: "dependencies",
  promptVersion: PROMPT_VERSION,
  cases,
  scorers: dependenciesScorers,
  async run(input, model) {
    const { output, raw, error, usage, cost } = await collect(
      streamDependencySuggestions({
        model,
        target: input.target,
        candidates: input.candidates,
      }),
    );
    const valid = proposeDependencies(
      output ?? undefined,
      { targetId: input.targetId, candidates: input.candidates, dependencies: input.edges },
      { complete: true },
    );
    const refs = output?.dependencies.map((item) => item.blocker) ?? null;
    return { output: { raw, refs, valid, error }, usage, cost };
  },
  mockModel({ input, expected }) {
    const ids = input.candidates.map((candidate) => candidate.id);
    return mockJsonModel({
      dependencies: expected.blockers.flatMap((id) =>
        ids.includes(id)
          ? [{ blocker: `c${ids.indexOf(id) + 1}`, rationale: "Must be finished first." }]
          : [],
      ),
    });
  },
};
