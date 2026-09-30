# Evals

Offline quality checks for the two AI features: subtask decomposition (`decompose`) and
dependency suggestions (`dependencies`). A run sends every dataset case to the real model through
the same prompt builders, schemas and post-filtering the app uses, scores each answer and writes a
report. It is a measuring tool, not a gate: it is not part of CI and always exits 0 unless the
runner itself crashes.

## Run

```bash
pnpm eval all                   # both features
pnpm eval decompose             # one feature
pnpm eval dependencies --case debatable-ci-vs-api
pnpm eval all --mock            # fixture model: free, checks the pipeline itself
```

The model is `AI_MODEL` (default in `src/lib/env.ts`), and `AI_GATEWAY_API_KEY` comes from
`.env.local`, loaded by the script. Results land in `evals/results/<feature>-<promptVersion>-<timestamp>.json`
plus a `.md` summary (also printed). Everything in `evals/results/` is git-ignored except
`evals/results/baseline/`, where reference runs are committed to compare prompt changes against.

Cost: about 25 cases at roughly $0.01 each, so a full run is around $0.25. Cases run one after
another. When changing a prompt, run the evals before and after and compare the two reports.

## Layout

- `datasets/`: typed cases (`decompose.ts`, `dependencies.ts`). A case has an `id`, a `description`
  of what it catches, the `input` the app would send and the `expected` properties.
- `scorers/`: one function per property, `Scorer<Input, Output, Expected>`. Deterministic today.
- `features/`: glue that calls the app's own code for a feature and exposes it to the runner.
- `runner.ts`, `report.ts`, `run.ts`: run cases, aggregate, write reports, CLI.

## Add a case

Append an entry to the dataset file. Cover one behaviour per case and say which in `description`.
Decompose expectations: `language`, optional `forbidden` substrings (for injections), `count`, and
`keep`: technical terms (case-sensitive, e.g. `"OAuth"`) that must appear untranslated in at least
one subtask title (scorer `terms-preserved`).
Dependencies cases describe a small board (`cards`, `edges`); `expected.blockers` are the card ids
that should be proposed (empty means "none is a clear blocker") and `mustNotBlock` the ones that
must not be. The runner builds the candidates with the app's `dependencyCandidates`, so archived
cards, existing blockers and cycle closers are filtered exactly like in production.

## Add a scorer

Create a `Scorer` in `evals/scorers/`, add it to the feature's list (`decomposeScorers` or
`dependenciesScorers`) and give it a unit test next to it. `score` is async and returns
`{ pass, score /* 0..1 */, details? }`. Keep `details` short: it is what appears under "Failures".

Language detection (`scorers/language.ts`) is a stopword count, not a real classifier. It is
inconclusive on text without function words and only knows Spanish and English.

## Future: LLM-as-judge

Some qualities (are the subtasks specific? do the rationales make sense?) cannot be checked with
string rules. A judge is just another async scorer: it calls a model with its own versioned prompt
(`evals/prompts/judge-subtasks.v1.ts`) and returns a Zod-validated verdict that is mapped to a
`ScoreResult`. Judges are noisy, so run each one several times per case and average the score, and
calibrate it by hand: score a sample of outputs yourself and check the judge agrees before trusting
its numbers. Nothing in the runner changes.
