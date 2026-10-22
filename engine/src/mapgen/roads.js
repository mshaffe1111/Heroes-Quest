import { D8, Heap } from './grid.js';
import { T } from './terrain.js';

const COST = { [T.GRASS]: 1, [T.FOREST]: 1.9, [T.HILLS]: 2.3, [T.MOUNTAIN]: 14, [T.SAND]: 1.4 };

/** Choose where the great river can be crossed: 2 or 3 bridges, spread far apart so crossing means a real detour. */
export function greatRiverCrossings(great, terr, W, H, rng) {
  const nb = 2 + (rng.next() < 0.45 ? 1 : 0); const sites = []; const P = great.pts;
  const fr = nb === 2 ? [0.27, 0.74] : [0.17, 0.5, 0.83];
  for (const f of fr) {
    let best = null;
    for (let dt = -0.07; dt <= 0.07; dt += 0.01) {          // nudge the site off mountains
      const k = Math.min(P.length - 1, Math.max(0, Math.round((f + dt + (rng.next() - 0.5) * 0.04) * (P.length - 1)))); const [x, y] = P[k];
      const t = terr[Math.round(y) * W + Math.round(x)];
      const k0 = Math.max(0, k - 1), k1 = Math.min(P.length - 1, k + 1); let tx = P[k1][0] - P[k0][0], ty = P[k1][1] - P[k0][1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let banks = 0; for (const sg of [-1, 1]) for (const dd of [3, 5, 7]) { const bx = Math.round(x - ty * sg * dd), by = Math.round(y + tx * sg * dd); const bt = bx >= 0 && by >= 0 && bx < W && by < H ? terr[by * W + bx] : T.SEA; if (bt !== T.SEA && bt !== T.LAKE && bt !== T.MOUNTAIN) banks += 1; }
      const pen = (t === T.MOUNTAIN ? 2 : t === T.SEA ? 5 : t === T.HILLS ? 0.4 : 0) + Math.abs(dt) * 3 + (6 - banks) * 1.5;
      if (!best || pen < best.pen) best = { x, y, pen };
    }
    sites.push([best.x, best.y]);
  }
  return sites;
}

export function buildRoads(ctx, cities, rng, opts = {}) {
  const { terr, W, H, channel, block } = ctx; const N = W * H;
  const pass = new Uint8Array(N); // great-river cells that are crossable (bridge corridors)
  for (const [bx, by] of opts.bridgeSites ?? []) for (let y = Math.floor(by) - 3; y <= Math.ceil(by) + 3; y++) for (let x = Math.floor(bx) - 3; x <= Math.ceil(bx) + 3; x++)
    if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x - bx, y - by) <= 2.6 && block[y * W + x]) pass[y * W + x] = 1;
  const deck = ctx.straits ? ctx.straits.deck : null;
  const base = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = terr[i]; let c = COST[t] ?? Infinity;
    if (deck && deck[i]) c = 3;                                 // causeway bridge across a strait
    if (block[i] && !pass[i]) c = Infinity;
    else if (block[i]) c = 3;                                  // the bridge deck itself
    else if (channel[i] && c < Infinity) c += 5;               // stream crossings cost a bridge
    base[i] = c;
  }
  const use = new Float32Array(N).fill(1);                      // reuse discount on built road
  const hDist = (a, b) => Math.hypot(a % W - b % W, ((a / W) | 0) - ((b / W) | 0));
  const search = (s, g) => {
    const dist = new Map(); const prev = new Map(); const pq = new Heap(); dist.set(s, 0); pq.push(hDist(s, g), s); let steps = 0;
    while (pq.size) {
      const [, i] = pq.pop(); if (i === g) break; const d = dist.get(i); if (++steps > 60000) break;
      const x = i % W, y = (i / W) | 0;
      for (const [dy, dx] of D8) {
        const nx = x + dx, ny = y + dy; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue; const ni = ny * W + nx;
        const c = base[ni] * use[ni]; if (c === Infinity) continue; const nd = d + c * (dx && dy ? 1.414 : 1);
        if (nd < (dist.get(ni) ?? Infinity)) { dist.set(ni, nd); prev.set(ni, i); pq.push(nd + hDist(ni, g), ni); }
      }
    }
    if (!dist.has(g)) return null; const path = []; for (let c = g; c !== undefined; c = prev.get(c)) path.push(c); path.reverse();
    return { path, cost: dist.get(g) };
  };
  const idx = cities.map(([y, x]) => y * W + x);
  // candidate links: each city to its 4 nearest
  const cand = new Map();
  cities.forEach((c, a) => {
    const near = cities.map((o, b) => [b, (o[0] - c[0]) ** 2 + (o[1] - c[1]) ** 2]).filter(([b]) => b !== a).sort((p, q) => p[1] - q[1]).slice(0, 5);
    near.forEach(([b], r) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!cand.has(k)) cand.set(k, { a: Math.min(a, b), b: Math.max(a, b), rank: r }); else cand.get(k).rank = Math.min(cand.get(k).rank, r); });
  });
  const edges = [];
  for (const e of cand.values()) { const r = search(idx[e.a], idx[e.b]); if (!r) continue; const straight = hDist(idx[e.a], idx[e.b]); edges.push({ ...e, cost: r.cost, ratio: r.cost / Math.max(1, straight) }); }
  edges.sort((p, q) => p.cost - q.cost);
  const parent = cities.map((_, i) => i); const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const chosen = [];
  for (const e of edges) { const ra = find(e.a), rb = find(e.b); if (ra !== rb) { parent[ra] = rb; chosen.push(e); e.mst = true; } }
  for (const e of edges) if (!e.mst && e.rank <= 2 && e.ratio < 2.6) chosen.push(e);   // neighbours get a second route (loops)
  chosen.sort((p, q) => p.cost - q.cost);
  const forced = [];
  for (const [bx, by] of opts.bridgeSites ?? []) {            // every great-river bridge gets a road: nearest city on each bank, routed through the bridge
    const P = opts.great.pts; let k = 0, bd = 1e9; P.forEach(([x, y], q) => { const d = Math.hypot(x - bx, y - by); if (d < bd) { bd = d; k = q; } });
    const k0 = Math.max(0, k - 1), k1 = Math.min(P.length - 1, k + 1); let tx = P[k1][0] - P[k0][0], ty = P[k1][1] - P[k0][1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx; const best = [null, null];
    cities.forEach((c, i) => { const dx = c[1] - bx, dy = c[0] - by; const side = (dx * nx + dy * ny) > 0 ? 1 : 0; const d = Math.hypot(dx, dy); if (d < 30 && (!best[side] || d < best[side].d)) best[side] = { i, d }; });
    if (!best[0] || !best[1]) continue;
    let mid = -1, md = 1e9; for (let i = 0; i < N; i++) if (pass[i]) { const d = Math.hypot(i % W - bx, ((i / W) | 0) - by); if (d < md) { md = d; mid = i; } }
    if (mid < 0) continue;
    forced.push({ a: best[0].i, b: best[1].i, via: mid });
  }
  for (const sb of ctx.straits?.bridges ?? []) {              // every causeway gets a road: the nearest city on each shore, routed over the deck
    const side = (lab, p) => { let b = null; cities.forEach((c, i) => { if (ctx.straits.lab[c[0] * W + c[1]] !== lab) return; const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (!b || d < b.d) b = { i, d }; }); return b; };
    const A = side(sb.A, sb.a), B = side(sb.B, sb.b); if (!A || !B) continue;
    const m = sb.deck[sb.deck.length >> 1]; forced.push({ a: A.i, b: B.i, via: m[0] * W + m[1] });
  }
  const roads = []; const roadMask = new Uint8Array(N);
  for (const f of forced) {
    const r1 = search(idx[f.a], f.via), r2 = search(f.via, idx[f.b]); if (!r1 || !r2) continue;
    const path = r1.path.concat(r2.path.slice(1));
    roads.push({ a: f.a, b: f.b, cells: path.map((i) => [(i / W) | 0, i % W]), cost: r1.cost + r2.cost });
    for (const i of path) { use[i] = Math.min(use[i], 0.42); roadMask[i] = 1; }
  }
  for (const e of chosen) {
    const r = search(idx[e.a], idx[e.b]); if (!r) continue;
    roads.push({ a: e.a, b: e.b, cells: r.path.map((i) => [(i / W) | 0, i % W]), cost: r.cost });
    for (const i of r.path) { use[i] = Math.min(use[i], 0.42); roadMask[i] = 1; }
  }
  // bridges: every run of river cells a road passes through
  const bridges = [];
  for (const rd of roads) {
    let run = null;
    rd.cells.forEach(([y, x], k) => {
      const i = y * W + x; const wet = block[i] || channel[i];
      if (wet) { if (!run) run = { cells: [] }; run.cells.push([y, x, block[i] ? 1 : 0]); }
      if ((!wet || k === rd.cells.length - 1) && run) { const m = run.cells[run.cells.length >> 1]; bridges.push({ y: m[0], x: m[1], great: run.cells.some((c) => c[2]) }); run = null; }
    });
  }
  return { roads, roadMask, bridges, pass };
}
