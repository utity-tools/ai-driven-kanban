import { z } from "zod";

/**
 * A `change` broadcast on `board:<id>` (ADR 0019): which table changed, the
 * operation and who changed it. Never row data. Parsed leniently: Realtime adds
 * its own keys and a malformed notice still means "something changed".
 */
export type ChangeNotice = { table: string | null; op: string | null; actor: string | null };

const field = z.string().nullable().catch(null);
const noticeSchema = z.object({ table: field, op: field, actor: field });

export function parseChangeNotice(payload: unknown): ChangeNotice {
  const parsed = noticeSchema.safeParse(
    typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload : {},
  );
  return parsed.success ? parsed.data : { table: null, op: null, actor: null };
}

/** Notices after which the viewer may have lost access: check membership before refreshing. */
export function mayAffectAccess(notice: ChangeNotice): boolean {
  return notice.table === "board_members" || (notice.table === "boards" && notice.op === "DELETE");
}
