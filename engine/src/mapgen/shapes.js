import { smoothstep, components } from './grid.js';

export const SHAPES = ['continent', 'split', 'islands', 'archipelago', 'river_split'];
export const SHAPE_INFO = {
  continent:   { label: 'One continent',          land: 0.46, minLand: 60 },
  split:       { label: 'Continent cut in two',   land: 0.40, minLand: 200 },
  islands:     { label: 'Big islands',            land: 0.34, minLand: 150 },
  archipelago: { label: 'Archipelago',            land: 0.27, minLand: 14 },
  river_split: { label: 'Split by a great river', land: 0.46, minLand: 60 },
};

function polyDist(x, y, pts, out) { // distance from (x,y) to a polyline of [x,y] points; out.t = position along it (0..1)
  let best = 1e9, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy)); if (d < best) { best = d; bt = (i + t) / (pts.length - 1); }
  }
  if (out) out.t = bt; return best;
}

function wanderLine(W, H, rng, horizontal, amp, along = 1) { // a meandering line across the whole map
  const pts = []; const phase = rng.next() * 6.28, ph2 = rng.next() * 6.28; const n = 40;
  const off = (rng.next() - 0.5) * 0.18;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const w = (0.5 + off) + amp * (0.7 * Math.sin(t * 6.28 * 0.9 * along + phase) + 0.3 * Math.sin(t * 6.28 * 2.3 + ph2));
    pts.push(horizontal ? [t * (W - 1), w * (H - 1)] : [w * (W - 1), t * (H - 1)]);
  }
  return pts;
}

export function landField(shape, W, H, noise, rng) {
  const f = new Float32Array(W * H); const meta = { shape };
  const warp = (x, y, amp = 14) => [x + (noise.fbm(x + 900, y, 1 / 38, 3) - 0.5) * 2 * amp, y + (noise.fbm(x, y + 1700, 1 / 38, 3) - 0.5) * 2 * amp];
  const base = (x, y) => noise.fbm(x, y, 1 / 55, 5);
  const ell = (x, y, cx, cy, ax, ay) => Math.hypot((x / W - cx) / ax, (y / H - cy) / ay);
  const jit = () => (rng.next() - 0.5) * 0.08;
  if (shape === 'continent' || shape === 'river_split' || shape === 'split') {
    const cx = 0.5 + jit(), cy = 0.5 + jit(); const ax = shape === 'split' ? 0.47 : 0.45, ay = 0.45;
    let strait = null; let horizontal = rng.next() < 0.5;
    if (shape === 'split') { strait = wanderLine(W, H, rng, !horizontal, 0.12); meta.strait = strait; meta.straitWidth = 7 + Math.floor(rng.next() * 5);
      meta.pinch = [0.22 + rng.next() * 0.2, 0.62 + rng.next() * 0.2]; if (rng.next() < 0.5) meta.pinch.pop(); }   // narrow necks where a bridge can cross
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = ell(x, y, cx, cy, ax, ay);
      let v = 1.08 - 1.15 * Math.pow(r, 1.7) + (base(x, y) - 0.5) * 0.95;
      if (strait) { const o = {}; const d = polyDist(x, y, strait, o); let pn = 0; for (const tp of meta.pinch) pn = Math.max(pn, Math.exp(-(((o.t - tp) / 0.05) ** 2))); const hw = meta.straitWidth * 0.5 * (1 - 0.72 * pn); v -= 2.2 * smoothstep(hw + 3.5, hw - 1.5, d); }
      f[y * W + x] = v;
    }
  } else if (shape === 'islands') {
    const R = Math.min(W, H); const k = 3 + Math.floor(rng.next() * 3); const cs = [];
    const okAll = (c, f) => cs.every((o) => Math.hypot(c[0] - o[0], c[1] - o[1]) > (c[2] + o[2]) * f);
    const inMap = (c) => c[0] > c[2] * 0.7 + 4 && c[0] < W - c[2] * 0.7 - 4 && c[1] > c[2] * 0.7 + 4 && c[1] < H - c[2] * 0.7 - 4;
    for (let tries = 0; cs.length < k && tries < 800; tries++) {
      const r = (cs.length === 0 ? 0.30 : 0.17 + rng.next() * 0.09) * R;
      if (cs.length === 0) { cs.push([W * (0.35 + rng.next() * 0.3), H * (0.38 + rng.next() * 0.24), r]); continue; }
      const p = cs[Math.floor(rng.next() * cs.length)]; const a = rng.next() * 6.283; const dd = (r + p[2]) * (1.15 + rng.next() * 0.3);   // the next island lies just off a neighbour: a short bridge apart
      const c = [p[0] + Math.cos(a) * dd, p[1] + Math.sin(a) * dd * 0.8, r];
      if (inMap(c) && okAll(c, 0.95)) cs.push(c);
    }
    cs.isle = null;
    if (rng.next() < 0.8) {     // one small island far from the rest: boat only
      const r = 0.080 * R;
      for (let tries = 0; tries < 400 && !cs.isle; tries++) {
        const c = [r + 6 + rng.next() * (W - 2 * r - 12), r + 6 + rng.next() * (H - 2 * r - 12), r];
        if (inMap(c) && okAll(c, 1.0) && cs.every((o) => Math.hypot(c[0] - o[0], c[1] - o[1]) > (c[2] + o[2]) + 20)) { cs.push(c); cs.isle = c; }
      }
    }
    meta.centres = cs;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = -9; const [wx, wy] = warp(x, y, 0.16 * Math.min(W, H) / 1.0 * 0.55); for (const [cx, cy, r] of cs) v = Math.max(v, 1.05 - 1.15 * Math.pow(Math.hypot(wx - cx, wy - cy) / r, 1.6));
      f[y * W + x] = v + (base(x, y) - 0.5) * 0.85;
    }
  } else if (shape === 'archipelago') {
    const R = Math.min(W, H); const cs = [];
    const big = 1 + Math.floor(rng.next() * 2);
    for (let tries = 0; cs.length < big + 13 && tries < 900; tries++) {
      const r = (cs.length < big ? 0.17 : 0.05 + rng.next() * 0.06) * R;
      const c = [r + rng.next() * (W - 2 * r), r + rng.next() * (H - 2 * r), r];
      if (cs.every((o) => Math.hypot(c[0] - o[0], c[1] - o[1]) > (c[2] + o[2]) * 1.15 + 4)) cs.push(c);
    }
    meta.centres = cs;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = -9; const [wx, wy] = warp(x, y, 6); for (const [cx, cy, r] of cs) v = Math.max(v, 1.05 - 1.2 * Math.pow(Math.hypot(wx - cx, wy - cy) / r, 1.5));
      f[y * W + x] = v + (noise.fbm(x, y, 1 / 18, 4) - 0.5) * 0.7;
    }
  } else throw new Error('unknown map shape ' + shape);
  // a clear sea margin around the map edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y); f[y * W + x] -= 3 * smoothstep(7, 2, e);
  }
  return { field: f, meta };
}

/** Sea level from a target land share, then tidy: drop tiny islands, fill tiny enclosed seas. */
export function landMask(field, W, H, shape) {
  const info = SHAPE_INFO[shape]; const sorted = Float32Array.from(field).sort();
  const thr = sorted[Math.floor(sorted.length * (1 - info.land))];
  const land = new Uint8Array(W * H); for (let i = 0; i < land.length; i++) land[i] = field[i] > thr ? 1 : 0;
  let c = components(land, W, H, true);
  for (let i = 0; i < land.length; i++) if (land[i] && c.sizes[c.lab[i]] < info.minLand) land[i] = 0;
  const sea = new Uint8Array(W * H); for (let i = 0; i < sea.length; i++) sea[i] = land[i] ? 0 : 1;
  c = components(sea, W, H, false);
  const border = new Set();
  for (let x = 0; x < W; x++) { border.add(c.lab[x]); border.add(c.lab[(H - 1) * W + x]); }
  for (let y = 0; y < H; y++) { border.add(c.lab[y * W]); border.add(c.lab[y * W + W - 1]); }
  for (let i = 0; i < sea.length; i++) if (sea[i] && !border.has(c.lab[i]) && c.sizes[c.lab[i]] < 90) land[i] = 1;
  return { land, thr };
}

/** The great river for the river_split shape: a wide channel from coast to coast. */
export function greatRiver(land, W, H, noise, rng) {
  // run along the longer side of the land bounding box so the river really cuts the country in two
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (land[y * W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const horizontal = (x1 - x0) >= (y1 - y0) * 0.9;
  const pts = []; const phase = rng.next() * 6.28; const n = 60;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const w = 0.12 * (horizontal ? (y1 - y0) : (x1 - x0)) * (0.65 * Math.sin(t * 6.28 * 1.1 + phase) + 0.35 * Math.sin(t * 6.28 * 2.7 + phase * 2));
    if (horizontal) pts.push([x0 - 6 + t * (x1 - x0 + 12), Math.min(H - 6, Math.max(5, cy + w + (rng.next() - 0.5) * 0.5))]);
    else pts.push([Math.min(W - 6, Math.max(5, cx + w + (rng.next() - 0.5) * 0.5)), y0 - 6 + t * (y1 - y0 + 12)]);
  }
  return { pts, horizontal, width: 1.9 };
}
