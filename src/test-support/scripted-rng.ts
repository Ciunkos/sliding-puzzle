// A random source that returns hand-written values, so a test can steer code that takes `random`.

/** Returns `values` in order, then throws: a test that needs more values than it wrote is wrong. */
export function scriptedRng(values: readonly number[]): () => number {
  let next = 0;
  return () => {
    const value = values[next];
    if (value === undefined) {
      throw new Error(`scriptedRng: all ${String(values.length)} values were used`);
    }
    next += 1;
    return value;
  };
}

/** `values` written `times` times in a row, e.g. repeated([0, 0.9], 2) is [0, 0.9, 0, 0.9]. */
export function repeated(values: readonly number[], times: number): number[] {
  return Array.from({ length: times }, () => values).flat();
}
