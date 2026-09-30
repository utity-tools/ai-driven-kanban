import type { EvalReport } from "./runner";

function sum(values: (number | undefined)[]): number | undefined {
  const known = values.filter((v): v is number => v !== undefined);
  return known.length === 0 ? undefined : known.reduce((a, b) => a + b, 0);
}

/** `<feature>-<promptVersion>-<timestamp>`, filesystem-safe: the base name of a report's files. */
export function reportFileName(report: EvalReport): string {
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  return `${report.feature}-${report.promptVersion}-${stamp}`;
}

/** Markdown summary: run info, one row per scorer, one row per case, then the failures. */
export function toMarkdown(report: EvalReport): string {
  const { cases } = report;
  const scorerNames = [...new Set(cases.flatMap((c) => Object.keys(c.scores)))];

  const lines = [
    `# ${report.feature} (${report.promptVersion})`,
    "",
    `Model: ${report.model}${report.mock ? " (mock)" : ""} - ${report.startedAt} - ${cases.length} cases`,
    "",
    "| Scorer | Pass rate | Mean score |",
    "| --- | --- | --- |",
  ];
  for (const name of scorerNames) {
    const results = cases.flatMap((c) => (c.scores[name] ? [c.scores[name]] : []));
    const passed = results.filter((r) => r.pass).length;
    const mean = results.reduce((total, r) => total + r.score, 0) / (results.length || 1);
    lines.push(`| ${name} | ${passed}/${results.length} | ${mean.toFixed(2)} |`);
  }

  lines.push("", "| Case | Passed | Latency (ms) | Tokens in/out |", "| --- | --- | --- | --- |");
  for (const c of cases) {
    const results = Object.values(c.scores);
    const passed = c.error ? "ERROR" : `${results.filter((r) => r.pass).length}/${results.length}`;
    lines.push(
      `| ${c.id} | ${passed} | ${c.latencyMs} | ${c.inputTokens ?? "-"}/${c.outputTokens ?? "-"} |`,
    );
  }

  const cost = sum(cases.map((c) => c.cost));
  lines.push(
    "",
    `Total tokens in/out: ${sum(cases.map((c) => c.inputTokens)) ?? "-"}/${sum(cases.map((c) => c.outputTokens)) ?? "-"}` +
      (cost === undefined ? "" : ` - cost: $${cost.toFixed(4)}`),
  );

  const failures = cases.flatMap((c) => [
    ...(c.error ? [`- ${c.id}: call failed: ${c.error}`] : []),
    ...Object.entries(c.scores)
      .filter(([, r]) => !r.pass)
      .map(([name, r]) => `- ${c.id} / ${name}: ${r.details ?? "failed"}`),
  ]);
  if (failures.length > 0) lines.push("", "## Failures", "", ...failures);
  return lines.join("\n") + "\n";
}
