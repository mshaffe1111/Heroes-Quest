import { D8, Heap, components, distanceTo } from './grid.js';
import { T } from './terrain.js';

/**
 * Cities: Azgaar-style site scoring (river valley, harbour, hills bonus, mountain penalty), then the widest spacing that
 * still yields n sites. Every landmass of useful size gets at least one city so no island is empty.
 */
export function placeCities(ctx, n, rng) {
  const { terr, W, H, channel, block } = ctx; const N = W * H;
  const sea = new Uint8Array(N), riv = new Uint8Array(N), mtn = new Uint8Array(N), hill = new Uint8Array(N), lakeM = new Uint8Array(N);
  for (let i = 0; i < N; i++) { sea[i] = terr[i] === T.SEA; riv[i] = channel[i] || block[i] ? 1 : 0; mtn[i] = terr[i] === T.MOUNTAIN; hill[i] = terr[i] === T.HILLS; lakeM[i] = terr[i] === T.LAKE; }
  const ocean = oceanMask(terr, W, H);
  const dRiv = distanceTo(riv, W, H), dOcean = distanceTo(ocean, W, H), dMtn = distanceTo(mtn, W, H), dHill = distanceTo(hill, W, H), dLake = distanceTo(lakeM, W, H);
  const land = new Uint8Array(N); for (let i = 0; i < N; i++) land[i] = (terr[i] !== T.SEA && terr[i] !== T.LAKE && !block[i]) ? 1 : 0;
  const lm = components(land, W, H, true);
  const hasRiverBlock = block.some((v) => v); const minLm = hasRiverBlock ? 150 : 25;
  const cand = [];
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    const i = y * W + x;
    if (!(terr[i] === T.GRASS || terr[i] === T.SAND || terr[i] === T.FOREST) || riv[i] || dRiv[i] < 2.0 || dMtn[i] < 1.5) continue;
    let s = 1 + 0.9 * (dRiv[i] <= 4.5) + 0.7 * (dOcean[i] <= 2.5) + 0.3 * (dLake[i] <= 2.5) + 0.35 * (dHill[i] <= 3) - 0.8 * (dMtn[i] <= 3)
      + 0.4 * ((dRiv[i] <= 4.5) && (dOcean[i] <= 2.5)) - 0.6 * (terr[i] === T.FOREST) + rng.next() * 0.55;
    if (lm.sizes[lm.lab[i]] < minLm) continue;                 // no cities on slivers cut off by a river or the sea
    cand.push({ y, x, i, s, lm: lm.lab[i] });
  }
  cand.sort((a, b) => b.s - a.s);
  // boat-only islets: one or two castles, whatever their size
  const st = ctx.straits; const isletCap = (i) => { if (!st) return Infinity; const l = st.lab[i]; return st.islets.has(l) ? (st.sizes[l] >= 260 ? 2 : 1) : Infinity; };
  const greedy = (mind, reserve) => {
    const out = []; const cell = Math.ceil(mind); const grid = new Map(); const cnt = new Map();
    const ok = (c) => { const gx = (c.x / cell) | 0, gy = (c.y / cell) | 0;
      for (let a = gx - 1; a <= gx + 1; a++) for (let b = gy - 1; b <= gy + 1; b++) for (const o of grid.get(a * 4096 + b) ?? []) if ((o.y - c.y) ** 2 + (o.x - c.x) ** 2 < mind * mind) return false; return true; };
    const add = (c) => { cnt.set(st?.lab[c.i], (cnt.get(st?.lab[c.i]) ?? 0) + 1); out.push(c); const k = ((c.x / cell) | 0) * 4096 + ((c.y / cell) | 0); (grid.get(k) ?? grid.set(k, []).get(k)).push(c); };
    for (const r of reserve) if (ok(r)) add(r);
    for (const c of cand) { if (out.length >= n) break; if ((cnt.get(st?.lab[c.i]) ?? 0) >= isletCap(c.i)) continue; if (ok(c)) add(c); }
    return out;
  };
  // reserve: best site on every landmass with at least 30 land tiles (and a proportional minimum on big ones)
  const reserve = []; const best = new Map();
  for (const c of cand) if (!best.has(c.lm) && lm.sizes[c.lm] >= 30 && dOcean[c.i] <= 2.6) best.set(c.lm, c);   // a harbour town on every island
  for (const c of cand) if (!best.has(c.lm) && lm.sizes[c.lm] >= 30) best.set(c.lm, c);
  for (const c of best.values()) reserve.push(c);
  let lo = 4, hi = 22;
  for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (greedy(mid, reserve).length >= n) lo = mid; else hi = mid; }
  const sites = greedy(lo, reserve).sort((a, b) => a.y - b.y || a.x - b.x);
  const cities = sites.map((c) => [c.y, c.x]);
  const ports = sites.map((c) => (dOcean[c.i] <= 2.6 ? 1 : 0));
  const isle = sites.map((c) => (st && st.islets.has(st.lab[c.i]) ? 1 : 0));
  return { cities, ports, isle, spacing: lo, landLabel: lm.lab, landSizes: lm.sizes, ocean };
}

export function oceanMask(terr, W, H) { // sea water connected to the map edge (inland seas and lakes do not count)
  const sea = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) sea[i] = terr[i] === T.SEA ? 1 : 0;
  const c = components(sea, W, H, false); const edge = new Set();
  for (let x = 0; x < W; x++) { edge.add(c.lab[x]); edge.add(c.lab[(H - 1) * W + x]); }
  for (let y = 0; y < H; y++) { edge.add(c.lab[y * W]); edge.add(c.lab[y * W + W - 1]); }
  const o = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) if (sea[i] && edge.has(c.lab[i]) && c.sizes[c.lab[i]] > 300) o[i] = 1; return o;
}

/**
 * Realms: capitals spread as far apart as possible (so on a split or island map some realms start alone on their own land),
 * home territory by travel distance (crossing water is allowed but very costly, so islands go to the nearest realm).
 * the 90s original-style start: each realm owns only its capital; every other city is held by the neutral "Unsworn".
 */
export function placeRealms(ctx, cities, nRealms, rng, opts = {}) {
  const { terr, W, H, block } = ctx; const N = W * H;
  const pts = cities.map(([y, x]) => [x, y]);
  const eligible = []; for (let i = 0; i < cities.length; i++) { const [y, x] = cities[i]; if (ctx.landSizes[ctx.landLabel[y * W + x]] >= 60 && !(ctx.isle && ctx.isle[i])) eligible.push(i); }
  const cx = eligible.reduce((s, i) => s + pts[i][0], 0) / eligible.length, cy = eligible.reduce((s, i) => s + pts[i][1], 0) / eligible.length;
  const d2 = (a, b) => (pts[a][0] - pts[b][0]) ** 2 + (pts[a][1] - pts[b][1]) ** 2;
  const caps = [eligible.reduce((b, i) => ((pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2 > (pts[b][0] - cx) ** 2 + (pts[b][1] - cy) ** 2 ? i : b), eligible[0])];
  while (caps.length < nRealms && caps.length < eligible.length) {
    let bi = -1, bd = -1; for (const i of eligible) { if (caps.includes(i)) continue; const dm = Math.min(...caps.map((c) => d2(i, c))); if (dm > bd) { bd = dm; bi = i; } }
    caps.push(bi);
  }
  // travel-distance Voronoi over the grid: land 1, water 45 (rivers and straits are barriers, islands still get an owner)
  const dist = new Float64Array(N).fill(1e9); const who = new Int16Array(N).fill(-1); const pq = new Heap();
  caps.forEach((c, r) => { const i = cities[c][0] * W + cities[c][1]; dist[i] = 0; who[i] = r; pq.push(0, i); });
  while (pq.size) {
    const [d, i] = pq.pop(); if (d > dist[i]) continue; const x = i % W, y = (i / W) | 0;
    for (const [dy, dx] of D8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx;
      const wcost = (terr[ni] === T.SEA || terr[ni] === T.LAKE || block[ni]) ? 45 : (terr[ni] === T.MOUNTAIN ? 4 : 1);
      const nd = d + wcost * (dx && dy ? Math.SQRT2 : 1); if (nd < dist[ni]) { dist[ni] = nd; who[ni] = who[i]; pq.push(nd, ni); }
    }
  }
  const home = cities.map(([y, x]) => who[y * W + x]);
  const owner = home.map((h, i) => (caps.includes(i) ? h : -1));      // -1 = the Unsworn (neutral)
  return { caps, home, owner, territory: who };
}
