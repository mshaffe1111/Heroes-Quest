// Saving and loading (approved screens 16k-16n): 2 autosaves (each turn) + 4 named slots, export to / import from a file.
// A saved game is the whole game object turned into plain JSON and back again. Maps, Sets and objects that are shared between two places
// (an army that is both in g.armies and in a vectored army's transit record) come back as the same single object.
// Keys starting with "_" are caches and are not saved. The dice position is saved, so a loaded game plays on exactly as the original would have.
import { makeRng } from './rng.js';

export const SAVE_FORMAT = 'heroes-quest-save';
export const SAVE_VERSION = 1;
export const AUTO_SLOTS = ['auto1', 'auto2'];
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3', 'slot4'];
export const ALL_SLOTS = [...AUTO_SLOTS, ...MANUAL_SLOTS];

// ---- encode / decode --------------------------------------------------------------------------------------------
function countRefs(root) {
  const seen = new Map();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return;
    const n = seen.get(v) ?? 0; seen.set(v, n + 1); if (n) return;
    if (v instanceof Map) { for (const [k, x] of v) { walk(k); walk(x); } }
    else if (v instanceof Set) { for (const x of v) walk(x); }
    else if (Array.isArray(v)) { for (const x of v) walk(x); }
    else for (const k of Object.keys(v)) if (k[0] !== '_') walk(v[k]);
  };
  walk(root); return seen;
}
export function encode(root) {
  const counts = countRefs(root); const ids = new Map(); let next = 1;
  const enc = (v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
    if (v === undefined) return { $u: 1 };
    if (typeof v === 'function') return { $u: 1 };
    if (v === null || typeof v !== 'object') return v;
    if (ids.has(v)) return { $ref: ids.get(v) };
    const shared = counts.get(v) > 1; let tag = null;
    if (shared) { ids.set(v, next); tag = next++; }
    const mark = (o) => (shared ? { $id: tag, ...o } : o);
    if (v instanceof Map) return mark({ $map: [...v].map(([k, x]) => [enc(k), enc(x)]) });
    if (v instanceof Set) return mark({ $set: [...v].map(enc) });
    if (Array.isArray(v)) { const a = v.map(enc); return shared ? { $id: tag, $arr: a } : a; }
    const o = {}; for (const k of Object.keys(v)) if (k[0] !== '_') { const e = enc(v[k]); if (!(e && e.$u === 1)) o[k] = e; }
    return mark(o);
  };
  return enc(root);
}
export function decode(root) {
  const byId = new Map();
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if ('$ref' in v) { if (!byId.has(v.$ref)) throw new Error('save refers to an object it never defines'); return byId.get(v.$ref); }
    if ('$n' in v) return Number(v.$n);
    if ('$u' in v) return undefined;
    const reg = (obj) => { if ('$id' in v) byId.set(v.$id, obj); return obj; };
    if ('$map' in v) { const m = reg(new Map()); for (const [k, x] of v.$map) m.set(dec(k), dec(x)); return m; }
    if ('$set' in v) { const s = reg(new Set()); for (const x of v.$set) s.add(dec(x)); return s; }
    if ('$arr' in v) { const a = reg([]); for (const x of v.$arr) a.push(dec(x)); return a; }
    const o = reg({}); for (const k of Object.keys(v)) if (k !== '$id') o[k] = dec(v[k]); return o;
  };
  return dec(root);
}

// ---- a whole game ---------------------------------------------------------------------------------------------------
const EVENTS_KEPT = 300;     // the turn-by-turn event log is for display only; a save keeps the latest
/** The map squares as a palette of distinct square descriptions plus one palette number per square, when they are in plain row order (otherwise null). */
function packTiles(g) {
  const pal = new Map(), cells = []; let i = 0;
  for (const [k, v] of g.tiles) {
    const x = i % g.width, y = Math.floor(i / g.width); if (k !== `${x},${y}`) return null;
    const j = JSON.stringify(encode(v)); if (!pal.has(j)) pal.set(j, pal.size); cells.push(pal.get(j)); i++;
  }
  return i === g.width * g.height ? { palette: [...pal.keys()].map((j) => JSON.parse(j)), cells } : null;
}
function unpackTiles(g, t) {
  const pal = t.palette.map(decode); const m = new Map();
  t.cells.forEach((c, i) => m.set(`${i % g.width},${Math.floor(i / g.width)}`, { ...pal[c] }));
  return m;
}
/** Plain data for a game, ready for JSON.stringify. `extra` (optional) is stored untouched under `meta` (map shape, rivals, time played...). */
export function saveGame(g, extra = {}) {
  if (!g.rng?.getState) throw new Error('this game uses a scripted dice source and cannot be saved');
  const { rng, tiles, events, ...rest } = g;
  const packed = packTiles(g);
  const body = encode({ ...rest, ...(packed ? {} : { tiles }), events: events.slice(-EVENTS_KEPT), meta: { ...(g.meta ?? {}), ...extra } });
  if (packed) body.tilesPacked = packed;
  return { format: SAVE_FORMAT, version: SAVE_VERSION, rngState: rng.getState(), seed: g.seed, game: body, summary: summarize(g, { ...(g.meta ?? {}), ...extra }) };
}
/** Rebuild a game from saveGame() output. Returns { ok, game } or { ok:false, reason }. */
export function loadGame(data) {
  const bad = (reason) => ({ ok: false, reason });
  if (!data || data.format !== SAVE_FORMAT) return bad('not-a-save');
  if (data.version > SAVE_VERSION) return bad('saved-by-a-newer-version');
  let g; try { g = decode(data.game); } catch (e) { return bad('damaged'); }
  if (!g) return bad('damaged');
  if (data.game.tilesPacked) { try { g.tiles = unpackTiles(g, data.game.tilesPacked); g._ta = null; } catch (e) { return bad('damaged'); } }
  delete g.tilesPacked;
  for (const k of ['realms', 'cities', 'armies', 'tiles', 'rules']) if (!g[k]) return bad('damaged');
  if (!(g.realms instanceof Map) || !(g.armies instanceof Map)) return bad('damaged');
  g.rng = makeRng(data.seed ?? g.seed ?? 1); g.rng.setState(data.rngState);
  return { ok: true, game: g };
}

/** What the Save/Load screen shows for a slot. */
export function summarize(g, meta = {}) {
  const human = [...g.realms.values()].find((r) => r.human) ?? [...g.realms.values()][0];
  const mine = human ? [...g.armies.values()].filter((a) => a.owner === human.id && a.x != null) : [];
  const stacks = new Set(mine.map((a) => `${a.x},${a.y}`)).size;
  const hero = mine.filter((a) => a.type === 'hero').sort((a, b) => (b.level ?? 1) - (a.level ?? 1))[0];
  return { turn: g.turn, realmId: human?.id ?? null, realmName: human?.name ?? null, difficulty: meta.difficulty ?? null,
    cities: human ? [...g.cities.values()].filter((c) => c.owner === human.id && !c.razed).length : 0, stacks, gold: human?.gold ?? 0,
    hero: hero ? { name: hero.name ?? 'Hero', level: hero.level ?? 1 } : null,
    rules: { fog: !!g.rules.fog, classic: !!g.rules.classic }, seed: g.seed, shape: meta.shape ?? null, playedMs: meta.playedMs ?? 0, realms: g.realms.size };
}

// ---- file text (export / import) ------------------------------------------------------------------------------------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
/** The text of a save file. Includes a checksum so a damaged or hand-edited file is caught. */
export function exportSave(data) { const body = JSON.stringify(data); return JSON.stringify({ check: hash(body), body }); }
export function importSave(text) {
  let outer; try { outer = JSON.parse(text); } catch { return { ok: false, reason: 'not-a-save' }; }
  if (typeof outer?.body !== 'string') return { ok: false, reason: 'not-a-save' };
  if (hash(outer.body) !== outer.check) return { ok: false, reason: 'damaged' };
  let data; try { data = JSON.parse(outer.body); } catch { return { ok: false, reason: 'damaged' }; }
  const r = loadGame(data); return r.ok ? { ok: true, data, game: r.game } : r;
}

// ---- slots ---------------------------------------------------------------------------------------------------------------
// `store` is anything with getItem / setItem / removeItem (localStorage, or the in-memory one below). Each slot holds { name, auto, savedAt, summary, file }.
const KEY = (slot) => `hq-save-${slot}`;
export function memoryStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m }; }
const put = (store, slot, rec) => store.setItem(KEY(slot), JSON.stringify(rec));
export function listSaves(store) {
  return ALL_SLOTS.map((slot) => {
    let rec = null; try { rec = JSON.parse(store.getItem(KEY(slot)) ?? 'null'); } catch { rec = null; }
    return { slot, auto: AUTO_SLOTS.includes(slot), empty: !rec, name: rec?.name ?? null, savedAt: rec?.savedAt ?? null, summary: rec?.summary ?? null };
  });
}
/** Save into a named slot. Autosave slots cannot be written this way. */
export function saveToSlot(store, slot, name, g, extra = {}, now = Date.now()) {
  if (!MANUAL_SLOTS.includes(slot)) return { ok: false, reason: 'not-a-manual-slot' };
  const clean = String(name ?? '').trim().slice(0, 40) || `Turn ${g.turn}`;
  const data = saveGame(g, extra);
  try { put(store, slot, { name: clean, auto: false, savedAt: now, summary: data.summary, file: exportSave(data) }); } catch (e) { return { ok: false, reason: 'storage-full' }; }
  return { ok: true, slot, name: clean };
}
/** Start-of-turn autosave: the newest goes in auto1 and the one before moves to auto2. */
export function autosave(store, g, extra = {}, now = Date.now()) {
  const data = saveGame(g, extra); const prev = store.getItem(KEY('auto1'));
  try {
    if (prev) store.setItem(KEY('auto2'), prev);
    put(store, 'auto1', { name: `Autosave, turn ${g.turn}`, auto: true, savedAt: now, summary: data.summary, file: exportSave(data) });
  } catch (e) { return { ok: false, reason: 'storage-full' }; }
  return { ok: true };
}
export function loadFromSlot(store, slot) {
  let rec = null; try { rec = JSON.parse(store.getItem(KEY(slot)) ?? 'null'); } catch { rec = null; }
  if (!rec) return { ok: false, reason: 'empty-slot' };
  return importSave(rec.file);
}
export function deleteSlot(store, slot) { if (!ALL_SLOTS.includes(slot)) return { ok: false, reason: 'no-such-slot' }; store.removeItem(KEY(slot)); return { ok: true }; }
