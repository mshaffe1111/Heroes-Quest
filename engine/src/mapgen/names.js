// Original place names: two or three syllable parts, never repeated within one map.
const A = ['Kel', 'Bryn', 'Sil', 'Ash', 'Dun', 'Mor', 'Wyn', 'Tar', 'Elm', 'Gar', 'Hal', 'Ire', 'Lor', 'Nor', 'Ost', 'Pel', 'Rav', 'Sten', 'Tor', 'Ulm', 'Vor', 'Wolf', 'Yar', 'Cor', 'Fen', 'Hob', 'Kes', 'Lyn', 'Mar', 'Oak', 'Quin', 'Run', 'Thorn', 'Wick', 'Bram', 'Cald', 'Drum', 'Eld', 'Frost', 'Grim'];
const B = ['moor', 'wood', 'field', 'ford', 'keep', 'stead', 'vale', 'gate', 'bridge', 'haven', 'ton', 'wick', 'mere', 'crest', 'port', 'marsh', 'holt', 'dale', 'watch', 'fall', 'wyn', 'ham', 'borough', 'cross', 'hollow'];
export function makeNames(n, rng) {
  const used = new Set(); const out = [];
  for (let tries = 0; out.length < n && tries < 5000; tries++) {
    const nm = rng.pick(A) + rng.pick(B); if (used.has(nm)) continue; used.add(nm); out.push(nm);
  }
  while (out.length < n) out.push('Hold ' + (out.length + 1));
  return out;
}
