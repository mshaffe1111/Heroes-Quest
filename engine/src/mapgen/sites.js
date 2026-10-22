import { distanceTo } from './grid.js';
import { T } from './terrain.js';

/** Special sites: ruins, temples, towers, libraries. Spread out, on open ground, off the roads and away from cities and rivers. */
export function placeSites(map, rng, count = 18) {
  const { W, H, terr, cities, roadMask, channel, block } = map;
  const near = new Uint8Array(W * H); for (const [y, x] of cities) near[y * W + x] = 1; for (let i = 0; i < W * H; i++) if (roadMask[i] || channel[i] || block[i]) near[i] = 1;
  const d = distanceTo(near, W, H); const cand = [];
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    const t = terr[y * W + x]; if ((t === T.GRASS || t === T.HILLS || t === T.FOREST || t === T.SAND) && d[y * W + x] >= 3) cand.push([y, x]);
  }
  const kinds = ['ruin', 'temple', 'tower', 'library']; const out = [];
  for (let tries = 0; out.length < count && tries < 4000 && cand.length; tries++) {
    const c = cand[Math.floor(rng.next() * cand.length)];
    if (out.every(([, o]) => Math.hypot(o[0] - c[0], o[1] - c[1]) > 14)) out.push([kinds[out.length % 4 === 3 && rng.next() < 0.5 ? 3 : Math.floor(rng.next() * 3)], c]);
  }
  return out;
}
