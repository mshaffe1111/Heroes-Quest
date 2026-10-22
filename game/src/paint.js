// Paints the land and sea of a game into cached chunks (canvases). Everything is drawn in world pixels (TP pixels per square) so that
// textures line up from one chunk to the next, and sprites are placed from a hash of their square so every chunk agrees about them.
//
// How the ground is shaped (map polish, 22 Oct): every kind of ground (sea, river, woods, hills, mountains) is a smooth field made from the
// squares, bent a little by a fixed noise so edges wander naturally instead of following the grid or showing stamped circles. The field is
// exact at the middle of every square (a land square always looks like land at its centre, a water square like water), so the picture never
// lies about the map. The same sea field gives the beach band, wet sand, surf, shallow water and deep water.
import { tileAt } from '../../engine/src/index.js';

export const TP = 48;                       // pixels per square in the painted layer
export const CH = 12;                       // squares per chunk side
const CS = CH * TP;

const hash = (x, y, k = 0) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k + 1, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
export const rnd = hash;

const BROAD = ['dark', 'wide', 'ivy', 'pale', 'dark', 'wide', 'gnarled', 'elder', 'coppice', 'pollard', 'twin', 'poplar'];
const CONIF = ['dark', 'blue', 'cedar', 'pair', 'redwood', 'umbrella', 'dark', 'cedar', 'yellow', 'leaning'];
const MTN = ['brown4', 'forest5', 'scree6', 'snow1', 'snow2', 'brown4', 'snow1'];
const HILLDEC = ['cairn', 'fernrock', 'gorse', 'ledge', 'lichen', 'mossrock', 'stones', 'fernrock', 'gorse', 'heather'];   // heather (purple) only now and then
const ROCKS = ['r1', 'r2', 'r3', 'pile', 'grassrock'];
const D8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const OUT = { terrain: 'water', outside: true };
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---- smooth noise, made once: two channels of tileable value noise, 512 px square, in world pixels -------------------------------------
const NZ = 512; let NOISE = null;
function noiseTex() {
  if (NOISE) return NOISE; const a = new Float32Array(NZ * NZ * 2);
  for (let ch = 0; ch < 2; ch++) for (const [cell, amp] of [[128, 0.55], [64, 0.3], [32, 0.15]]) {
    const n = NZ / cell; const L = new Float32Array(n * n); for (let i = 0; i < n * n; i++) L[i] = hash(i, cell, 900 + ch) * 2 - 1;
    for (let y = 0; y < NZ; y++) {
      const fy = y / cell, j = Math.floor(fy), ty = fy - j, sy = ty * ty * (3 - 2 * ty), j0 = (j % n) * n, j1 = ((j + 1) % n) * n;
      for (let x = 0; x < NZ; x++) {
        const fx = x / cell, i = Math.floor(fx), tx = fx - i, sx = tx * tx * (3 - 2 * tx), i0 = i % n, i1 = (i + 1) % n;
        a[(y * NZ + x) * 2 + ch] += ((L[j0 + i0] * (1 - sx) + L[j0 + i1] * sx) * (1 - sy) + (L[j1 + i0] * (1 - sx) + L[j1 + i1] * sx) * sy) * amp;
      }
    }
  }
  return (NOISE = a);
}
const nzAt = (N, wx, wy, ch) => N[((((wy | 0) & 511) << 9) + ((wx | 0) & 511)) * 2 + ch];
/** How far (in squares) the ground at a world pixel is pushed before the square map is read: small, smooth, the same everywhere. */
function warp(N, wx, wy) {
  const a = nzAt(N, wx, wy, 0), b = nzAt(N, wx, wy, 1), c = nzAt(N, wx * 0.29 + 137, wy * 0.29 + 59, 1), d = nzAt(N, wx * 0.29 + 71, wy * 0.29 + 211, 0);
  const e = nzAt(N, wx * 2.3 + 17, wy * 2.3 + 91, 0), f = nzAt(N, wx * 2.3 + 233, wy * 2.3 + 7, 1);      // a fine ripple on top
  return [0.19 * a + 0.13 * c + 0.06 * e, 0.19 * b + 0.13 * d + 0.06 * f];
}
// ground codes for the fields
const OPEN = 0, WOODS = 1, HILLS = 2, MOUNT = 3, SEA = 4, RIVER = 5;

export class Painter {
  constructor(g, assets) {
    this.g = g; this.a = assets; this.chunks = new Map(); this.W = g.width; this.H = g.height;
    this.cw = Math.ceil(g.width / CH); this.ch = Math.ceil(g.height / CH);
    this.scratch = new Map(); this.sc = 1; this.maxChunks = this.cw * this.ch + 150;   // every overview chunk of the map fits, plus 150 close-up ones
    this.N = noiseTex(); this.buildCodes(); this.buildRoads();
  }
  t(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? OUT : tileAt(this.g, x, y); }
  isWater(x, y) { const t = this.t(x, y); return !t || (t.terrain === 'water' && !t.bridge); }
  has(cx, cy, lv = 1) { return this.chunks.has(cx + ',' + cy + ',' + lv); }
  scr(s) { let k = this.scratch.get(s); if (!k) { const n = Math.round(CS * s); const m = s === 1 ? n >> 1 : n; k = { mask: makeCanvas(n, n), lay: makeCanvas(n, n), small: makeCanvas(m, m), n, m }; this.scratch.set(s, k); } return k; }
  get(cx, cy, lv = 1) {
    const k = cx + ',' + cy + ',' + lv; let c = this.chunks.get(k);
    if (c) { this.chunks.delete(k); this.chunks.set(k, c); return c; }          // keep the most recently used at the back
    c = this.paint(cx, cy, lv); this.chunks.set(k, c);
    while (this.chunks.size > (this.maxChunks ?? 150)) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }
  pattern(ctx, name) { return ctx.createPattern(this.a.tex[name], 'repeat'); }

  // ---- the square map as ground codes, and how far each sea square is from land --------------------------------------------------------
  buildCodes() {
    const { W, H } = this; const code = new Uint8Array(W * H), dist = new Float32Array(W * H).fill(99); const q = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(this.g, x, y), i = y * W + x;
      code[i] = t.terrain === 'water' ? (t.river ? RIVER : SEA) : (t.cityId || t.site) ? OPEN : t.terrain === 'woods' ? WOODS : t.terrain === 'hills' ? HILLS : t.terrain === 'mountain' ? MOUNT : OPEN;
      if (t.terrain !== 'water') { dist[i] = 0; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); } } }
    this.code = code; this.dist = dist;
  }
  codeAt(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? SEA : this.code[y * this.W + x]; }
  distAt(x, y) { if (x < 0 || y < 0 || x >= this.W || y >= this.H) { const o = Math.max(-x, -y, x - this.W + 1, y - this.H + 1); return Math.min(8, this.distAt(Math.max(0, Math.min(this.W - 1, x)), Math.max(0, Math.min(this.H - 1, y))) + o); } return Math.min(8, this.dist[y * this.W + x]); }
  /** The sea field (0 land .. 1 water) at one world pixel: used to keep trees and stones out of the water. */
  waterAt(wx, wy) {
    const [dx, dy] = warp(this.N, wx, wy); const u = wx / TP - 0.5 + dx, v = wy / TP - 0.5 + dy; const i = Math.floor(u), j = Math.floor(v);
    const fx = u - i, fy = v - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const wv = (x, y) => { const c = this.codeAt(x, y); return c === SEA || c === RIVER ? 1 : 0; };
    return (wv(i, j) * (1 - sx) + wv(i + 1, j) * sx) * (1 - sy) + (wv(i, j + 1) * (1 - sx) + wv(i + 1, j + 1) * sx) * sy;
  }

  // ---- every field for one chunk, at mask resolution (half the chunk's pixels on the close-up level) ----------------------------------
  fields(x0, y0, s) {
    const { m } = this.scr(s); const step = CS / m; const N = this.N;
    const M = CH + 6, ox = x0 - 3, oy = y0 - 3; const lc = new Uint8Array(M * M), ld = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { lc[j * M + i] = this.codeAt(ox + i, oy + j); ld[j * M + i] = this.distAt(ox + i, oy + j); }
    const mm = m * m; const F = { m, woods: new Uint8ClampedArray(mm), hills: new Uint8ClampedArray(mm), mtn: new Uint8ClampedArray(mm), sand: new Uint8ClampedArray(mm), water: new Uint8ClampedArray(mm), over: new Uint8ClampedArray(mm * 4) };
    const wt = new Float32Array(6);
    for (let py = 0; py < m; py++) {
      const wy = y0 * TP + (py + 0.5) * step;
      for (let px = 0; px < m; px++) {
        const wx = x0 * TP + (px + 0.5) * step;
        const [dx, dy] = warp(N, wx, wy);
        const u = wx / TP - 0.5 + dx - ox, v = wy / TP - 0.5 + dy - oy;
        let i = Math.floor(u), j = Math.floor(v); const fx = u - i, fy = v - j; i = i < 0 ? 0 : i > M - 2 ? M - 2 : i; j = j < 0 ? 0 : j > M - 2 ? M - 2 : j;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const b = j * M + i; const w00 = (1 - sx) * (1 - sy), w10 = sx * (1 - sy), w01 = (1 - sx) * sy, w11 = sx * sy;
        wt.fill(0); wt[lc[b]] += w00; wt[lc[b + 1]] += w10; wt[lc[b + M]] += w01; wt[lc[b + M + 1]] += w11;
        const w = wt[SEA] + wt[RIVER], ws = wt[SEA] + wt[RIVER] * 0.5; const q = py * m + px;
        const water = sstep(0.46, 0.54, w); const mount = sstep(0.4, 0.6, wt[MOUNT]);
        F.water[q] = water * 255;
        F.woods[q] = sstep(0.42, 0.58, wt[WOODS]) * (1 - water) * 255;
        F.hills[q] = sstep(0.38, 0.62, wt[HILLS]) * (1 - water) * 255;
        F.mtn[q] = mount * (1 - water) * 255;
        const bw = nzAt(N, wx * 0.5 + 41, wy * 0.5 + 13, 1);      // beaches widen and narrow along the coast
        F.sand[q] = sstep(0.03 + 0.07 * bw, 0.24 + 0.06 * bw, ws) * (1 - water) * (1 - mount * 0.85) * 255;
        // the overlay: wet sand, shallows, deep water, surf, and broad light and dark patches so no texture reads as wallpaper
        let R = 0, G = 0, B = 0, A = 0;
        const over = (r, g, bl, a) => { if (a <= 0.003) return; const na = a + A * (1 - a); R = (r * a + R * A * (1 - a)) / na; G = (g * a + G * A * (1 - a)) / na; B = (bl * a + B * A * (1 - a)) / na; A = na; };
        const vn = nzAt(N, wx * 0.11 + 300, wy * 0.11 + 500, 0) * 1.6;
        if (water < 1) { const land = 1 - water; if (vn > 0) over(236, 226, 150, 0.075 * vn * land); else over(24, 44, 14, 0.09 * -vn * land); }
        if (w > 0.2 && water < 1) over(92, 74, 44, 0.3 * sstep(0.32, 0.47, ws) * (1 - water));
        if (water > 0) {
          const D = ld[b] * w00 + ld[b + 1] * w10 + ld[b + M] * w01 + ld[b + M + 1] * w11; const deep = sstep(1.0, 4.5, D);
          if (vn > 0) over(140, 200, 226, 0.09 * vn * water); else over(6, 26, 50, 0.13 * -vn * water);
          over(8, 32, 60, 0.4 * deep * water);
          over(150, 214, 204, 0.5 * water * (1 - sstep(0.54, 0.9, w)) * (1 - deep));
          const f1 = Math.exp(-(((w - 0.535) / 0.022) ** 2)), f2 = Math.exp(-(((w - 0.63) / 0.02) ** 2)) * clamp01(0.5 + nzAt(N, wx * 0.7, wy * 0.7, 1) * 2);
          over(250, 252, 244, 0.6 * f1 + 0.28 * f2 * (1 - deep));
        }
        const o = q * 4; F.over[o] = R; F.over[o + 1] = G; F.over[o + 2] = B; F.over[o + 3] = A * 255;
      }
    }
    return F;
  }
  /** Fill one kind of ground through its field mask, in world coordinates so the texture lines up across chunks. */
  maskLayer(ctx, arr, x0, y0, texName, alpha = 1) {
    let any = false; for (let i = 0; i < arr.length; i += 7) if (arr[i]) { any = true; break; } if (!any) return;
    const s = this.sc, { lay, small, n, m } = this.scr(s);
    const sx = small.getContext('2d'); const id = sx.createImageData(m, m); for (let i = 0; i < arr.length; i++) id.data[i * 4 + 3] = arr[i]; sx.putImageData(id, 0, 0);
    const l = lay.getContext('2d'); l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over'; l.clearRect(0, 0, n, n);
    l.setTransform(s, 0, 0, s, -x0 * TP * s, -y0 * TP * s); l.fillStyle = this.pattern(l, texName); l.fillRect(x0 * TP, y0 * TP, CS, CS);
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-in'; l.imageSmoothingEnabled = true; l.imageSmoothingQuality = 'high'; l.drawImage(small, 0, 0, m, m, 0, 0, n, n); l.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(lay, 0, 0); ctx.restore();
  }
  overlay(ctx, rgba) {
    const { small, n, m } = this.scr(this.sc); const sx = small.getContext('2d'); const id = sx.createImageData(m, m); id.data.set(rgba); sx.putImageData(id, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(small, 0, 0, m, m, 0, 0, n, n); ctx.restore();
  }

  // soft blobs of one kind of ground (used only for the cleared ground around cities, which is meant to look round)
  layer(ctx, x0, y0, pred, texName, { radius = 0.95, blobs = 3, spread = 0.22, seed = 1, flat = null, alpha = 1 } = {}) {
    const s = this.sc, { mask, lay, n } = this.scr(s);
    const m = mask.getContext('2d'); m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, n, n);
    m.setTransform(s, 0, 0, s, -x0 * TP * s, -y0 * TP * s);
    let any = false;
    for (let y = y0 - 2; y < y0 + CH + 2; y++) for (let x = x0 - 2; x < x0 + CH + 2; x++) {
      const tl = this.t(x, y); if (!tl || !pred(tl, x, y)) continue; any = true;
      for (let k = 0; k < blobs; k++) {
        const cx = (x + 0.5 + (hash(x, y, seed + k * 3) - 0.5) * spread * 2) * TP, cy = (y + 0.5 + (hash(x, y, seed + k * 3 + 1) - 0.5) * spread * 2) * TP;
        const r = TP * radius * (0.82 + hash(x, y, seed + k * 3 + 2) * 0.36);
        const gr = m.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.62, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        m.fillStyle = gr; m.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    if (!any) return;
    const l = lay.getContext('2d'); l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over'; l.clearRect(0, 0, n, n);
    l.setTransform(s, 0, 0, s, -x0 * TP * s, -y0 * TP * s);
    l.fillStyle = flat ?? this.pattern(l, texName); l.fillRect(x0 * TP, y0 * TP, CS, CS);
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-in'; l.drawImage(mask, 0, 0); l.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(lay, 0, 0); ctx.restore();
  }

  paint(cx, cy, lv = 1) {
    const s = lv === 1 ? 1 : 0.34; this.sc = s;
    const x0 = cx * CH, y0 = cy * CH; const cv = makeCanvas(Math.round(CS * s), Math.round(CS * s)); const ctx = cv.getContext('2d');
    // world pixel coordinates from here on
    const T0 = [s, 0, 0, s, -x0 * TP * s, -y0 * TP * s]; ctx.setTransform(...T0);
    ctx.fillStyle = this.pattern(ctx, 'grass'); ctx.fillRect(x0 * TP - TP, y0 * TP - TP, CS + 2 * TP, CS + 2 * TP);    // past the edges, so no sliver of background shows between chunks
    const F = this.fields(x0, y0, s);
    this.maskLayer(ctx, F.hills, x0, y0, 'hills');
    this.maskLayer(ctx, F.mtn, x0, y0, 'rock');
    this.maskLayer(ctx, F.woods, x0, y0, 'woods');
    ctx.setTransform(...T0);
    this.layer(ctx, x0, y0, (t) => !!t.cityId, 'grass', { radius: 1.15, blobs: 2, seed: 43, spread: 0.1 });
    this.layer(ctx, x0, y0, (t) => !!t.cityId, 'dirt', { radius: 0.62, blobs: 2, seed: 44, spread: 0.08, alpha: 0.85 });
    this.layer(ctx, x0, y0, (t) => !!t.site, 'dirt', { radius: 0.5, blobs: 2, seed: 45, spread: 0.08, alpha: 0.55 });      // a trodden patch under ruins and temples
    this.maskLayer(ctx, F.sand, x0, y0, 'sand');
    this.maskLayer(ctx, F.water, x0, y0, 'water');
    this.overlay(ctx, F.over);
    ctx.setTransform(...T0);
    this.roads(ctx, x0, y0);
    this.sprites(ctx, x0, y0);
    return cv;
  }

  // ---- roads ---------------------------------------------------------------------------------------------------------------------------
  /** Road lines, made once. New games keep the generator's routes (g.map.roads): drawn as smooth curves through their squares. Older saves
   *  rebuild lines from the road squares, without the little triangles the old drawing made where a road turned a corner. */
  buildRoads() {
    const { W, H } = this; const lines = []; this.bridgeDir = new Map();
    const isRoad = (x, y) => { const t = this.t(x, y); return !!(t && !t.outside && (t.road || t.cityId) && (t.terrain !== 'water' || t.bridge)); };
    const routes = this.g.map?.roads;
    if (Array.isArray(routes) && routes.length) {
      for (const r of routes) {
        const cells = r.filter((i) => i >= 0 && i < W * H); if (cells.length < 2) continue;
        let pts = cells.map((i) => [(i % W + 0.5) * TP, (((i / W) | 0) + 0.5) * TP]);
        for (let it = 0; it < 2; it++) { const o = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [pts[k], pts[k + 1]]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; }   // Chaikin: corners become curves
        lines.push(pts);
        cells.forEach((i, k) => { const t = this.t(i % W, (i / W) | 0); if (!t.bridge) return; const a = cells[Math.max(0, k - 1)], b = cells[Math.min(cells.length - 1, k + 1)]; this.bridgeDir.set(i, Math.atan2(((b / W) | 0) - ((a / W) | 0), (b % W) - (a % W))); });
      }
    } else {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!isRoad(x, y)) continue; const t = this.t(x, y);
        const nb = D8.filter(([dx, dy]) => { if (!isRoad(x + dx, y + dy)) return false; const u = this.t(x + dx, y + dy); if (t.cityId && u.cityId) return false; if (!(t.road || u.road)) return false;
          if (dx && dy && (isRoad(x + dx, y) || isRoad(x, y + dy))) return false;      // a diagonal step next to a corner square is the corner: no shortcut, no triangle
          return true; });
        const c = [(x + 0.5) * TP, (y + 0.5) * TP]; const mid = ([dx, dy]) => [c[0] + dx * TP / 2, c[1] + dy * TP / 2];
        if (nb.length === 2) lines.push([mid(nb[0]), c, mid(nb[1])]); else for (const d of nb) lines.push([c, mid(d)]);
        if (t.bridge) { const h = nb.some(([dx, dy]) => dy === 0); const v = nb.some(([dx, dy]) => dx === 0); this.bridgeDir.set(y * W + x, h && !v ? 0 : !h && v ? Math.PI / 2 : nb.length ? Math.atan2(nb[0][1], nb[0][0]) : 0); }
      }
    }
    this.roadLines = lines.map((pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { pts, bb: [x0, y0, x1, y1] }; });
  }
  roads(ctx, x0, y0) {
    const L = x0 * TP - TP, T = y0 * TP - TP, R = (x0 + CH) * TP + TP, B = (y0 + CH) * TP + TP;
    const p = new Path2D(); let any = false;
    for (const { pts, bb } of this.roadLines) {
      if (bb[2] < L || bb[0] > R || bb[3] < T || bb[1] > B) continue; any = true;
      p.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 3) p.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
      else for (let k = 1; k < pts.length; k++) p.lineTo(pts[k][0], pts[k][1]);
    }
    if (any) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(54,36,16,0.42)'; ctx.lineWidth = TP * 0.34; ctx.stroke(p);
      ctx.strokeStyle = this.pattern(ctx, 'road'); ctx.lineWidth = TP * 0.25; ctx.stroke(p);
      ctx.strokeStyle = 'rgba(255,236,190,0.16)'; ctx.lineWidth = TP * 0.07; ctx.stroke(p);
    }
    // bridge decks, turned along the road
    for (let y = y0 - 1; y <= y0 + CH; y++) for (let x = x0 - 1; x <= x0 + CH; x++) {
      const t = this.t(x, y); if (!t || t.outside || !t.bridge) continue;
      const ang = this.bridgeDir.get(y * this.W + x) ?? 0; const diag = Math.abs(Math.sin(2 * ang)) > 0.5;
      const px = (x + 0.5) * TP, py = (y + 0.5) * TP, Ln = TP * (diag ? 1.5 : 1.08), Wd = TP * 0.46;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-Ln / 2 + 2, -Wd / 2 + 4, Ln, Wd);
      ctx.fillStyle = '#7b5a36'; ctx.fillRect(-Ln / 2, -Wd / 2, Ln, Wd);
      ctx.strokeStyle = 'rgba(40,24,10,0.55)'; ctx.lineWidth = 1.2;
      for (let k = -Ln / 2 + 5; k < Ln / 2; k += 6) { ctx.beginPath(); ctx.moveTo(k, -Wd / 2); ctx.lineTo(k, Wd / 2); ctx.stroke(); }
      ctx.fillStyle = '#5a3f22'; ctx.fillRect(-Ln / 2, -Wd / 2 - 2, Ln, 4); ctx.fillRect(-Ln / 2, Wd / 2 - 2, Ln, 4);
      ctx.restore();
    }
  }

  // ---- trees, mountains, hills and stones ------------------------------------------------------------------------------------------------
  sprites(ctx, x0, y0) {
    const list = [];
    const push = (img, px, py, h, flip, shadow = 0.5) => { if (img && this.waterAt(px, py) < 0.34 && this.waterAt(px, py - h * 0.25) < 0.42) list.push({ img, px, py, h, flip, shadow }); };   // never in the water
    const S = this.a.spr;
    for (let y = y0 - 2; y < y0 + CH + 3; y++) for (let x = x0 - 2; x < x0 + CH + 3; x++) {
      const t = this.t(x, y); if (!t || t.terrain === 'water') continue;
      const cx = (x + 0.5) * TP, cy = (y + 0.5) * TP;
      const occupied = t.cityId || t.site || t.road || t.port;
      const nearCity = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => { const n = this.t(x + dx, y + dy); return n && (n.cityId || n.site); });
      if (t.terrain === 'woods') {
        const mix = hash(Math.floor(x / 3), Math.floor(y / 3), 5) < 0.58;
        for (let k = 0; k < 4; k++) {
          const sx = (k % 2 ? 0.26 : -0.26) + (hash(x, y, 100 + k) - 0.5) * 0.32, sy = (k < 2 ? -0.2 : 0.22) + (hash(x, y, 110 + k) - 0.5) * 0.3;
          if (t.road && Math.abs(sx) < 0.12 && Math.abs(sy) < 0.2) continue;
          if (nearCity && (t.cityId || t.site || hash(x, y, 125 + k) < 0.7)) continue;
          const broad = hash(x, y, 120 + k) < (mix ? 0.8 : 0.18);
          const pick = (arr) => arr[Math.floor(hash(x, y, 130 + k) * arr.length)];
          push(broad ? S['broad_' + pick(BROAD)] : S['conif_' + pick(CONIF)], cx + sx * TP, cy + sy * TP + 0.16 * TP, TP * (1.35 + hash(x, y, 140 + k) * 0.42), hash(x, y, 150 + k) < 0.5);
        }
      } else if (t.terrain === 'hills') {
        if (!t.cityId && !t.site) {                      // one or two rolling mounds per hill square, so hills read as hills at a glance
          const nm = hash(x, y, 165) < 0.45 ? 2 : 1;
          for (let k = 0; k < nm; k++) {
            const ox = (nm === 2 ? (k ? 0.24 : -0.24) : 0) + (hash(x, y, 166 + k) - 0.5) * 0.5, oy = (nm === 2 ? (k ? 0.12 : -0.14) : 0) + (hash(x, y, 172 + k) - 0.5) * 0.4;
            const mx = cx + ox * TP, my = cy + oy * TP + 0.22 * TP; if (this.waterAt(mx, my) > 0.3) continue;
            list.push({ mound: true, px: mx, py: my, r: TP * (nm === 2 ? 0.5 : 0.66) * (0.8 + hash(x, y, 168 + k) * 0.4), hgt: 0.34 + hash(x, y, 170 + k) * 0.22, tilt: (hash(x, y, 174 + k) - 0.5) * 0.5 });
          }
        }
        if (!occupied && hash(x, y, 160) < 0.4) push(S['hd_' + HILLDEC[Math.floor(hash(x, y, 161) * HILLDEC.length)]], cx + (hash(x, y, 162) - 0.5) * 0.5 * TP, cy + 0.36 * TP, TP * (0.4 + hash(x, y, 163) * 0.2), hash(x, y, 164) < 0.5, 0.3);
      } else if (t.terrain === 'mountain') {
        push(S['mtn_' + MTN[Math.floor(hash(x, y, 170) * MTN.length)]], cx + (hash(x, y, 171) - 0.5) * 0.18 * TP, cy + 0.46 * TP, TP * (2.0 + hash(x, y, 172) * 0.35), hash(x, y, 173) < 0.5, 0.5);
        if (hash(x, y, 174) < 0.5) push(S['rock_' + ROCKS[Math.floor(hash(x, y, 175) * ROCKS.length)]], cx + (hash(x, y, 176) - 0.5) * 0.9 * TP, cy + 0.5 * TP, TP * 0.38, hash(x, y, 177) < 0.5, 0.3);
      } else if (!occupied) {
        const r = hash(x, y, 180);
        if (r < 0.06) push(S['broad_' + BROAD[Math.floor(hash(x, y, 181) * BROAD.length)]], cx + (hash(x, y, 182) - 0.5) * 0.6 * TP, cy + 0.3 * TP, TP * (1.1 + hash(x, y, 183) * 0.4), hash(x, y, 184) < 0.5);
        else if (r < 0.085) push(S['conif_' + CONIF[Math.floor(hash(x, y, 185) * CONIF.length)]], cx + (hash(x, y, 186) - 0.5) * 0.6 * TP, cy + 0.3 * TP, TP * (1.2 + hash(x, y, 187) * 0.4), hash(x, y, 188) < 0.5);
        else if (r < 0.11) push(S['rock_' + ROCKS[Math.floor(hash(x, y, 189) * ROCKS.length)]], cx + (hash(x, y, 190) - 0.5) * 0.6 * TP, cy + 0.3 * TP, TP * 0.34, hash(x, y, 191) < 0.5, 0.3);
        else if (r < 0.135) push(S['hd_' + (hash(x, y, 192) < 0.8 ? 'gorse' : 'heather')], cx + (hash(x, y, 193) - 0.5) * 0.7 * TP, cy + 0.3 * TP, TP * 0.4, hash(x, y, 194) < 0.5, 0.2);
      }
    }
    list.sort((a, b) => a.py - b.py);
    for (const s of list) {
      if (s.mound) { this.mound(ctx, s); continue; }
      const sc = s.h / s.img.height; const w = s.img.width * sc;
      if (s.shadow) { ctx.fillStyle = `rgba(14,24,8,${0.26 * s.shadow * 2})`; ctx.beginPath(); ctx.ellipse(s.px + w * 0.06, s.py - 1, w * 0.36, s.h * 0.075, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.save(); ctx.translate(s.px, s.py); if (s.flip) ctx.scale(-1, 1); ctx.drawImage(s.img, -w / 2, -s.h, w, s.h); ctx.restore();
    }
  }
  /** A rolling hill: a grassy dome lit from the upper left, shaded on the lower right, with a soft shadow at its foot. */
  mound(ctx, { px, py, r, hgt, tilt = 0 }) {
    const h = r * hgt * 1.1, pk = tilt * r;      // the crest leans a little left or right
    const dome = () => { ctx.beginPath(); ctx.moveTo(px - r, py); ctx.bezierCurveTo(px - r * 0.7, py - h * 0.6, px - r * 0.35 + pk, py - h * 1.25, px + pk, py - h * 1.22); ctx.bezierCurveTo(px + r * 0.4 + pk, py - h * 1.2, px + r * 0.72, py - h * 0.55, px + r, py); ctx.quadraticCurveTo(px, py + h * 0.22, px - r, py); ctx.closePath(); };
    ctx.save();
    ctx.fillStyle = 'rgba(20,30,8,0.22)'; ctx.beginPath(); ctx.ellipse(px + r * 0.14, py + h * 0.06, r * 1.02, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    dome(); ctx.fillStyle = this.pattern(ctx, 'hills'); ctx.fill();
    let gr = ctx.createLinearGradient(px - r * 0.6, py - h * 1.2, px + r * 0.7, py + h * 0.1);
    gr.addColorStop(0, 'rgba(255,240,160,0.34)'); gr.addColorStop(0.42, 'rgba(255,240,160,0.04)'); gr.addColorStop(0.6, 'rgba(30,44,10,0.08)'); gr.addColorStop(1, 'rgba(30,44,10,0.42)');
    dome(); ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(52,62,22,0.22)'; ctx.lineWidth = Math.max(1, r * 0.035); dome(); ctx.stroke();
    ctx.restore();
  }
}
