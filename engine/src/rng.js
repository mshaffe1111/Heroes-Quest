// Seedable random numbers so every battle and map can be replayed exactly.
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** The generator's position: save it with a game and setState() it on load to carry on with the same dice. */
    getState: () => s,
    setState: (v) => { s = v | 0; },
    /** whole number from 1 to n */
    int: (n) => 1 + Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** Test helper: returns the scripted dice values in order (ignores the die size). */
export function scriptedRng(values) {
  let i = 0;
  return {
    next: () => 0,
    int: () => {
      if (i >= values.length) throw new Error('scripted rng ran out of values');
      return values[i++];
    },
  };
}
