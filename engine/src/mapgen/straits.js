import { D8, components, Heap } from './grid.js';
import { T } from './terrain.js';

/** Longest span of water a causeway bridge may cross, in tiles. */
export const MAX_SPAN = 10;
/** A landmass smaller than this that no bridge reaches is an "islet": boat only, never a capital, one or two castles. */
export const ISLET_MAX = 450;
/** Landmasses smaller than this are not bridged or settled at all. */
export const MIN_LAND = 25;

function line(a, b) { // Bresenham, cells as [y, x] from a to b inclusive
  let [y0, x0] = a; const [y1, x1] = b; const out = []; const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0); const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
  for (;;) { out.push([y0, x0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
  return out;
}

/**
 * Plan the sea causeways. Landmasses are the connected pieces of non-sea cells (a lake or the great river does not split one).
 * For each pair of neighbouring landmasses the narrowest crossing is found; crossings no longer than MAX_SPAN become candidate
 * bridges, and a minimum spanning set of them joins as many landmasses as possible (so every island that CAN be reached on foot IS).
 * Returns { lab, sizes, bridges[], cluster[] (per label), islets:Set(label), deck (Uint8 mask of bridge deck cells) }.
 */
export function planCauseways(terr, W, H, rng, opts = {}) {
  const N = W * H; const maxSpan = opts.maxSpan ?? MAX_SPAN;
  const dry = new Uint8Array(N); for (let i = 0; i < N; i++) dry[i] = terr[i] !== T.SEA ? 1 : 0;
  const minLand = opts.minLand ?? MIN_LAND;
  const lm = components(dry, W, H, true); const labs = []; for (let l = 1; l <= lm.count; l++) if (lm.sizes[l] >= minLand) labs.push(l);
  // narrowest crossing per ordered pair: BFS through sea from each landmass
  const best = new Map();
  for (const A of labs) {
    const dist = new Int16Array(N).fill(-1); const par = new Int32Array(N).fill(-1); const q = [];
    for (let i = 0; i < N; i++) if (lm.lab[i] === A) {
      const x = i % W, y = (i / W) | 0; let coast = false;
      for (const [dy, dx] of D8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (terr[ny * W + nx] === T.SEA) { coast = true; break; } }
      if (coast) { dist[i] = 0; q.push(i); }
    }
    const hit = new Map();
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; const d = dist[i]; if (d >= maxSpan + 1) continue; const x = i % W, y = (i / W) | 0;
      for (const [dy, dx] of D8) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx;
        if (terr[ni] === T.SEA) { if (dist[ni] < 0) { dist[ni] = d + 1; par[ni] = i; q.push(ni); } }
        else if (lm.lab[ni] !== A && lm.lab[ni] > 0 && lm.sizes[lm.lab[ni]] >= minLand && dist[i] >= 1) {      // reached another landmass from a sea cell
          const B = lm.lab[ni]; const cur = hit.get(B); if (!cur || d < cur.gap) hit.set(B, { gap: d, sea: i, land: ni });
        }
      }
    }
    for (const [B, h] of hit) {
      if (A > B) continue;      // each pair once (A<B is explored from A; B->A would find the same crossing)
      // walk back to A to find the land cell the crossing starts from
      let c = h.sea; const seaPath = []; while (c >= 0 && dist[c] > 0) { seaPath.push(c); c = par[c]; }
      // c is a coastal land cell of A (dist 0) only when it is land; BFS seeded land cells, so the chain ends there
      const startLand = c >= 0 ? c : seaPath[seaPath.length - 1];
      best.set(A + ',' + B, { A, B, a: [(startLand / W) | 0, startLand % W], b: [(h.land / W) | 0, h.land % W], seaPath: seaPath.reverse(), gap: h.gap });
    }
  }
  // straighten each crossing; keep only clean ones (deck cells are sea, no third landmass in the way)
  const cands = [];
  for (const e of best.values()) {
    let cells = line(e.a, e.b); let deck = cells.filter(([y, x]) => terr[y * W + x] === T.SEA);
    const clean = cells.every(([y, x]) => { const i = y * W + x; return terr[i] === T.SEA || lm.lab[i] === e.A || lm.lab[i] === e.B; });
    if (!clean) deck = e.seaPath.map((i) => [(i / W) | 0, i % W]);
    if (!deck.length || deck.length > maxSpan) continue;
    cands.push({ A: e.A, B: e.B, a: e.a, b: e.b, deck, gap: deck.length, cells: clean ? cells : null });
  }
  cands.sort((p, q) => p.gap - q.gap + (rng.next() - 0.5) * 0.4);
  const parent = new Map(labs.map((l) => [l, l])); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const bridges = [];
  for (const c of cands) { const ra = find(c.A), rb = find(c.B); if (ra !== rb) { parent.set(ra, rb); bridges.push(c); } }
  const cluster = new Map(); for (const l of labs) cluster.set(l, find(l));
  const csize = new Map(); for (const l of labs) csize.set(cluster.get(l), (csize.get(cluster.get(l)) ?? 0) + lm.sizes[l]);
  const members = new Map(); for (const l of labs) members.set(cluster.get(l), (members.get(cluster.get(l)) ?? 0) + 1);
  // the main network = the bridge-joined cluster that holds the most land; every landmass outside it is a boat-only islet
  let mainRoot = null, mainSize = -1; for (const [r, sz] of csize) if (sz > mainSize) { mainSize = sz; mainRoot = r; }
  const islets = new Set(); if (labs.length > 1) for (const l of labs) if (cluster.get(l) !== mainRoot) islets.add(l);
  const deck = new Uint8Array(N); for (const b of bridges) for (const [y, x] of b.deck) deck[y * W + x] = 1;
  return { lab: lm.lab, sizes: lm.sizes, labels: labs, bridges, cluster, mainRoot, clusterSize: csize, islets, deck, candidates: cands.length };
}

/**
 * Land spits: where two big islands are too far apart for a bridge, each grows a tongue of land toward the other so the
 * remaining gap is a bridgeable 3 to 6 tiles. Islets (small landmasses) are left alone, so they stay boat-only.
 */
export function growSpits(land, W, H, rng, opts = {}) {
  const N = W * H; const proxy = new Uint8Array(N);
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < N; i++) proxy[i] = land[i] ? T.GRASS : T.SEA;
    const plan = planCauseways(proxy, W, H, rng, { maxSpan: 60, minLand: ISLET_MAX });
    const todo = plan.bridges.filter((b) => b.gap > MAX_SPAN - 1 && b.gap <= (opts.maxGap ?? 30));
    if (!todo.length) break;
    for (const b of todo) {
      const target = 4 + Math.floor(rng.next() * 5); const cut = b.gap - target; if (cut <= 0) continue;
      const k1 = Math.ceil(cut / 2), k2 = cut - k1; const d = b.deck;
      const grow = (cells, w) => { cells.forEach(([y, x], j) => { const r = w * (1 - 0.35 * (j / Math.max(1, cells.length - 1))) + 0.4;   // tongue tapers toward its tip
        for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) if (xx > 3 && yy > 3 && xx < W - 4 && yy < H - 4 && Math.hypot(xx - x, yy - y) <= r) land[yy * W + xx] = 1; }); };
      const w = 2.0 + rng.next() * 1.2;
      grow(d.slice(0, k1), w); grow(d.slice(d.length - k2), w);
    }
  }
  return land;
}
