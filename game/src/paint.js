// Paints the land and sea of a game into cached chunks (canvases). Everything is drawn in world pixels (TP pixels per square) so that
// textures line up from one chunk to the next, and sprites are placed from a hash of their square so every chunk agrees about them.
import { tileAt } from '../../engine/src/index.js';

export const TP = 48;                       // pixels per square in the painted layer
export const CH = 12;                       // squares per chunk side
const CS = CH * TP;

const hash = (x, y, k = 0) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k + 1, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
export const rnd = hash;

const BROAD = ['dark', 'wide', 'ivy', 'pale', 'dark', 'wide', 'gnarled', 'elder', 'coppice', 'pollard', 'twin', 'poplar'];
const CONIF = ['dark', 'blue', 'cedar', 'pair', 'redwood', 'umbrella', 'dark', 'cedar', 'yellow', 'leaning'];
const MTN = ['brown4', 'forest5', 'scree6', 'snow1', 'snow2', 'brown4', 'snow1'];
const HILLDEC = ['cairn', 'fernrock', 'gorse', 'heather', 'ledge', 'lichen', 'mossrock', 'stones'];
const ROCKS = ['r1', 'r2', 'r3', 'pile', 'grassrock'];
const D8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const OUT = { terrain: 'water', outside: true };
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export class Painter {
  constructor(g, assets) {
    this.g = g; this.a = assets; this.chunks = new Map(); this.W = g.width; this.H = g.height;
    this.cw = Math.ceil(g.width / CH); this.ch = Math.ceil(g.height / CH);
    this.scratch = new Map(); this.sc = 1; this.maxChunks = this.cw * this.ch + 150;   // every overview chunk of the map fits, plus 150 close-up ones
  }
  t(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? OUT : tileAt(this.g, x, y); }
  isWater(x, y) { const t = this.t(x, y); return !t || (t.terrain === 'water' && !t.bridge); }
  has(cx, cy, lv = 1) { return this.chunks.has(cx + ',' + cy + ',' + lv); }
  scr(s) { let k = this.scratch.get(s); if (!k) { const n = Math.round(CS * s); k = { mask: makeCanvas(n, n), lay: makeCanvas(n, n), n }; this.scratch.set(s, k); } return k; }
  get(cx, cy, lv = 1) {
    const k = cx + ',' + cy + ',' + lv; let c = this.chunks.get(k);
    if (c) { this.chunks.delete(k); this.chunks.set(k, c); return c; }          // keep the most recently used at the back
    c = this.paint(cx, cy, lv); this.chunks.set(k, c);
    while (this.chunks.size > (this.maxChunks ?? 150)) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }

  pattern(ctx, name) { return ctx.createPattern(this.a.tex[name], 'repeat'); }

  // soft blobs of one kind of ground, drawn as a mask and filled with that ground's texture (or a flat colour)
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
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'destination-in'; l.drawImage(mask, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(lay, 0, 0); ctx.restore();
  }

  paint(cx, cy, lv = 1) {
    const s = lv === 1 ? 1 : 0.34; this.sc = s;
    const x0 = cx * CH, y0 = cy * CH; const cv = makeCanvas(Math.round(CS * s), Math.round(CS * s)); const ctx = cv.getContext('2d');
    // world pixel coordinates from here on
    const T0 = [s, 0, 0, s, -x0 * TP * s, -y0 * TP * s]; ctx.setTransform(...T0);
    ctx.fillStyle = this.pattern(ctx, 'grass'); ctx.fillRect(x0 * TP, y0 * TP, CS, CS);
    const land = (t) => t.terrain !== 'water' || t.bridge;
    const nearWater = (x, y) => D8.some(([dx, dy]) => { const n = this.t(x + dx, y + dy); return n && n.terrain === 'water' && !n.bridge; });
    this.layer(ctx, x0, y0, (t, x, y) => land(t) && t.terrain !== 'water' && nearWater(x, y), 'sand', { radius: 0.8, blobs: 2, seed: 11 });
    this.layer(ctx, x0, y0, (t) => t.terrain === 'hills', 'hills', { radius: 1.0, seed: 21 });
    this.layer(ctx, x0, y0, (t) => t.terrain === 'mountain', 'rock', { radius: 0.95, seed: 31 });
    this.layer(ctx, x0, y0, (t) => t.terrain === 'woods' && !t.cityId && !t.site, 'woods', { radius: 1.0, seed: 41 });
    this.layer(ctx, x0, y0, (t) => !!t.cityId, 'grass', { radius: 1.15, blobs: 2, seed: 43, spread: 0.1 });
    this.layer(ctx, x0, y0, (t) => !!t.cityId, 'dirt', { radius: 0.62, blobs: 2, seed: 44, spread: 0.08, alpha: 0.85 });
    // water: a pale shallow rim first, then the deep colour
    this.layer(ctx, x0, y0, (t) => t.terrain === 'water' && !t.bridge && !t.river, null, { radius: 1.18, blobs: 2, seed: 51, flat: 'rgb(142,206,206)', alpha: 0.7 });
    this.layer(ctx, x0, y0, (t) => t.terrain === 'water' && !t.bridge && t.river, null, { radius: 0.92, blobs: 2, seed: 52, flat: 'rgb(132,200,204)', alpha: 0.7, spread: 0.12 });
    this.layer(ctx, x0, y0, (t) => t.terrain === 'water' && !t.bridge && !t.river, 'water', { radius: 1.0, blobs: 3, seed: 61 });
    this.layer(ctx, x0, y0, (t) => t.terrain === 'water' && !t.bridge && t.river, 'water', { radius: 0.66, blobs: 2, seed: 62, spread: 0.1 });
    ctx.setTransform(...T0);
    this.roads(ctx, x0, y0);
    this.sprites(ctx, x0, y0);
    return cv;
  }

  roads(ctx, x0, y0) {
    const isRoad = (t) => t && (t.road || t.cityId) && (t.terrain !== 'water' || t.bridge);
    const segs = [];
    for (let y = y0 - 1; y <= y0 + CH; y++) for (let x = x0 - 1; x <= x0 + CH; x++) {
      const a = this.t(x, y); if (!isRoad(a)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const b = this.t(x + dx, y + dy); if (!isRoad(b)) continue;
        if (a.cityId && b.cityId) continue;
        if (!(a.road || b.road)) continue;
        if (dx && dy) { const o1 = this.t(x + dx, y), o2 = this.t(x, y + dy); if (isRoad(o1) && isRoad(o2) && (o1.road || o2.road)) continue; }
        segs.push([x, y, x + dx, y + dy, !!(a.bridge || b.bridge)]);
      }
    }
    if (!segs.length) return;
    const wobble = (x, y, k) => (hash(x, y, k) - 0.5) * 0.22 * TP;
    const path = (s) => {
      const [x, y, nx, ny] = s; const ax = (x + 0.5) * TP, ay = (y + 0.5) * TP, bx = (nx + 0.5) * TP, by = (ny + 0.5) * TP;
      const mx = (ax + bx) / 2 + wobble(x, y, 71 + nx), my = (ay + by) / 2 + wobble(nx, ny, 72 + y);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(54,36,16,0.42)'; ctx.lineWidth = TP * 0.34; for (const s of segs) if (!s[4]) { path(s); ctx.stroke(); }
    ctx.strokeStyle = this.pattern(ctx, 'road'); ctx.lineWidth = TP * 0.25; for (const s of segs) if (!s[4]) { path(s); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,236,190,0.16)'; ctx.lineWidth = TP * 0.07; for (const s of segs) if (!s[4]) { path(s); ctx.stroke(); }
    // bridge decks
    for (let y = y0 - 1; y <= y0 + CH; y++) for (let x = x0 - 1; x <= x0 + CH; x++) {
      const t = this.t(x, y); if (!t || !t.bridge) continue;
      const horiz = ['-1,0', '1,0'].some((k) => { const [dx, dy] = k.split(',').map(Number); const n = this.t(x + dx, y + dy); return n && (n.road || n.bridge) && n.terrain !== 'water' || (n && n.bridge); });
      const vert = [[0, -1], [0, 1]].some(([dx, dy]) => { const n = this.t(x + dx, y + dy); return n && (n.road || n.bridge); });
      const h = horiz && !vert;
      const px = (x + 0.5) * TP, py = (y + 0.5) * TP, L = TP * 1.04, Wd = TP * 0.46;
      ctx.save(); ctx.translate(px, py); if (!h) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-L / 2 + 2, -Wd / 2 + 4, L, Wd);
      ctx.fillStyle = '#7b5a36'; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      ctx.strokeStyle = 'rgba(40,24,10,0.55)'; ctx.lineWidth = 1.2;
      for (let k = -L / 2 + 5; k < L / 2; k += 6) { ctx.beginPath(); ctx.moveTo(k, -Wd / 2); ctx.lineTo(k, Wd / 2); ctx.stroke(); }
      ctx.fillStyle = '#5a3f22'; ctx.fillRect(-L / 2, -Wd / 2 - 2, L, 4); ctx.fillRect(-L / 2, Wd / 2 - 2, L, 4);
      ctx.restore();
    }
  }

  sprites(ctx, x0, y0) {
    const list = [];
    const push = (img, px, py, h, flip, shadow = 0.5) => { if (img) list.push({ img, px, py, h, flip, shadow }); };
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
        list.push({ hill: true, px: cx, py: cy, h: 0 });
        if (!occupied && hash(x, y, 160) < 0.55) push(S['hd_' + HILLDEC[Math.floor(hash(x, y, 161) * HILLDEC.length)]], cx + (hash(x, y, 162) - 0.5) * 0.5 * TP, cy + 0.28 * TP, TP * (0.46 + hash(x, y, 163) * 0.25), hash(x, y, 164) < 0.5, 0.3);
      } else if (t.terrain === 'mountain') {
        push(S['mtn_' + MTN[Math.floor(hash(x, y, 170) * MTN.length)]], cx + (hash(x, y, 171) - 0.5) * 0.18 * TP, cy + 0.46 * TP, TP * (2.0 + hash(x, y, 172) * 0.35), hash(x, y, 173) < 0.5, 0.5);
        if (hash(x, y, 174) < 0.5) push(S['rock_' + ROCKS[Math.floor(hash(x, y, 175) * ROCKS.length)]], cx + (hash(x, y, 176) - 0.5) * 0.9 * TP, cy + 0.5 * TP, TP * 0.38, hash(x, y, 177) < 0.5, 0.3);
      } else if (!occupied) {
        const r = hash(x, y, 180);
        if (r < 0.06) push(S['broad_' + BROAD[Math.floor(hash(x, y, 181) * BROAD.length)]], cx + (hash(x, y, 182) - 0.5) * 0.6 * TP, cy + 0.3 * TP, TP * (1.1 + hash(x, y, 183) * 0.4), hash(x, y, 184) < 0.5);
        else if (r < 0.085) push(S['conif_' + CONIF[Math.floor(hash(x, y, 185) * CONIF.length)]], cx + (hash(x, y, 186) - 0.5) * 0.6 * TP, cy + 0.3 * TP, TP * (1.2 + hash(x, y, 187) * 0.4), hash(x, y, 188) < 0.5);
        else if (r < 0.115) push(S['rock_' + ROCKS[Math.floor(hash(x, y, 189) * ROCKS.length)]], cx + (hash(x, y, 190) - 0.5) * 0.6 * TP, cy + 0.3 * TP, TP * 0.34, hash(x, y, 191) < 0.5, 0.3);
        else if (r < 0.16) push(S['hd_' + (hash(x, y, 192) < 0.5 ? 'gorse' : 'heather')], cx + (hash(x, y, 193) - 0.5) * 0.7 * TP, cy + 0.3 * TP, TP * 0.4, hash(x, y, 194) < 0.5, 0.2);
      }
    }
    list.sort((a, b) => a.py - b.py);
    for (const s of list) {
      if (s.hill) {   // soft relief: a lit shoulder and a shadow
        let gr = ctx.createRadialGradient(s.px - 0.1 * TP, s.py - 0.14 * TP, 0, s.px - 0.1 * TP, s.py - 0.14 * TP, TP * 0.72);
        gr.addColorStop(0, 'rgba(255,252,190,0.26)'); gr.addColorStop(1, 'rgba(255,252,190,0)'); ctx.fillStyle = gr; ctx.fillRect(s.px - TP, s.py - TP, TP * 2, TP * 2);
        gr = ctx.createRadialGradient(s.px + 0.14 * TP, s.py + 0.3 * TP, 0, s.px + 0.14 * TP, s.py + 0.3 * TP, TP * 0.7);
        gr.addColorStop(0, 'rgba(28,40,10,0.30)'); gr.addColorStop(1, 'rgba(28,40,10,0)'); ctx.fillStyle = gr; ctx.fillRect(s.px - TP, s.py - TP, TP * 2, TP * 2);
        continue;
      }
      const sc = s.h / s.img.height; const w = s.img.width * sc;
      if (s.shadow) { ctx.fillStyle = `rgba(14,24,8,${0.26 * s.shadow * 2})`; ctx.beginPath(); ctx.ellipse(s.px + w * 0.06, s.py - 1, w * 0.36, s.h * 0.075, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.save(); ctx.translate(s.px, s.py); if (s.flip) ctx.scale(-1, 1); ctx.drawImage(s.img, -w / 2, -s.h, w, s.h); ctx.restore();
    }
  }
}
