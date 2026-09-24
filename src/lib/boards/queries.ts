import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/db/server";

import { type BoardView, assembleBoardView } from "./view-model";

export type BoardSummary = { id: string; title: string };

/** Boards the signed-in user can see, oldest first. Runs as the user, so RLS decides. */
export async function listBoards(): Promise<BoardSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, title")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("Failed to load boards.", { cause: error });
  return data;
}

/**
 * A single board, or `null` if the id is not a UUID, the board doesn't exist
 * or the user can't see it (RLS makes the last two indistinguishable, on
 * purpose). Memoised per request so metadata and page share one query.
 */
export const getBoard = cache(async (id: string): Promise<BoardSummary | null> => {
  if (!z.uuid().safeParse(id).success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Failed to load board.", { cause: error });
  return data;
});

/**
 * Everything the board view needs: columns and cards (ordered by
 * fractional-indexing position, then id; archived cards are split out for the
 * Archived panel), labels and members. Returns `null` when the board is
 * missing or not accessible.
 */
export const getBoardView = cache(async (id: string): Promise<BoardView | null> => {
  const board = await getBoard(id);
  if (!board) return null;

  const supabase = await createClient();
  const [columns, cards, labels, members] = await Promise.all([
    supabase
      .from("board_columns")
      .select("id, title, position")
      .eq("board_id", board.id)
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("cards")
      .select(
        "id, title, description, position, due_on, completed_at, archived_at, column_id, card_assignees(profile:profiles(id, display_name, avatar_url)), card_labels(board_labels(id, name, color))",
      )
      .eq("board_id", board.id)
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("board_labels").select("id, name, color").eq("board_id", board.id),
    supabase
      .from("board_members")
      .select("role, profile:profiles(id, display_name, avatar_url)")
      .eq("board_id", board.id),
  ]);

  for (const result of [columns, cards, labels, members]) {
    if (result.error) throw new Error("Failed to load board.", { cause: result.error });
  }

  return assembleBoardView({
    board,
    columns: columns.data ?? [],
    cards: cards.data ?? [],
    labels: labels.data ?? [],
    members: members.data ?? [],
  });
});
