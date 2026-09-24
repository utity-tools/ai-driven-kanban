/** "1 card", "3 cards". */
export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** What deleting a column takes with it, for the confirmation dialog. */
export function columnDeletionSummary(counts: { total: number; archived: number }): string {
  if (counts.total === 0) return "The column has no cards. This can't be undone.";
  const archived = counts.archived > 0 ? ` (${counts.archived} of them archived)` : "";
  return `This permanently deletes the column and its ${pluralize(counts.total, "card")}${archived}. This can't be undone.`;
}

/** What deleting a board takes with it, for the confirmation dialog. */
export function boardDeletionSummary(counts: { columns: number; cards: number }): string {
  return `This permanently deletes the board with its ${pluralize(counts.columns, "column")} and ${pluralize(counts.cards, "card")}, archived cards included. This can't be undone.`;
}
