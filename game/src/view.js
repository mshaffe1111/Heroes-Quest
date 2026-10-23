// The map view: camera, drawing of everything that is not baked into the ground (cities, sites, armies, route, fog) and mouse/touch handling.
import * as E from '../../engine/src/index.js';
import { Painter, TP, CH, rnd } from './paint.js';

const TEX = ['grass', 'woods', 'hills', 'sand', 'rock', 'dirt', 'water', 'road'];
const SPR = [...['apple', 'blossom', 'coppice', 'dark', 'elder', 'gnarled', 'ivy', 'pale', 'pollard', 'poplar', 'twin', 'wide'].map((n) => 'broad_' + n),
  ...['autumnfir', 'blue', 'cedar', 'dark', 'ghostpair', 'leaning', 'pair', 'pinegnarl', 'redwood', 'shrub', 'umbrella', 'yellow'].map((n) => 'conif_' + n),
  ...['brown4', 'forest5', 'scree6', 'snow1', 'snow2', 'spire3'].map((n) => 'mtn_' + n),
  ...['cairn', 'fernrock', 'gorse', 'heather', 'ledge', 'lichen', 'menhir', 'mossrock', 'scrubtree', 'stones'].map((n) => 'hd_' + n),
  ...['r1', 'r2', 'r3', 'pile', 'grassrock', 'slab5'].map((n) => 'rock_' + n)];
const SITE = ['temple', 'mage_tower', 'jetty', 'razed_castle', 'bones', 'ruin_arch', 'ruin_columns', 'ruin_keep', 'ruin_statue', 'harbor', 'trove', 'shrine', 'standard', 'library'];
const MEDALS = ['arch', 'bat', 'cat', 'demon', 'devil', 'drag', 'dwarf', 'ele', 'elem', 'elf', 'flag', 'giant', 'grif', 'hcav', 'hero', 'hinf', 'lcav', 'linf', 'mino', 'navy', 'orc', 'peg', 'pike', 'scout', 'spid', 'undead', 'uni', 'wiz', 'wolf', 'wyrm'];
const CASTLES = Object.values(E.PALETTE).length ? Object.keys(E.PALETTE) : [];

function img(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
export async function loadAssets(base = 'play/assets/', progress = () => {}) {
  const a = { tex: {}, spr: {}, site: {}, medal: {}, castle: {}, fog: null };
  const jobs = [];
  for (const n of TEX) jobs.push(img(`${base}tex_${n}.webp`).then((i) => { a.tex[n] = i; }));
  for (const n of SPR) jobs.push(img(`${base}spr/${n}.webp`).then((i) => { a.spr[n] = i; }));
  for (const n of SITE) jobs.push(img(`${base}site/${n}.webp`).then((i) => { a.site[n] = i; }));
  for (const n of MEDALS) jobs.push(img(`${base}medal/${n}.webp`).then((i) => { a.medal[n] = i; }));
  for (const n of CASTLES) jobs.push(img(`${base}castle/${n}.webp`).then((i) => { a.castle[n] = i; }));
  jobs.push(img(`${base}fog_alpha.png`).then((i) => { a.fog = i; }));
  let done = 0; jobs.forEach((j) => j.then(() => progress(++done / jobs.length)));
  await Promise.all(jobs); return a;
}

const MEDAL_CACHE = new Map();
export function tintedMedal(a, type, hex, size = 128) {
  const k = type + '|' + hex + '|' + size; let c = MEDAL_CACHE.get(k); if (c) return c;
  const src = a.medal[type] ?? a.medal.hero; c = document.createElement('canvas'); c.width = c.height = size;
  if (src) { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, size, size); if (hex) { const d = x.getImageData(0, 0, size, size); E.tintRing(d.data, size, hex); x.putImageData(d, 0, 0); } }
  MEDAL_CACHE.set(k, c); return c;
}
export const medalURL = (a, type, hex, size = 128) => { const c = tintedMedal(a, type, hex, size); return (c._url ??= c.toDataURL('image/png')); };
export const realmHex = (realm) => (realm && realm.color ? E.PALETTE[realm.color] : null);

export class MapView {
  constructor(canvas, g, assets, { me, onTile, onHover } = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.g = g; this.a = assets; this.me = me; this.onTile = onTile ?? (() => {}); this.onHover = onHover ?? (() => {});
    this.painter = new Painter(g, assets); this.cam = { x: 0, y: 0, z: 0.9 }; this.sel = null; this.path = null; this.hover = null; this.marks = [];
    this.ghosts = []; this.hide = null; this.cityOverride = null; this.fx = []; this.medalCache = new Map(); this.castleCache = new Map(); this.t0 = performance.now(); this.dirty = true; this.minimap = null; this.showGrid = false;
    this.fogCv = document.createElement('canvas'); this.fogCv.width = g.width; this.fogCv.height = g.height; this.fogStamp = '';
    this.bind(); this.resize();
    this.last = 0; const loop = (t) => { if (this.dead) return; if (this.dirty || ((this.sel || this.path) && t - this.last > 70)) { this.last = t; this.draw(); if (this.aimP) this.drawLoupe(); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    this.warm();
  }
  // paint every chunk over time so scrolling never stalls
  warm() {
    this.buildMinimap();
    const todo = []; for (let cy = 0; cy < this.painter.ch; cy++) for (let cx = 0; cx < this.painter.cw; cx++) todo.push([cx, cy]);
    const big = this.g.width * this.g.height > 110 * 72 * 1.4;
    const step = () => { const t0 = performance.now(); while (todo.length && performance.now() - t0 < 10) { const [cx, cy] = todo.shift(); const lv = big ? 0 : 1; if (!this.painter.has(cx, cy, lv)) { this.painter.get(cx, cy, lv); this.dirty = true; } } if (todo.length) setTimeout(step, 16); };
    setTimeout(step, 400);
  }
  resize() {
    const r = this.cv.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr)); this.dpr = dpr; this.w = r.width; this.h = r.height; this.dirty = true; this.clamp();
  }
  invalidate() { this.dirty = true; }
  touch() { this.fogDirty = true; this.dirty = true; }
  destroy() { this.dead = true; this.loupe?.el.remove(); }
  /** A city whose name (or castle) is under this point: { id, x, y, kind } (names win over castles). */
  cityHitAt(px, py) { const inR = (r) => px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]; const hs = this.cityHits ?? []; return hs.find((q) => q.kind === 'label' && inR(q.r)) ?? hs.find((q) => q.kind === 'castle' && inR(q.r)) ?? null; }
  pinAt(px, py) { let best = null, bd = Infinity; for (const s of this.stackPos ?? []) { if (s.px == null) continue; const d = Math.hypot(px - s.px, py - s.py); if (d <= s.D / 2 + 3 && d < bd) { bd = d; best = s; } } return best ? { x: best.x, y: best.y } : null; }      // the nearest medal wins where big medals overlap
  get z() { return this.cam.z; }
  clamp() {
    const c = this.cam, ww = this.g.width * TP * c.z, hh = this.g.height * TP * c.z; const pad = 80;
    c.x = ww + pad * 2 <= this.w ? -(this.w - ww) / 2 / c.z : Math.min(Math.max(c.x, -pad / c.z), (ww + pad - this.w) / c.z);
    c.y = hh + pad * 2 <= this.h ? -(this.h - hh) / 2 / c.z : Math.min(Math.max(c.y, -pad / c.z), (hh + pad - this.h) / c.z);
  }
  centerOn(x, y, z = null) { if (z) this.cam.z = z; this.cam.x = (x + 0.5) * TP - this.w / 2 / this.cam.z; this.cam.y = (y + 0.5) * TP - this.h / 2 / this.cam.z; this.clamp(); this.dirty = true; }
  fit() { this.cam.z = Math.min(this.w / (this.g.width * TP), this.h / (this.g.height * TP)); this.cam.x = this.cam.y = 0; this.clamp(); this.dirty = true; }
  /** The aiming magnifier: a round window above the finger with the ground under it at twice the size, crosshairs on the exact point, and a label. */
  aimAt(p) {
    const SZ = 132, Z = 2.2, dpr = this.dpr || 1; if (!this.loupe) { const el = document.createElement('div'); el.className = 'loupe'; const c = document.createElement('canvas'); c.width = c.height = Math.round(SZ * dpr);
      const lab = document.createElement('div'); lab.className = 'll'; el.append(c, Object.assign(document.createElement('i'), { className: 'xh' }), lab); document.body.append(el); this.loupe = { el, c, lab }; }
    const r = this.cv.getBoundingClientRect(); const L = this.loupe; this.aimP = p;
    let top = r.top + p.y - SZ - 58; if (top < 6) top = r.top + p.y + 58; const left = Math.max(6, Math.min(innerWidth - SZ - 6, r.left + p.x - SZ / 2));
    Object.assign(L.el.style, { left: `${left}px`, top: `${top}px`, display: 'block' });
    const t = this.toTile(p.x, p.y); if (!this.hover || this.hover.x !== t.x || this.hover.y !== t.y) { this.hover = t; this.dirty = true; try { if (this.aimTile) navigator.vibrate?.(4); } catch { /* none */ } }
    this.aimTile = t; L.lab.textContent = this.describe?.(t) ?? ''; this.drawLoupe();
  }
  drawLoupe() {
    const L = this.loupe, p = this.aimP; if (!L || !p) return; const dpr = this.dpr || 1, Z = 2.2, n = L.c.width, src = n / Z; const x = L.c.getContext('2d');
    x.fillStyle = '#0b1320'; x.fillRect(0, 0, n, n); x.imageSmoothingEnabled = true; x.drawImage(this.cv, p.x * dpr - src / 2, p.y * dpr - src / 2, src, src, 0, 0, n, n);
  }
  aimEnd() { if (this.loupe) this.loupe.el.style.display = 'none'; this.aimP = null; this.aimTile = null; this.dirty = true; }
  toTile(sx, sy) { return { x: Math.floor((sx / this.cam.z + this.cam.x) / TP), y: Math.floor((sy / this.cam.z + this.cam.y) / TP) }; }
  toScreen(tx, ty) { return { x: (tx + 0.5) * TP * this.cam.z - this.cam.x * this.cam.z, y: (ty + 0.5) * TP * this.cam.z - this.cam.y * this.cam.z }; }

  bind() {
    const cv = this.cv; let drag = null; const pts = new Map(); let pinch = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    // Touch rules (Matt 23 Oct: scrolling moved armies). A tap is short and still: under 18 px of travel (Flutter's touch slop, raised from 8
    // after users missed taps) and under 350 ms; anything else only moves the map, and for a moment after a scroll or pinch no tap counts.
    // Press and hold depends on the Aiming magnifier option (on for phones by default):
    //   on   hold 0.3 s: a magnifier with crosshairs above the finger (the "Shift" technique, Vogel & Baudisch, CHI 2007); slide to aim, lift to choose
    //   off  hold 0.5 s: the classic hold (select the armies there without marching, open your city, or show an enemy stack)
    const SLOP = (e) => (e.pointerType === 'mouse' ? 6 : 18), TAP_MS = 350, QUIET_MS = 250;
    let holdT = 0; this.quiet = 0;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p); clearTimeout(holdT);
      if (pts.size === 1) { const aimOn = !!this.aimMode?.(); drag = { x0: p.x, y0: p.y, cx: this.cam.x, cy: this.cam.y, moved: false, button: e.button, held: false, t0: performance.now(), slop: SLOP(e) }; const d0 = drag;
        if (e.button !== 2) holdT = setTimeout(() => { if (drag !== d0 || d0.moved || pts.size !== 1) return; d0.held = true; try { navigator.vibrate?.(15); } catch { /* no vibration */ }
          if (aimOn) { d0.aim = { x: d0.x0, y: d0.y0 }; this.aimAt(d0.aim); } else { const t = this.toTile(p.x, p.y); this.onTile(t, { hold: true, px: p.x, py: p.y }); } }, aimOn ? 300 : 500); }
      else { if (drag?.aim) this.aimEnd(); drag = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z }; } });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e); if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; this.zoomAt(mx, my, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, true); this.quiet = performance.now() + QUIET_MS; return; }
      if (drag?.aim) { drag.aim = { x: p.x, y: p.y }; this.aimAt(drag.aim); return; }      // aiming: the map holds still under the magnifier
      if (drag && !drag.held) { const dx = p.x - drag.x0, dy = p.y - drag.y0; if (Math.hypot(dx, dy) > drag.slop) { drag.moved = true; clearTimeout(holdT); } if (drag.moved) { this.cam.x = drag.cx - dx / this.cam.z; this.cam.y = drag.cy - dy / this.cam.z; this.clamp(); this.dirty = true; this.quiet = performance.now() + QUIET_MS; } }
      const t = this.toTile(p.x, p.y); if (!this.hover || this.hover.x !== t.x || this.hover.y !== t.y) { this.hover = t; this.onHover(t); this.dirty = true; }
    });
    const up = (e) => { const p = pos(e); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; clearTimeout(holdT); const now = performance.now();
      if (drag?.aim) { const a = drag.aim; this.aimEnd(); if (e.type === 'pointerup' && a.x >= 0 && a.y >= 0 && a.x <= this.w && a.y <= this.h) this.onTile(this.toTile(a.x, a.y), { aim: true, px: a.x, py: a.y }); }
      else if (drag && !drag.moved && !drag.held && e.type === 'pointerup' && now >= this.quiet && (e.pointerType === 'mouse' || now - drag.t0 <= TAP_MS)) { const t = this.toTile(p.x, p.y); this.onTile(t, { right: drag.button === 2, shift: e.shiftKey, px: p.x, py: p.y }); }
      if (!pts.size) { if (drag?.moved || pinch) this.quiet = now + QUIET_MS; drag = null; } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); this.zoomAt(p.x, p.y, this.cam.z * Math.exp(-e.deltaY * 0.0014)); }, { passive: false });
    cv.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); this.dirty = true; });
    new ResizeObserver(() => this.resize()).observe(cv);
  }
  zoomAt(sx, sy, z, abs = false) {
    const lo = Math.min(0.28, Math.max(0.05, Math.min(this.w / (this.g.width * TP), this.h / (this.g.height * TP)) * 0.98)), hi = 1.9; const nz = Math.min(hi, Math.max(lo, z));
    const wx = sx / this.cam.z + this.cam.x, wy = sy / this.cam.z + this.cam.y; this.cam.z = nz; this.cam.x = wx - sx / nz; this.cam.y = wy - sy / nz; this.clamp(); this.dirty = true;
  }

  /** How big an army's medal is on screen: bigger than before (Matt, 22 Oct: hard to see), and bigger again on touch screens. */
  medalSize() { const z = this.cam.z; if (this.coarse == null) { try { this.coarse = matchMedia('(pointer: coarse)').matches; } catch { this.coarse = false; } }
    return this.coarse ? Math.max(40, Math.min(80, TP * z * 1.18)) : Math.max(32, Math.min(72, TP * z * 1.05)); }
  /** A tap that lands right beside a drawn road (a road cutting the corner of a square looks like it runs through that square): the road square. */
  roadSnap(px, py) {
    const g = this.g, z = this.cam.z; const wx = px / z + this.cam.x, wy = py / z + this.cam.y; const tx = Math.floor(wx / TP), ty = Math.floor(wy / TP);
    const isRoad = (x, y) => { const t = E.tileAt(g, x, y); return !!t && !!(t.road || t.cityId) && (t.terrain !== 'water' || !!t.bridge); };
    if (isRoad(tx, ty)) return null;
    let best = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ax = tx + dx, ay = ty + dy; if (!isRoad(ax, ay)) continue;
      for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) {
        if (!ex && !ey) continue; const bx = ax + ex, by = ay + ey; if (!isRoad(bx, by)) continue;
        const Ax = (ax + 0.5) * TP, Ay = (ay + 0.5) * TP, Bx = (bx + 0.5) * TP, By = (by + 0.5) * TP; const vx = Bx - Ax, vy = By - Ay;
        const u = Math.max(0, Math.min(1, ((wx - Ax) * vx + (wy - Ay) * vy) / (vx * vx + vy * vy))); const d = Math.hypot(wx - (Ax + u * vx), wy - (Ay + u * vy));
        if (d < TP * 0.26 && (!best || d < best.d)) best = u < 0.5 ? { d, x: ax, y: ay } : { d, x: bx, y: by };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  // ---- cached, tinted pictures ----------------------------------------------------------
  medal(type, hex) { return tintedMedal(this.a, type, hex); }
  castleImg(realm) {
    const col = realm?.color ?? 'beige'; return this.a.castle[col] ?? this.a.castle.beige;
  }

  // ---- what this player can see ---------------------------------------------------------
  fogState() {
    const g = this.g; if (!E.fogOn(g)) return null;
    if (!this._fv || this.fogDirty) { this._fv = E.fogView(g, this.me); this.fogDirty = false; this.fogN = (this.fogN ?? 0) + 1; }
    return this._fv;
  }
  buildFog(view) {
    const g = this.g, W = g.width, H = g.height; const stamp = String(this.fogN); if (stamp === this.fogStamp) return; this.fogStamp = stamp;
    const x = this.fogCv.getContext('2d'); const d = x.createImageData(W, H);
    const m = this.maskCv ?? (this.maskCv = Object.assign(document.createElement('canvas'), { width: W, height: H })); const mx = m.getContext('2d'); const md = mx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const vis = view.visible.has(i), ex = view.explored.has(i); const a = vis ? 0 : ex ? 112 : 255; d.data[i * 4] = 10; d.data[i * 4 + 1] = 17; d.data[i * 4 + 2] = 28; d.data[i * 4 + 3] = a; md.data[i * 4 + 3] = ex || vis ? 0 : 255; }
    x.putImageData(d, 0, 0); mx.putImageData(md, 0, 0);
  }
  buildMinimap() {
    const g = this.g; const c = document.createElement('canvas'); c.width = g.width; c.height = g.height; const x = c.getContext('2d'); const d = x.createImageData(g.width, g.height);
    const col = { open: [118, 150, 76], woods: [48, 96, 52], hills: [140, 150, 84], mountain: [128, 120, 108], water: [56, 120, 164], swamp: [90, 110, 70] };
    for (let y = 0; y < g.height; y++) for (let xx = 0; xx < g.width; xx++) { const t = E.tileAt(g, xx, y); const k = col[t.terrain] ?? col.open; const i = (y * g.width + xx) * 4; d.data[i] = k[0]; d.data[i + 1] = k[1]; d.data[i + 2] = k[2]; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); this.minimapBase = c; this.minimapDirty = true;
  }

  // ---- drawing --------------------------------------------------------------------------
  draw() {
    this.dirty = false; const ctx = this.ctx, z = this.cam.z, g = this.g; const now = (performance.now() - this.t0) / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // the open sea carries on past the edge of the map
    if (this.a.tex.water) { const wp = this.seaPat ?? (this.seaPat = ctx.createPattern(this.a.tex.water, 'repeat')); wp.setTransform(new DOMMatrix([z, 0, 0, z, -this.cam.x * z, -this.cam.y * z])); ctx.fillStyle = wp; ctx.fillRect(0, 0, this.w, this.h); ctx.fillStyle = 'rgba(8,32,60,0.42)'; ctx.fillRect(0, 0, this.w, this.h); }
    else { ctx.fillStyle = '#1d3a52'; ctx.fillRect(0, 0, this.w, this.h); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const cs = CH * TP * z; const sx0 = -this.cam.x * z, sy0 = -this.cam.y * z;
    const cx0 = Math.max(0, Math.floor(this.cam.x / (CH * TP))), cx1 = Math.min(this.painter.cw - 1, Math.floor((this.cam.x + this.w / z) / (CH * TP)));
    const cy0 = Math.max(0, Math.floor(this.cam.y / (CH * TP))), cy1 = Math.min(this.painter.ch - 1, Math.floor((this.cam.y + this.h / z) / (CH * TP)));
    let budget = 3; const lv = z >= 0.4 ? 1 : 0;      // the close-up level down to 0.4: the overview level is only ever shrunk a little, never blown up
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      let use = lv;
      if (!this.painter.has(cx, cy, lv)) { if (budget-- > 0) use = lv; else { this.dirty = true; use = this.painter.has(cx, cy, 1 - lv) ? 1 - lv : -1; if (use < 0) continue; } }
      const ch = this.painter.get(cx, cy, use); ctx.drawImage(ch, Math.floor(sx0 + cx * cs), Math.floor(sy0 + cy * cs), Math.ceil(cs) + 1, Math.ceil(cs) + 1);
    }
    // visible tile window
    const tx0 = Math.max(0, Math.floor(this.cam.x / TP) - 1), tx1 = Math.min(g.width - 1, Math.ceil((this.cam.x + this.w / z) / TP) + 1);
    const ty0 = Math.max(0, Math.floor(this.cam.y / TP) - 1), ty1 = Math.min(g.height - 1, Math.ceil((this.cam.y + this.h / z) / TP) + 1);
    const view = this.fogState(); this.fv = view;
    const known = (x, y) => !view || view.explored.has(y * g.width + x);
    const seeNow = (x, y) => !view || view.visible.has(y * g.width + x);
    const S = (tx, ty) => ({ x: (tx + 0.5) * TP * z - this.cam.x * z, y: (ty + 0.5) * TP * z - this.cam.y * z });

    // sites and ports
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = E.tileAt(g, x, y); if (!t || (!t.site && !t.port) || !known(x, y)) continue;
      const s = S(x, y);
      if (t.site) {
        const st = E.siteAt(g, x, y); const kind = st?.kind ?? t.site;
        const name = kind === 'temple' ? 'temple' : kind === 'tower' ? 'mage_tower' : kind === 'library' ? (this.a.site.library ? 'library' : 'shrine') : st?.stronghold ? 'ruin_keep' : 'ruin_' + ['arch', 'columns', 'keep', 'statue'][Math.floor(rnd(x, y, 9) * 4)];
        const im = this.a.site[name]; const tall = { mage_tower: 1.9, temple: 1.55, shrine: 1.45, library: 1.5 }[name] ?? 1.5;
        if (im) { const h = Math.max(TP * z * tall, z < 0.5 ? 22 : 0), w = im.width * h / im.height;
          ctx.fillStyle = 'rgba(14,24,8,0.32)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + TP * z * 0.36, w * 0.42, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = st?.explored ? 0.62 : 1; ctx.drawImage(im, s.x - w / 2, s.y + TP * z * 0.4 - h, w, h); ctx.globalAlpha = 1;
          if (st?.explored && this.a.site.standard) { const fh = TP * z * 0.8, fw = this.a.site.standard.width * fh / this.a.site.standard.height; ctx.drawImage(this.a.site.standard, s.x + w * 0.3, s.y + TP * z * 0.42 - fh, fw, fh); }     // a banner planted: searched
        }
      } else if (t.port) {
        const im = this.a.site.jetty; if (im) { const h = TP * z * 0.9, w = im.width * h / im.height; ctx.drawImage(im, s.x - w / 2, s.y + TP * z * 0.3 - h, w, h); }
      }
    }
    // cities
    const cityLabels = []; this.cityHits = [];      // where each castle and city name is on screen, so a tap on either finds the city
    for (const c of g.cities.values()) {
      if (c.x < tx0 || c.x > tx1 || c.y < ty0 || c.y > ty1) continue;
      let owner = c.owner, razed = c.razed, live = true;
      if (view) { const k = view.cities.find((q) => q.id === c.id); if (!k) continue; owner = k.owner; razed = k.razed; live = k.live; }
      const ov = this.cityOverride?.get(c.id); if (ov) { owner = ov.owner; razed = ov.razed; }     // enemy-turn playback: the old colours until the city is taken
      const s = S(c.x, c.y); const realm = owner ? g.realms.get(owner) : null;
      const im = razed ? this.a.site.razed_castle : this.castleImg(realm);
      if (im) { const h = Math.max(TP * z * (razed ? 1.3 : 2.15), z < 0.5 ? 40 : 0), w = im.width * h / im.height; ctx.drawImage(im, s.x - w / 2, s.y + TP * z * 0.46 - h, w, h);
        this.cityHits.push({ id: c.id, x: c.x, y: c.y, kind: 'castle', r: [s.x - w * 0.42, s.y + TP * z * 0.46 - h * 0.92, w * 0.84, h * 0.92] }); }
      cityLabels.push({ c, s, realm, owner, live, razed });
    }
    // where the selected armies can go this turn (soft light), and what they can attack (red corners)
    if (this.reach && !this.path) this.drawReach(ctx, S, tx0, tx1, ty0, ty1);
    // route preview
    if (this.path && this.path.steps?.length) this.drawPath(ctx, S);
    // armies
    this.drawArmies(ctx, S, view, tx0, tx1, ty0, ty1, now);
    if (this.reach && !this.path) this.drawTargets(ctx, S, tx0, tx1, ty0, ty1, now);
    if (this.ghosts.length || this.fx.length) this.drawPlayback(ctx, S, now);
    // fog
    if (view) {
      this.buildFog(view);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const wx = -this.cam.x * z, wy = -this.cam.y * z, ww = g.width * TP * z, hh = g.height * TP * z; ctx.drawImage(this.fogCv, wx, wy, ww, hh);
      // drifting mist over the ground that has never been seen
      if (this.a.fog) {
        if (!this.mistTile) { const t = document.createElement('canvas'); t.width = t.height = 512; const tx = t.getContext('2d'); tx.drawImage(this.a.fog, 0, 0, 512, 512); const dd = tx.getImageData(0, 0, 512, 512); for (let i = 0; i < dd.data.length; i += 4) { const l = dd.data[i]; dd.data[i] = 70; dd.data[i + 1] = 88; dd.data[i + 2] = 112; dd.data[i + 3] = Math.min(255, Math.max(0, (l - 30) * 2.2)); } tx.putImageData(dd, 0, 0); this.mistTile = t; this.mistScr = document.createElement('canvas'); }
        const sc = this.mistScr; if (sc.width !== this.cv.width || sc.height !== this.cv.height) { sc.width = this.cv.width; sc.height = this.cv.height; }
        const sx = sc.getContext('2d'); sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, sc.width, sc.height);
        const pat = sx.createPattern(this.mistTile, 'repeat'); const k = this.dpr * (0.9 + 0.2 * Math.sin(now * 0.05)); const ox = (now * 6) % 512;
        sx.setTransform(k, 0, 0, k, -this.cam.x * z * this.dpr * 0.6 + ox, -this.cam.y * z * this.dpr * 0.6); sx.fillStyle = pat; sx.fillRect(-512, -512, sc.width / k + 1024 + 600, sc.height / k + 1024 + 600);
        sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'destination-in'; sx.imageSmoothingEnabled = true; sx.drawImage(this.maskCv, wx * this.dpr, wy * this.dpr, ww * this.dpr, hh * this.dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.55; ctx.drawImage(sc, 0, 0); ctx.globalAlpha = 1; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      ctx.restore();
    }
    // city names above the fog? names follow what the player knows
    for (const L of cityLabels) this.drawCityLabel(ctx, L);
    // highlight
    if (this.hover && this.hover.x >= 0 && this.hover.y >= 0 && this.hover.x < g.width && this.hover.y < g.height) {
      const s = S(this.hover.x, this.hover.y), r = TP * z; ctx.strokeStyle = 'rgba(243,220,154,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(s.x - r / 2 + 1, s.y - r / 2 + 1, r - 2, r - 2);
    }
    for (const m of this.marks) { const s = S(m.x, m.y); const r = TP * z; ctx.strokeStyle = m.color ?? '#f3dc9a'; ctx.lineWidth = 2.5; ctx.strokeRect(s.x - r / 2 + 2, s.y - r / 2 + 2, r - 4, r - 4); }
    this.drawMinimap();
  }

  drawCityLabel(ctx, { c, s, realm, owner, live, razed }) {
    const z = this.cam.z; if (z < 0.26) return;
    const fs = Math.max(z < 0.42 ? 10 : 11, Math.min(20, TP * z * 0.36)); ctx.font = `700 ${fs}px Cinzel, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const y = s.y + TP * z * 0.78;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,14,24,0.85)'; ctx.strokeText(c.name, s.x, y); ctx.fillStyle = '#fff6dc'; ctx.fillText(c.name, s.x, y);
    { const tw = ctx.measureText(c.name).width; this.cityHits?.push({ id: c.id, x: c.x, y: c.y, kind: 'label', r: [s.x - tw / 2 - 8, y - fs - 6, tw + 16, fs + (z >= 0.7 ? fs * 0.6 + 22 : 12)] }); }
    if (z >= 0.7) {
      const tag = razed ? 'Ruins' : owner ? realm.name : 'Unsworn'; const f2 = Math.max(9, fs * 0.6); ctx.font = `600 ${f2}px Inter, sans-serif`;
      const tw = ctx.measureText(tag).width + 16, th = f2 + 7; const ty = y + 4; ctx.fillStyle = 'rgba(11,19,32,0.88)'; ctx.fillRect(s.x - tw / 2, ty, tw, th);
      ctx.strokeStyle = 'rgba(216,178,90,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(s.x - tw / 2 + 0.5, ty + 0.5, tw - 1, th - 1);
      const hex = realmHex(realm); if (hex) { ctx.fillStyle = hex; ctx.fillRect(s.x - tw / 2 + 4, ty + th / 2 - 3, 6, 6); }
      ctx.fillStyle = '#e9eef6'; ctx.textAlign = 'left'; ctx.fillText(tag, s.x - tw / 2 + (hex ? 13 : 8), ty + th - 4.5); ctx.textAlign = 'center';
      if (!live) { ctx.fillStyle = '#9fb3cf'; ctx.font = `italic 600 ${f2}px Inter, sans-serif`; ctx.fillText('as last seen', s.x, ty + th + f2 + 2); }
    }
  }

  // ---- enemy-turn playback : ghost stacks that walk a recorded path while the real armies are hidden ----------
  drawPlayback(ctx, S, now) {
    const z = this.cam.z; const D = this.medalSize();
    for (const gh of this.ghosts) {
      if (gh.trail && gh.trail.length > 1) {                    // the road ahead: dotted, like the route preview
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); gh.trail.forEach((t, i) => { const p = S(t[0], t[1]); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.strokeStyle = 'rgba(10,18,29,0.35)'; ctx.lineWidth = 9; ctx.stroke(); ctx.setLineDash([2, 12]); ctx.strokeStyle = '#ff9a8a'; ctx.lineWidth = 4.5; ctx.stroke(); ctx.restore();
      }
      const p = S(gh.x, gh.y); ctx.save(); ctx.globalAlpha = gh.alpha ?? 1;
      const hex = realmHex(this.g.realms.get(gh.owner)); const mc = this.medal(gh.type, hex);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + D * 0.46, D * 0.5, D * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(mc, p.x - D / 2, p.y - D / 2, D, D);
      ctx.setLineDash([7, 6]); ctx.lineDashOffset = -now * 18; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, D / 2 + 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const r = D / 2 + 14, c = 9; ctx.lineWidth = 3; ctx.beginPath();        // the four corner brackets of R15Enemy
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(p.x + sx * r, p.y + sy * (r - c)); ctx.lineTo(p.x + sx * r, p.y + sy * r); ctx.lineTo(p.x + sx * (r - c), p.y + sy * r); } ctx.stroke();
      if (gh.count > 1) { const br = D * 0.27, bx = p.x + D * 0.38, by = p.y - D * 0.38; ctx.fillStyle = '#0b1320'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f3dc9a'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `800 ${br * 1.25}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(gh.count), bx, by + 0.5); ctx.textBaseline = 'alphabetic'; }
      ctx.restore();
    }
    this.fx = this.fx.filter((f) => now * 1000 - f.t0 < f.ms);
    for (const f of this.fx) {                                    // a clash: two crossed blades that swell and fade
      const u = (now * 1000 - f.t0) / f.ms, p = S(f.x, f.y), R = TP * z * (0.5 + 0.5 * u); ctx.save(); ctx.globalAlpha = 1 - u * u; ctx.strokeStyle = f.color ?? '#ffe9a8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - R, p.y - R); ctx.lineTo(p.x + R, p.y + R); ctx.moveTo(p.x + R, p.y - R); ctx.lineTo(p.x - R, p.y + R); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.15, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    this.dirty = true;
  }

  drawArmies(ctx, S, view, tx0, tx1, ty0, ty1, now) {
    const g = this.g, z = this.cam.z; const seen = new Map();
    for (const a of g.armies.values()) {
      if (a.x == null || a.x < tx0 || a.x > tx1 || a.y < ty0 || a.y > ty1) continue;
      if (this.hide && this.hide.has(a.id)) continue;
      if (view && a.owner !== this.me && !view.visible.has(a.y * g.width + a.x)) continue;
      const k = a.x + ',' + a.y; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(a);
    }
    const D = this.medalSize();
    const list = [...seen.entries()].map(([k, arr]) => { const [x, y] = k.split(',').map(Number); return { x, y, arr }; }).sort((p, q) => p.y - q.y);
    for (const st of list) {
      const owner = st.arr[0].owner; const realm = owner ? g.realms.get(owner) : null; const ord = E.orderedArmiesAt(g, st.x, st.y, owner);
      const top = E.displayArmy(ord) ?? st.arr[0]; const s = S(st.x, st.y); const inCity = !!E.cityAt(g, st.x, st.y);
      const px = inCity ? s.x + TP * z * 0.2 : s.x, py = inCity ? s.y + TP * z * 0.22 : s.y - TP * z * 0.02;      // in a city: at the gate, inside its own square
      if (inCity && z < 0.5) continue;
      const afloat = top.afloat; const hex = realmHex(realm); const mc = this.medal(afloat ? 'navy' : top.type, hex);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px + 2, py + D * 0.46, D * 0.5, D * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(6,10,16,0.75)'; ctx.beginPath(); ctx.arc(px, py, D / 2 + 2.5, 0, Math.PI * 2); ctx.fill();      // a dark rim so the medal stands off the ground
      ctx.drawImage(mc, px - D / 2, py - D / 2, D, D);
      const mine = owner === this.me; const selected = this.sel && this.sel.x === st.x && this.sel.y === st.y;
      if (mine && st.arr.every((a) => a.done || a.fortified || a.mp <= 0)) { ctx.fillStyle = 'rgba(8,14,24,0.5)'; ctx.beginPath(); ctx.arc(px, py, D / 2 - 1, 0, Math.PI * 2); ctx.fill(); }
      if (selected) { ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -now * 18; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, D / 2 + 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      const hideCount = owner !== this.me && st.arr.every((a) => a.fortified);      // a dug-in enemy hides how many it is (Defend, as in the original)
      if (ord.length > 1 || hideCount) { const br = D * 0.27; const bx = px + D * 0.38, by = py - D * 0.38; ctx.fillStyle = '#0b1320'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f3dc9a'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${br * 1.25}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hideCount ? '?' : String(ord.length), bx, by + 0.5); ctx.textBaseline = 'alphabetic'; }
      if (mine && st.arr.some((a) => a.fortified)) { ctx.fillStyle = '#f3dc9a'; ctx.font = `700 ${D * 0.3}px Inter`; ctx.textAlign = 'center'; ctx.fillText('F', px - D * 0.42, py - D * 0.3); }
      st.px = px; st.py = py; st.D = D;
    }
    this.stackPos = list;
  }

  drawReach(ctx, S, tx0, tx1, ty0, ty1) {
    const g = this.g, W = g.width, z = this.cam.z, r = TP * z; const { reach, hit } = this.reach; ctx.save();
    ctx.fillStyle = 'rgba(255,244,205,0.2)'; ctx.strokeStyle = 'rgba(255,240,190,0.85)'; ctx.lineWidth = Math.max(1.5, z * 2);
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) { if (!reach.has(y * W + x)) continue; const s = S(x, y); ctx.fillRect(s.x - r / 2 + 1, s.y - r / 2 + 1, r - 2, r - 2);
      // edge lines only where the reachable area ends, so the area reads as one shape
      ctx.beginPath(); if (!reach.has((y - 1) * W + x)) { ctx.moveTo(s.x - r / 2, s.y - r / 2); ctx.lineTo(s.x + r / 2, s.y - r / 2); } if (!reach.has((y + 1) * W + x)) { ctx.moveTo(s.x - r / 2, s.y + r / 2); ctx.lineTo(s.x + r / 2, s.y + r / 2); }
      if (!reach.has(y * W + x - 1)) { ctx.moveTo(s.x - r / 2, s.y - r / 2); ctx.lineTo(s.x - r / 2, s.y + r / 2); } if (!reach.has(y * W + x + 1)) { ctx.moveTo(s.x + r / 2, s.y - r / 2); ctx.lineTo(s.x + r / 2, s.y + r / 2); } ctx.stroke(); }
    ctx.restore();
  }
  /** Enemies the selected group can reach this turn: a red ring round their medal, drawn over the armies so it is never hidden. */
  drawTargets(ctx, S, tx0, tx1, ty0, ty1, now) {
    const W = this.g.width, rr = this.medalSize() / 2 + 5, pulse = 0.75 + 0.25 * Math.sin(now * 5); ctx.save();
    for (const i of this.reach.hit) { const x = i % W, y = (i / W) | 0; if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue; const m = (this.stackPos ?? []).find((q) => q.x === x && q.y === y && q.px != null); const s = m ? { x: m.px, y: m.py } : S(x, y);
      ctx.beginPath(); ctx.arc(s.x, s.y, rr + 2, 0, 7); ctx.strokeStyle = 'rgba(10,6,4,0.7)'; ctx.lineWidth = 6; ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, rr + 2, 0, 7); ctx.strokeStyle = `rgba(255,90,70,${pulse})`; ctx.lineWidth = 3.5; ctx.setLineDash([9, 6]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }
  drawPath(ctx, S) {
    const p = this.path; const pts = p.steps.map((q) => S(q.x, q.y)); const from = S(p.from.x, p.from.y);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); pts.forEach((q) => ctx.lineTo(q.x, q.y)); ctx.strokeStyle = 'rgba(8,14,24,0.7)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.setLineDash([2, 11]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
    pts.forEach((q, i) => { const turn = p.turnAt?.[i]; if (turn != null && i < pts.length - 1 && p.turnAt[i + 1] !== turn) {      // where each turn's march ends, numbered
      ctx.fillStyle = '#f3dc9a'; ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#0b1320'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#20160a'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(turn + 1), q.x, q.y + 0.5); ctx.textBaseline = 'alphabetic'; } });
    const last = pts[pts.length - 1]; if (last) { const lab = p.label; if (lab) { ctx.font = '700 12px Inter, sans-serif'; const tw = ctx.measureText(lab).width + 18; const lx = last.x + 14, ly = last.y - 34; ctx.fillStyle = 'rgba(11,19,32,0.94)'; ctx.fillRect(lx, ly, tw, 24); ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 1.2; ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, 23); ctx.fillStyle = '#f3dc9a'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(lab, lx + 9, ly + 12.5); ctx.textBaseline = 'alphabetic'; } }
    ctx.restore();
  }

  drawMinimap() {
    const m = this.minimapEl; if (!m || !this.minimapBase) return; const g = this.g; const x = m.getContext('2d'); const w = m.width, h = m.height;
    x.imageSmoothingEnabled = true; x.drawImage(this.minimapBase, 0, 0, w, h);
    const sx = w / g.width, sy = h / g.height;
    // cities: bigger squares (Matt, 22 Oct); free (Unsworn) cities light beige with a brown edge, realm cities in their colour with a black edge
    for (const c of g.cities.values()) {
      const k = this.fv ? this.fv.cities.find((q) => q.id === c.id) : null; if (this.fv && !k) continue; const owner = k ? k.owner : c.owner; const razed = k ? k.razed : c.razed;
      const realm = owner ? g.realms.get(owner) : null; const q = Math.max(6, w / 40); const X = c.x * sx + sx / 2 - q / 2, Y = c.y * sy + sy / 2 - q / 2;
      if (razed) { x.strokeStyle = '#3a2a1a'; x.lineWidth = Math.max(1.5, q / 5); x.beginPath(); x.moveTo(X, Y); x.lineTo(X + q, Y + q); x.moveTo(X + q, Y); x.lineTo(X, Y + q); x.stroke(); continue; }
      x.fillStyle = realm ? realmHex(realm) : '#f3e8cc'; x.fillRect(X, Y, q, q);
      x.strokeStyle = realm ? '#05080e' : '#8a6d42'; x.lineWidth = realm ? Math.max(1.5, q / 5) : Math.max(1, q / 8); x.strokeRect(X, Y, q, q);
      if (owner && owner === this.me) { x.strokeStyle = '#fff6dc'; x.lineWidth = Math.max(1, q / 8); x.strokeRect(X - q * 0.3, Y - q * 0.3, q * 1.6, q * 1.6); }      // your own cities get a pale halo
    }
    if (this.fv) { x.drawImage(this.fogCv, 0, 0, w, h); }
    const c = this.cam; const vx = c.x / TP * sx, vy = c.y / TP * sy, vw = this.w / c.z / TP * sx, vh = this.h / c.z / TP * sy; x.strokeStyle = '#fff3c9'; x.lineWidth = Math.max(1.5, w / 200); x.strokeRect(vx, vy, vw, vh);
  }
}
