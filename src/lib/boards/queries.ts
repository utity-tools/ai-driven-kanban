import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/db/server";

export type BoardSummary = { id: string; title: string };

/** Boards the signed-in user can see. Runs as the user, so RLS decides. */
export async function listBoards(): Promise<BoardSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, title")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load boards.", { cause: error });
  return data;
}

/** A single board, or `null` if it doesn't exist or the user can't see it. */
export async function getBoard(id: string): Promise<BoardSummary | null> {
  if (!z.uuid().safeParse(id).success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Failed to load board.", { cause: error });
  return data;
}
