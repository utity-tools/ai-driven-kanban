import { compareByPosition, comparePositions } from "./ordering";

export type BoardRole = "owner" | "editor" | "viewer";

export type Person = { id: string; displayName: string | null; avatarUrl: string | null };
export type BoardMember = Person & { role: BoardRole };
export type Label = { id: string; name: string; color: string };

export type CardSummary = {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  position: string;
  /** Date-only due date, "YYYY-MM-DD" (see due-date.ts). */
  dueOn: string | null;
  completedAt: string | null;
  labels: Label[];
  assignees: Person[];
};

export type ColumnView = { id: string; title: string; position: string; cards: CardSummary[] };

/** An archived card: hidden from its column, listed in the Archived panel. */
export type ArchivedCard = CardSummary & { archivedAt: string };

export type BoardView = {
  board: { id: string; title: string };
  columns: ColumnView[];
  /** Most recently archived first. */
  archivedCards: ArchivedCard[];
  labels: Label[];
  members: BoardMember[];
};

// ---------------------------------------------------------------------------
// Raw rows, as returned by the Supabase queries in queries.ts
// ---------------------------------------------------------------------------

type ProfileRow = { id: string; display_name: string | null; avatar_url: string | null };
type LabelRow = { id: string; name: string; color: string };

export type RawBoardData = {
  board: { id: string; title: string };
  columns: { id: string; title: string; position: string }[];
  cards: {
    id: string;
    column_id: string;
    title: string;
    description: string | null;
    position: string;
    due_on: string | null;
    completed_at: string | null;
    archived_at: string | null;
    card_assignees: { profile: ProfileRow | null }[];
    card_labels: { board_labels: LabelRow | null }[];
  }[];
  labels: LabelRow[];
  members: { role: BoardRole; profile: ProfileRow | null }[];
};

const ROLE_ORDER: Record<BoardRole, number> = { owner: 0, editor: 1, viewer: 2 };

function toPerson(profile: ProfileRow): Person {
  return { id: profile.id, displayName: profile.display_name, avatarUrl: profile.avatar_url };
}

/** Byte-order comparison of names; null names last. Deterministic across locales. */
function compareNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return comparePositions(a.toLowerCase(), b.toLowerCase());
}

export function comparePeople(a: Person, b: Person): number {
  return compareNames(a.displayName, b.displayName) || comparePositions(a.id, b.id);
}

/** Labels in a stable order: by name (colour-only labels last), then colour, then id. */
export function compareLabels(a: Label, b: Label): number {
  const an = a.name.trim() || null;
  const bn = b.name.trim() || null;
  return compareNames(an, bn) || comparePositions(a.color, b.color) || comparePositions(a.id, b.id);
}

/** Most recently archived first; ties by id. */
export function compareArchived(a: ArchivedCard, b: ArchivedCard): number {
  return Date.parse(b.archivedAt) - Date.parse(a.archivedAt) || comparePositions(a.id, b.id);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Groups cards into their columns and orders everything. The SQL queries
 * already order by position, id; sorting again here (byte order, never
 * localeCompare) keeps the result correct whatever order the rows arrive in.
 * Archived cards go to `archivedCards` instead of their column. Cards whose
 * column is not on the board are dropped. Profiles hidden by RLS (null
 * embeds) are skipped.
 */
export function assembleBoardView(raw: RawBoardData): BoardView {
  const cardsByColumn = new Map<string, CardSummary[]>();
  for (const column of raw.columns) cardsByColumn.set(column.id, []);
  const archivedCards: ArchivedCard[] = [];

  for (const row of raw.cards) {
    const bucket = cardsByColumn.get(row.column_id);
    if (!bucket) continue;
    const card: CardSummary = {
      id: row.id,
      columnId: row.column_id,
      title: row.title,
      description: row.description,
      position: row.position,
      dueOn: row.due_on,
      completedAt: row.completed_at,
      labels: row.card_labels
        .map((l) => l.board_labels)
        .filter(isPresent)
        .map((l) => ({ id: l.id, name: l.name, color: l.color }))
        .sort(compareLabels),
      assignees: row.card_assignees
        .map((a) => a.profile)
        .filter(isPresent)
        .map(toPerson)
        .sort(comparePeople),
    };
    if (row.archived_at === null) bucket.push(card);
    else archivedCards.push({ ...card, archivedAt: row.archived_at });
  }
  archivedCards.sort(compareArchived);

  const columns = [...raw.columns].sort(compareByPosition).map((column) => ({
    id: column.id,
    title: column.title,
    position: column.position,
    cards: (cardsByColumn.get(column.id) ?? []).sort(compareByPosition),
  }));

  const members = raw.members
    .filter((m): m is { role: BoardRole; profile: ProfileRow } => m.profile !== null)
    .map((m) => ({ ...toPerson(m.profile), role: m.role }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || comparePeople(a, b));

  return {
    board: { id: raw.board.id, title: raw.board.title },
    columns,
    archivedCards,
    labels: raw.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })).sort(compareLabels),
    members,
  };
}

// ---------------------------------------------------------------------------
// Card details
// ---------------------------------------------------------------------------

/**
 * Everything the card modal shows. The due status is not computed here: it
 * depends on the viewer's local date, which only the browser knows (see
 * due-date.ts and useToday).
 */
export type CardDetail = {
  id: string;
  title: string;
  description: string | null;
  columnId: string;
  columnTitle: string;
  /** Set when the card is archived (shown read-only, with Restore). */
  archivedAt: string | null;
  labels: Label[];
  assignees: Person[];
  dueOn: string | null;
  completedAt: string | null;
};

function toCardDetail(
  card: CardSummary,
  columnTitle: string,
  archivedAt: string | null,
): CardDetail {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    columnId: card.columnId,
    columnTitle,
    archivedAt,
    labels: card.labels,
    assignees: card.assignees,
    dueOn: card.dueOn,
    completedAt: card.completedAt,
  };
}

/** Details of every card on the board, active cards first (in board order), then archived. */
export function buildCardDetails(view: BoardView): CardDetail[] {
  const columnTitles = new Map(view.columns.map((column) => [column.id, column.title]));
  return [
    ...view.columns.flatMap((column) =>
      column.cards.map((card) => toCardDetail(card, column.title, null)),
    ),
    ...view.archivedCards.map((card) =>
      toCardDetail(card, columnTitles.get(card.columnId) ?? "", card.archivedAt),
    ),
  ];
}

export function cardCount(view: BoardView): number {
  return view.columns.reduce((sum, column) => sum + column.cards.length, 0);
}
