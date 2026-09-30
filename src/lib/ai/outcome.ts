import type { ProviderMetadata } from "ai";
import type { z } from "zod";

import type { AiOutcome } from "@/lib/observability/ai-log";

/** The database accepts an actual cost between 0 and 1 USD (record_ai_usage). */
const MAX_COST_USD = 1;

/**
 * Cost of a call in USD from the AI Gateway's provider metadata (it reports a
 * string), or undefined when missing, not a number or outside the range the
 * database accepts (0..1): an out-of-range value would make record_ai_usage
 * fail and lose the whole record, so it is dropped instead.
 */
export function gatewayCostUsd(providerMetadata: ProviderMetadata | undefined): number | undefined {
  const raw = providerMetadata?.gateway?.cost;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const cost = Number(raw);
  return Number.isFinite(cost) && cost >= 0 && cost <= MAX_COST_USD ? cost : undefined;
}

/**
 * Classifies a call that finished streaming by its final text:
 * - ok: valid against the feature's schema with at least one item;
 * - empty: valid JSON whose item list is empty (a legitimate "nothing to
 *   propose"; the decomposition schema requires 1+ subtasks, so an empty list
 *   fails it and would otherwise look "invalid");
 * - invalid: not JSON, or JSON that fails the schema;
 * - error: the provider reported finishReason "error".
 */
export function classifyFinished({
  text,
  finishReason,
  schema,
  itemsKey,
}: {
  text: string;
  finishReason: string;
  schema: z.ZodType;
  itemsKey: string;
}): Extract<AiOutcome, "ok" | "empty" | "invalid" | "error"> {
  if (finishReason === "error") return "error";

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return "invalid";
  }

  const items =
    typeof json === "object" && json !== null ? (json as Record<string, unknown>)[itemsKey] : null;
  if (Array.isArray(items) && items.length === 0) return "empty";
  return schema.safeParse(json).success ? "ok" : "invalid";
}
