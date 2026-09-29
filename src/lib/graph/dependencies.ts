/*
 * Deterministic logic of the card dependency graph (ADR 0017). An edge
 * `blocker -> blocked` means "blocked cannot start until blocker is done".
 * The database rejects cycles (SQLSTATE DEP01); these helpers let the UI avoid
 * offering them and derive what the board shows: blocked cards and bottlenecks.
 *
 * A blocker is "resolved" when it sits in a column marked as done or is
 * archived; the caller decides that through `isResolved`.
 */

export type Dependency = { blockerId: string; blockedId: string };

type Adjacency = Map<string, string[]>;

/** blocker -> the cards it blocks. */
function successors(dependencies: readonly Dependency[]): Adjacency {
  const graph: Adjacency = new Map();
  for (const { blockerId, blockedId } of dependencies) {
    const next = graph.get(blockerId);
    if (next) next.push(blockedId);
    else graph.set(blockerId, [blockedId]);
  }
  return graph;
}

/** Cards reachable from `start` (excluded), following edges only through nodes `canPass` accepts. */
function reachableFrom(
  graph: Adjacency,
  start: string,
  canPass: (cardId: string) => boolean = () => true,
): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next) || next === start || !canPass(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/**
 * Whether adding `blocker -> blocked` would close a cycle (a self-dependency
 * counts). Mirrors the database check, so the UI can hide those options.
 */
export function wouldCreateCycle(
  dependencies: readonly Dependency[],
  blockerId: string,
  blockedId: string,
): boolean {
  if (blockerId === blockedId) return true;
  return reachableFrom(successors(dependencies), blockedId).has(blockerId);
}

/**
 * One cycle in the graph as a closed path (`[a, b, a]`), or null if there is
 * none. The database prevents cycles; this guards data loaded from elsewhere.
 */
export function findCycle(dependencies: readonly Dependency[]): string[] | null {
  const graph = successors(dependencies);
  const state = new Map<string, "visiting" | "done">();

  for (const root of graph.keys()) {
    if (state.has(root)) continue;
    // Iterative DFS; `stack` holds the nodes currently being visited, each
    // with the index of the next successor to explore.
    const stack: { node: string; next: number }[] = [{ node: root, next: 0 }];
    state.set(root, "visiting");

    for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
      const child = graph.get(frame.node)?.[frame.next];
      if (child === undefined) {
        state.set(frame.node, "done");
        stack.pop();
        continue;
      }
      frame.next += 1;
      const childState = state.get(child);
      if (childState === "visiting") {
        const path = stack.map((f) => f.node);
        return [...path.slice(path.indexOf(child)), child];
      }
      if (childState === undefined) {
        state.set(child, "visiting");
        stack.push({ node: child, next: 0 });
      }
    }
  }
  return null;
}

/** Unresolved cards with at least one unresolved blocker. */
export function blockedCardIds(
  dependencies: readonly Dependency[],
  isResolved: (cardId: string) => boolean,
): Set<string> {
  const blocked = new Set<string>();
  for (const { blockerId, blockedId } of dependencies) {
    if (!isResolved(blockerId) && !isResolved(blockedId)) blocked.add(blockedId);
  }
  return blocked;
}

export type Bottleneck = {
  cardId: string;
  /** Unresolved cards held up by this one, directly or through a chain. */
  blockedCount: number;
};

/**
 * Unresolved cards ranked by how many unresolved cards they hold up,
 * transitively. A resolved card breaks the chain: it no longer blocks anyone.
 * Cards that block nothing are left out. Ties are ordered by card id so the
 * result is stable.
 */
export function bottlenecks(
  dependencies: readonly Dependency[],
  isResolved: (cardId: string) => boolean,
  limit = Number.POSITIVE_INFINITY,
): Bottleneck[] {
  const graph = successors(dependencies);
  const unresolved = (cardId: string) => !isResolved(cardId);

  const ranked: Bottleneck[] = [];
  for (const cardId of graph.keys()) {
    if (isResolved(cardId)) continue;
    const blockedCount = reachableFrom(graph, cardId, unresolved).size;
    if (blockedCount > 0) ranked.push({ cardId, blockedCount });
  }
  ranked.sort(
    (a, b) =>
      b.blockedCount - a.blockedCount || (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0),
  );
  return ranked.slice(0, limit);
}
