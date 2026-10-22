import { distanceTo } from './grid.js';
import { T } from './terrain.js';

/** Special sites: ruins, temples, towers, libraries. Spread out, on open ground, off the roads and away from cities and rivers. */
/** How many of each site a map gets (Matt, 22 Oct: "15, 20 to a map, fewer on small maps"): ruins scale with the map's size. */
export function siteCounts(nCities) {
  const k = Math.max(0, Math.min(1, (nCities - 60) / 80));      // 0 for a small map (60 cities) .. 1 for a large one (140)
  return { ruin: Math.round(10 + 10 * k), temple: Math.round(3 + 2 * k), library: Math.round(2 + 2 * k), tower: Math.round(1 + 2 * k) };
}
export function placeSites(map, rng, counts = null) {
  const { W, H, terr, cities, roadMask, channel, block } = map;
  const want = counts ?? siteCounts(cities.length); const kinds = []; for (const k of ['ruin', 'temple', 'library', 'tower']) for (let i = 0; i < want[k]; i++) kinds.push(k);
  // shuffle so the kinds spread over the map instead of all the ruins landing first
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const near = new Uint8Array(W * H); for (const [y, x] of cities) near[y * W + x] = 1; for (let i = 0; i < W * H; i++) if (roadMask[i] || channel[i] || block[i]) near[i] = 1;
  const d = distanceTo(near, W, H); const cand = [];
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    const t = terr[y * W + x]; if ((t === T.GRASS || t === T.HILLS || t === T.FOREST || t === T.SAND) && d[y * W + x] >= 2) cand.push([y, x]);
  }
  const out = []; let gap = Math.max(6, 0.55 * Math.sqrt((W * H * 0.45) / Math.max(1, kinds.length)));      // spread evenly over the land; relax if the land runs out
  for (let tries = 0; out.length < kinds.length && cand.length && gap >= 4; tries++) {
    if (tries && tries % 1500 === 0) gap *= 0.85;
    const c = cand[Math.floor(rng.next() * cand.length)];
    if (out.every(([, o]) => Math.hypot(o[0] - c[0], o[1] - c[1]) > gap)) out.push([kinds[out.length], c]);
  }
  return out;
}
