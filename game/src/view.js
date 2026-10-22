// The map view: camera, drawing of everything that is not baked into the ground (cities, sites, armies, route, fog) and mouse/touch handling.
import * as E from '../../engine/src/index.js';
import { Painter, TP, CH, rnd } from './paint.js';

const TEX = ['grass', 'woods', 'hills', 'sand', 'rock', 'dirt', 'water', 'road'];
const SPR = [...['apple', 'blossom', 'coppice', 'dark', 'elder', 'gnarled', 'ivy', 'pale', 'pollard', 'poplar', 'twin', 'wide'].map((n) => 'broad_' + n),
  ...['autumnfir', 'blue', 'cedar', 'dark', 'ghostpair', 'leaning', 'pair', 'pinegnarl', 'redwood', 'shrub', 'umbrella', 'yellow'].map((n) => 'conif_' + n),
  ...['brown4', 'forest5', 'scree6', 'snow1', 'snow2', 'spire3'].map((n) => 'mtn_' + n),
  ...['cairn', 'fernrock', 'gorse', 'heather', 'ledge', 'lichen', 'menhir', 'mossrock', 'scrubtree', 'stones'].map((n) => 'hd_' + n),
  ...['r1', 'r2', 'r3', 'pile', 'grassrock', 'slab5'].map((n) => 'rock_' + n)];
const SITE = ['temple', 'mage_tower', 'jetty', 'razed_castle', 'bones', 'ruin_arch', 'ruin_columns', 'ruin_keep', 'ruin_statue', 'harbor', 'trove'];
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
    this.medalCache = new Map(); this.castleCache = new Map(); this.t0 = performance.now(); this.dirty = true; this.minimap = null; this.showGrid = false;
    this.fogCv = document.createElement('canvas'); this.fogCv.width = g.width; this.fogCv.height = g.height; this.fogStamp = '';
    this.bind(); this.resize();
    this.last = 0; const loop = (t) => { if (this.dead) return; if (this.dirty || ((this.sel || this.path) && t - this.last > 70)) { this.last = t; this.draw(); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
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
  destroy() { this.dead = true; }
  pinAt(px, py) { for (const s of this.stackPos ?? []) if (s.px != null && Math.hypot(px - s.px, py - s.py) <= s.D / 2 + 3) return { x: s.x, y: s.y }; return null; }
  get z() { return this.cam.z; }
  clamp() {
    const c = this.cam, ww = this.g.width * TP * c.z, hh = this.g.height * TP * c.z; const pad = 80;
    c.x = ww + pad * 2 <= this.w ? -(this.w - ww) / 2 / c.z : Math.min(Math.max(c.x, -pad / c.z), (ww + pad - this.w) / c.z);
    c.y = hh + pad * 2 <= this.h ? -(this.h - hh) / 2 / c.z : Math.min(Math.max(c.y, -pad / c.z), (hh + pad - this.h) / c.z);
  }
  centerOn(x, y, z = null) { if (z) this.cam.z = z; this.cam.x = (x + 0.5) * TP - this.w / 2 / this.cam.z; this.cam.y = (y + 0.5) * TP - this.h / 2 / this.cam.z; this.clamp(); this.dirty = true; }
  fit() { this.cam.z = Math.min(this.w / (this.g.width * TP), this.h / (this.g.height * TP)); this.cam.x = this.cam.y = 0; this.clamp(); this.dirty = true; }
  toTile(sx, sy) { return { x: Math.floor((sx / this.cam.z + this.cam.x) / TP), y: Math.floor((sy / this.cam.z + this.cam.y) / TP) }; }
  toScreen(tx, ty) { return { x: (tx + 0.5) * TP * this.cam.z - this.cam.x * this.cam.z, y: (ty + 0.5) * TP * this.cam.z - this.cam.y * this.cam.z }; }

  bind() {
    const cv = this.cv; let drag = null; const pts = new Map(); let pinch = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p); if (pts.size === 1) drag = { x0: p.x, y0: p.y, cx: this.cam.x, cy: this.cam.y, moved: false, button: e.button }; else { drag = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z }; } });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e); if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; this.zoomAt(mx, my, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, true); return; }
      if (drag) { const dx = p.x - drag.x0, dy = p.y - drag.y0; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; if (drag.moved) { this.cam.x = drag.cx - dx / this.cam.z; this.cam.y = drag.cy - dy / this.cam.z; this.clamp(); this.dirty = true; } }
      const t = this.toTile(p.x, p.y); if (!this.hover || this.hover.x !== t.x || this.hover.y !== t.y) { this.hover = t; this.onHover(t); this.dirty = true; }
    });
    const up = (e) => { const p = pos(e); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (drag && !drag.moved && e.type === 'pointerup') { const t = this.toTile(p.x, p.y); this.onTile(t, { right: drag.button === 2, shift: e.shiftKey, px: p.x, py: p.y }); } if (!pts.size) drag = null; };
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
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = '#1d3a52'; ctx.fillRect(0, 0, this.w, this.h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const cs = CH * TP * z; const sx0 = -this.cam.x * z, sy0 = -this.cam.y * z;
    const cx0 = Math.max(0, Math.floor(this.cam.x / (CH * TP))), cx1 = Math.min(this.painter.cw - 1, Math.floor((this.cam.x + this.w / z) / (CH * TP)));
    const cy0 = Math.max(0, Math.floor(this.cam.y / (CH * TP))), cy1 = Math.min(this.painter.ch - 1, Math.floor((this.cam.y + this.h / z) / (CH * TP)));
    let budget = 3; const lv = z >= 0.62 ? 1 : 0;
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
        const st = E.siteAt(g, x, y); let name = t.site === 'temple' ? 'temple' : t.site === 'tower' ? 'mage_tower' : 'ruin_' + ['arch', 'columns', 'keep', 'statue'][Math.floor(rnd(x, y, 9) * 4)];
        const im = this.a.site[name]; if (im) { const h = TP * z * 1.25, w = im.width * h / im.height; ctx.globalAlpha = st?.explored ? 0.78 : 1; ctx.drawImage(im, s.x - w / 2, s.y + TP * z * 0.4 - h, w, h); ctx.globalAlpha = 1; }
      } else if (t.port) {
        const im = this.a.site.jetty; if (im) { const h = TP * z * 0.9, w = im.width * h / im.height; ctx.drawImage(im, s.x - w / 2, s.y + TP * z * 0.3 - h, w, h); }
      }
    }
    // cities
    const cityLabels = [];
    for (const c of g.cities.values()) {
      if (c.x < tx0 || c.x > tx1 || c.y < ty0 || c.y > ty1) continue;
      let owner = c.owner, razed = c.razed, live = true;
      if (view) { const k = view.cities.find((q) => q.id === c.id); if (!k) continue; owner = k.owner; razed = k.razed; live = k.live; }
      const s = S(c.x, c.y); const realm = owner ? g.realms.get(owner) : null;
      const im = razed ? this.a.site.razed_castle : this.castleImg(realm);
      if (im) { const h = Math.max(TP * z * (razed ? 1.3 : 2.15), z < 0.5 ? 40 : 0), w = im.width * h / im.height; ctx.drawImage(im, s.x - w / 2, s.y + TP * z * 0.46 - h, w, h); }
      cityLabels.push({ c, s, realm, owner, live, razed });
    }
    // route preview
    if (this.path && this.path.steps?.length) this.drawPath(ctx, S);
    // armies
    this.drawArmies(ctx, S, view, tx0, tx1, ty0, ty1, now);
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
    const z = this.cam.z; if (z < 0.42) return;
    const fs = Math.max(11, Math.min(20, TP * z * 0.36)); ctx.font = `700 ${fs}px Cinzel, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const y = s.y + TP * z * 0.78;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,14,24,0.85)'; ctx.strokeText(c.name, s.x, y); ctx.fillStyle = '#fff6dc'; ctx.fillText(c.name, s.x, y);
    if (z >= 0.7) {
      const tag = razed ? 'Ruins' : owner ? realm.name : 'Unsworn'; const f2 = Math.max(9, fs * 0.6); ctx.font = `600 ${f2}px Inter, sans-serif`;
      const tw = ctx.measureText(tag).width + 16, th = f2 + 7; const ty = y + 4; ctx.fillStyle = 'rgba(11,19,32,0.88)'; ctx.fillRect(s.x - tw / 2, ty, tw, th);
      ctx.strokeStyle = 'rgba(216,178,90,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(s.x - tw / 2 + 0.5, ty + 0.5, tw - 1, th - 1);
      const hex = realmHex(realm); if (hex) { ctx.fillStyle = hex; ctx.fillRect(s.x - tw / 2 + 4, ty + th / 2 - 3, 6, 6); }
      ctx.fillStyle = '#e9eef6'; ctx.textAlign = 'left'; ctx.fillText(tag, s.x - tw / 2 + (hex ? 13 : 8), ty + th - 4.5); ctx.textAlign = 'center';
      if (!live) { ctx.fillStyle = '#9fb3cf'; ctx.font = `italic 600 ${f2}px Inter, sans-serif`; ctx.fillText('as last seen', s.x, ty + th + f2 + 2); }
    }
  }

  drawArmies(ctx, S, view, tx0, tx1, ty0, ty1, now) {
    const g = this.g, z = this.cam.z; const seen = new Map();
    for (const a of g.armies.values()) {
      if (a.x == null || a.x < tx0 || a.x > tx1 || a.y < ty0 || a.y > ty1) continue;
      if (view && a.owner !== this.me && !view.visible.has(a.y * g.width + a.x)) continue;
      const k = a.x + ',' + a.y; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(a);
    }
    const D = Math.max(18, Math.min(58, TP * z * 0.68));
    const list = [...seen.entries()].map(([k, arr]) => { const [x, y] = k.split(',').map(Number); return { x, y, arr }; }).sort((p, q) => p.y - q.y);
    for (const st of list) {
      const owner = st.arr[0].owner; const realm = owner ? g.realms.get(owner) : null; const ord = E.orderedArmiesAt(g, st.x, st.y, owner);
      const top = E.displayArmy(ord) ?? st.arr[0]; const s = S(st.x, st.y); const inCity = !!E.cityAt(g, st.x, st.y);
      const px = inCity ? s.x + TP * z * 0.42 : s.x, py = inCity ? s.y + TP * z * 0.34 : s.y - TP * z * 0.02;
      if (inCity && z < 0.5) continue;
      const afloat = top.afloat; const hex = realmHex(realm); const mc = this.medal(afloat ? 'navy' : top.type, hex);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px + 2, py + D * 0.46, D * 0.5, D * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(mc, px - D / 2, py - D / 2, D, D);
      const mine = owner === this.me; const selected = this.sel && this.sel.x === st.x && this.sel.y === st.y;
      if (mine && st.arr.every((a) => a.done || a.fortified || a.mp <= 0)) { ctx.fillStyle = 'rgba(8,14,24,0.5)'; ctx.beginPath(); ctx.arc(px, py, D / 2 - 1, 0, Math.PI * 2); ctx.fill(); }
      if (selected) { ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -now * 18; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, D / 2 + 8, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      if (ord.length > 1) { const br = D * 0.27; const bx = px + D * 0.38, by = py - D * 0.38; ctx.fillStyle = '#0b1320'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f3dc9a'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${br * 1.25}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(ord.length), bx, by + 0.5); ctx.textBaseline = 'alphabetic'; }
      if (mine && st.arr.some((a) => a.fortified)) { ctx.fillStyle = '#f3dc9a'; ctx.font = `700 ${D * 0.3}px Inter`; ctx.textAlign = 'center'; ctx.fillText('F', px - D * 0.42, py - D * 0.3); }
      st.px = px; st.py = py; st.D = D;
    }
    this.stackPos = list;
  }

  drawPath(ctx, S) {
    const p = this.path; const pts = p.steps.map((q) => S(q.x, q.y)); const from = S(p.from.x, p.from.y);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); pts.forEach((q) => ctx.lineTo(q.x, q.y)); ctx.strokeStyle = 'rgba(8,14,24,0.7)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.setLineDash([2, 11]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
    pts.forEach((q, i) => { const turn = p.turnAt?.[i]; if (turn != null && (i === pts.length - 1 || p.turnAt[i + 1] !== turn)) { ctx.fillStyle = '#f3dc9a'; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, 7); ctx.fill(); ctx.strokeStyle = '#0b1320'; ctx.lineWidth = 2; ctx.stroke(); } });
    const last = pts[pts.length - 1]; if (last) { const lab = p.label; if (lab) { ctx.font = '700 12px Inter, sans-serif'; const tw = ctx.measureText(lab).width + 18; const lx = last.x + 14, ly = last.y - 34; ctx.fillStyle = 'rgba(11,19,32,0.94)'; ctx.fillRect(lx, ly, tw, 24); ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 1.2; ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, 23); ctx.fillStyle = '#f3dc9a'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(lab, lx + 9, ly + 12.5); ctx.textBaseline = 'alphabetic'; } }
    ctx.restore();
  }

  drawMinimap() {
    const m = this.minimapEl; if (!m || !this.minimapBase) return; const g = this.g; const x = m.getContext('2d'); const w = m.width, h = m.height;
    x.imageSmoothingEnabled = true; x.drawImage(this.minimapBase, 0, 0, w, h);
    const sx = w / g.width, sy = h / g.height;
    for (const c of g.cities.values()) { const realm = c.owner ? g.realms.get(c.owner) : null; if (this.fv && !this.fv.cities.find((q) => q.id === c.id)) continue; x.fillStyle = realmHex(realm) ?? '#d8c9a0'; x.fillRect(c.x * sx - 1.5, c.y * sy - 1.5, 4, 4); x.strokeStyle = '#0b1320'; x.lineWidth = 0.8; x.strokeRect(c.x * sx - 1.5, c.y * sy - 1.5, 4, 4); }
    if (this.fv) { x.drawImage(this.fogCv, 0, 0, w, h); }
    const c = this.cam; const vx = c.x / TP * sx, vy = c.y / TP * sy, vw = this.w / c.z / TP * sx, vh = this.h / c.z / TP * sy; x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.strokeRect(vx, vy, vw, vh);
  }
}
