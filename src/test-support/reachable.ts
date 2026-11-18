// Exhaustive searches for tests that need a fact which does not come from the code under test:
// "which states can moves reach" and "which arrangements match". Generic: it knows no game.

/**
 * The keys of every state reachable from `start`, breadth-first. `apply` returns undefined for a
 * move that cannot be made. Two states with the same key are the same state.
 */
export function reachableKeys<State, Move>(
  start: State,
  moves: (state: State) => readonly Move[],
  apply: (state: State, move: Move) => State | undefined,
  key: (state: State) => string,
): Set<string> {
  const seen = new Set([key(start)]);
  const queue = [start];
  // An index instead of queue.shift(), which is linear on a large array.
  for (let at = 0, next = queue[0]; next !== undefined; at++, next = queue[at]) {
    for (const move of moves(next)) {
      const after = apply(next, move);
      if (after === undefined || seen.has(key(after))) continue;
      seen.add(key(after));
      queue.push(after);
    }
  }
  return seen;
}

interface Matches {
  count: number;
  /** The earliest match in lexicographic order. */
  first: readonly number[] | undefined;
}

/** Visits every arrangement of 0..n-1 once, in lexicographic order, counting those that match. */
export function permutationsWhere(
  n: number,
  predicate: (arrangement: readonly number[]) => boolean,
): Matches {
  const result: Matches = { count: 0, first: undefined };
  const current: number[] = [];
  const used = Array.from({ length: n }, () => false);
  const visit = (): void => {
    if (current.length === n) {
      if (!predicate(current)) return;
      result.count += 1;
      result.first ??= [...current];
      return;
    }
    for (let value = 0; value < n; value++) {
      if (used[value] === true) continue;
      used[value] = true;
      current.push(value);
      visit();
      current.pop();
      used[value] = false;
    }
  };
  visit();
  return result;
}
