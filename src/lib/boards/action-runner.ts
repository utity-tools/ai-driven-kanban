import "server-only";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import {
  type ActionResult,
  GENERIC_ERROR,
  NOT_FOUND_ERROR,
  SIGNED_OUT_ERROR,
  failure,
} from "./action-result";
import { firstIssueMessage } from "./schemas";

/*
 * Shared plumbing of the board Server Actions (boards/actions.ts,
 * subtasks/actions.ts). Every action:
 * - validates its input with Zod (the input is untrusted: any client can POST);
 * - runs as the signed-in user, so Row Level Security decides what is allowed
 *   (the client's idea of its role is never trusted);
 * - returns a typed result with a message that is safe to show;
 * - revalidates the board, success or failure, so the response carries the
 *   current board (a failure usually means the UI was stale).
 *
 * Updates and deletes ask for the affected ids back: RLS turns a forbidden or
 * missing row into "0 rows", not an error, and we report that to the user.
 */

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function runBoardAction<S extends z.ZodType, T extends object = object>(
  schema: S,
  input: unknown,
  mutate: (data: z.output<S>, supabase: Supabase) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(firstIssueMessage(parsed.error));

  if (!(await getCurrentUser())) return failure(SIGNED_OUT_ERROR);

  let result: ActionResult<T>;
  try {
    result = await mutate(parsed.data, await createClient());
  } catch (error) {
    console.error("Board action failed", error);
    result = failure(GENERIC_ERROR);
  }

  const { boardId } = parsed.data as { boardId?: unknown };
  if (typeof boardId === "string") revalidatePath(boardPath(boardId));
  return result;
}

export function boardPath(boardId: string): string {
  return `/boards/${boardId}`;
}

/** `ok` if at least one row was affected, the not-found message otherwise. */
export function affected(rows: unknown[] | null, notFound = NOT_FOUND_ERROR): ActionResult {
  return rows?.length ? { ok: true } : failure(notFound);
}
