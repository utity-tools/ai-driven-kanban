import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { getDecompositionModel } from "@/lib/ai/decompose";
import { getServerEnv } from "@/lib/env";

import { decomposeFeature } from "./features/decompose";
import { dependenciesFeature } from "./features/dependencies";
import { reportFileName, toMarkdown } from "./report";
import { runFeature } from "./runner";
import type { Feature } from "./types";

// Report only: the exit code is 0 unless the runner itself crashes.
const USAGE = "Usage: pnpm eval [decompose|dependencies|all] [--case <id>] [--mock]";

type RunOptions = { mock: boolean; modelName: string; caseId?: string };

/** Binds a feature to the runner, so each keeps its own I/O types. */
function runnerFor<I, O, E>(feature: Feature<I, O, E>) {
  return ({ mock, modelName, caseId }: RunOptions) =>
    runFeature(feature, {
      model: (evalCase) => (mock ? feature.mockModel(evalCase) : getDecompositionModel()),
      modelName,
      mock,
      caseId,
    });
}

const FEATURES: Record<string, ReturnType<typeof runnerFor>> = {
  decompose: runnerFor(decomposeFeature),
  dependencies: runnerFor(dependenciesFeature),
};

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { case: { type: "string" }, mock: { type: "boolean", default: false } },
  });
  const target = positionals[0] ?? "all";
  const selected = target === "all" ? Object.values(FEATURES) : [FEATURES[target]];
  if (selected.some((feature) => !feature)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const mock = values.mock;
  const modelName = mock ? "mock" : getServerEnv().AI_MODEL;
  const resultsDir = join(import.meta.dirname, "results");
  await mkdir(resultsDir, { recursive: true });

  // The app logs one line per model call; the report already has that data.
  console.info = () => {};

  for (const run of selected) {
    if (!run) continue;
    const report = await run({ mock, modelName, caseId: values.case });
    if (report.cases.length === 0) {
      console.error(`No case "${values.case}" in ${report.feature}.`);
      continue;
    }
    const markdown = toMarkdown(report);
    const base = join(resultsDir, reportFileName(report));
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + "\n");
    await writeFile(`${base}.md`, markdown);
    process.stdout.write(`${markdown}\nSaved ${base}.{json,md}\n\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
