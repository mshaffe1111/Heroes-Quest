import { D8, Heap, components, distanceTo } from './grid.js';
import { T } from './terrain.js';

/**
 * River network from elevation: priority-flood depression filling, D8 flow, accumulation with extra rain on high ground.
 * Rivers rise in the mountains, gather tributaries and end at the sea, a lake or the great river. Depressions become lakes.
 * Returns { rivers: [{pts:[[y,x]..], acc:[..], wmax?}], terr (with new lakes), acc, channel (Uint8 mask of river cells) }.
 */
export function buildRivers(terr0, elev, W, H, noise, opts = {}) {
  const TH = opts.threshold ?? 90; const great = opts.great ?? null;      // great: { block: Uint8Array, pts: [[x,y]..], width }
  const terr = Uint8Array.from(terr0); const N = W * H;
  const sea = new Uint8Array(N); const block = great?.block ?? new Uint8Array(N);
  for (let i = 0; i < N; i++) sea[i] = terr[i] === T.SEA ? 1 : 0;
  const dSea = distanceTo(sea, W, H);
  const Z = new Float32Array(N);
  // smooth random relief so flat plains still get a drainage path
  const jitter = (x, y) => (noise.fbm(x + 2000, y + 500, 1 / 9, 3) - 0.5) * 0.15;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; Z[i] = sea[i] ? -1 : elev[i] + jitter(x, y) + dSea[i] * 0.0007;
    if (block[i]) Z[i] = -0.5;               // the great river is a sink that tributaries flow into
  }
  const sink = new Uint8Array(N); for (let i = 0; i < N; i++) sink[i] = (sea[i] || block[i]) ? 1 : 0;
  // priority flood
  const filled = Float32Array.from(Z); const seen = new Uint8Array(N); const pq = new Heap();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (sink[i] || y === 0 || x === 0 || y === H - 1 || x === W - 1) { seen[i] = 1; pq.push(Z[i], i); }
  }
  while (pq.size) {
    const [z, i] = pq.pop(); const x = i % W, y = (i / W) | 0;
    for (const [dy, dx] of D8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx; if (seen[ni]) continue; seen[ni] = 1;
      filled[ni] = Math.max(Z[ni], z + 1e-5); pq.push(filled[ni], ni);
    }
  }
  // lakes: real depressions on land
  const cand = new Uint8Array(N);
  for (let i = 0; i < N; i++) cand[i] = (!sink[i] && filled[i] - Z[i] > 0.02 && terr[i] !== T.MOUNTAIN) ? 1 : 0;
  const cc = components(cand, W, H, true);
  const newLake = new Uint8Array(N);
  for (let l = 1; l <= cc.count; l++) {
    const a = cc.sizes[l]; if (a < 7 || a > 140) continue;
    for (let i = 0; i < N; i++) if (cc.lab[i] === l) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx; if (!sink[ni] && terr[ni] !== T.MOUNTAIN && terr[ni] !== T.SEA) newLake[ni] = 1;
      }
    }
  }
  for (let i = 0; i < N; i++) if (newLake[i]) terr[i] = T.LAKE;
  const lake = new Uint8Array(N); for (let i = 0; i < N; i++) lake[i] = terr[i] === T.LAKE ? 1 : 0;
  // D8 flow on the filled surface, then accumulate (mountains and hills shed more water)
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
  const down = new Int32Array(N).fill(-1);
  for (const i of order) {
    if (sink[i]) continue; const x = i % W, y = (i / W) | 0; let best = -1, bd = 1e9;
    for (const [dy, dx] of D8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx; const d = (filled[ni] - filled[i]) / (dx && dy ? Math.SQRT2 : 1);
      if (d < bd - 1e-12) { bd = d; best = ni; }
    }
    down[i] = best;
  }
  const acc = new Float32Array(N);
  for (let i = 0; i < N; i++) acc[i] = sink[i] ? 0 : (1 + 1.5 * (terr[i] === T.MOUNTAIN) + 0.6 * (terr[i] === T.HILLS));
  for (const i of order) { if (sink[i] || down[i] < 0) continue; acc[down[i]] += acc[i]; }
  const channel = new Uint8Array(N);
  for (let i = 0; i < N; i++) channel[i] = (!sink[i] && !lake[i] && acc[i] >= TH) ? 1 : 0;
  // trace each river from its source downstream
  const indeg = new Int32Array(N);
  for (let i = 0; i < N; i++) if (channel[i] && down[i] >= 0 && channel[down[i]]) indeg[down[i]]++;
  const sources = []; for (let i = 0; i < N; i++) if (channel[i] && indeg[i] === 0) sources.push(i);
  sources.sort((a, b) => acc[b] - acc[a]);
  const used = new Uint8Array(N); const rivers = [];
  const toYX = (i) => [(i / W) | 0, i % W];
  for (const s of sources) {
    const pts = [s]; let c = s;
    for (;;) {
      const n = down[c]; if (n < 0) break;
      if (sink[n] || lake[n]) { pts.push(n); break; }
      if (!channel[n]) break;
      pts.push(n); if (used[n]) break; c = n;
    }
    for (let k = 0; k < pts.length - 1; k++) used[pts[k]] = 1;
    if (pts.length >= 5) rivers.push({ pts: pts.map(toYX), acc: pts.map((i) => acc[i]) });
  }
  // a lake spills over its lowest rim and carries on to the sea
  const lc = components(lake, W, H, false);
  for (let l = 1; l <= lc.count; l++) {
    let outs = []; let inflow = 0;
    for (let i = 0; i < N; i++) if (lc.lab[i] === l) { inflow = Math.max(inflow, acc[i]); if (down[i] >= 0 && !lake[down[i]]) outs.push(i); }
    if (!outs.length || (inflow < TH * 0.4 && lc.sizes[l] < 20)) continue;
    const s = outs.sort((a, b) => acc[b] - acc[a])[0]; const pts = [s]; let c = s;
    for (;;) { const n = down[c]; if (n < 0) break; pts.push(n); if (sink[n] || used[n]) break; c = n; }
    for (let k = 0; k < pts.length - 1; k++) used[pts[k]] = 1;
    if (pts.length >= 3) { const a0 = Math.max(acc[s], TH); rivers.push({ pts: pts.map(toYX), acc: pts.map((i) => Math.max(a0, acc[i])) }); }
  }
  for (const r of rivers) for (const [y, x] of r.pts) channel[y * W + x] = channel[y * W + x] || 1;
  if (great) { // the great river itself, listed first, drawn very wide
    const pts = []; for (const [x, y] of great.pts) pts.push([y, x]);
    rivers.unshift({ pts, acc: pts.map(() => 6000), wmax: great.width, great: true });
  }
  return { rivers, terr, acc, channel, lake, down };
}
