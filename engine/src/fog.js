// Fog of war (approved screens 17a-17c). With rules.fog on, a realm's map starts covered. Ground it has explored stays uncovered for good.
// In uncovered ground it always knows the land, cities and sites; but enemy armies, and who owns a city now, show only within SIGHT of its own armies and cities.
// A city out of sight shows the owner and turn it was last seen with (and the garrison seen then, which the computer uses to judge odds).
// Sight is straight-line distance in squares, so hills and woods do not block it. The numbers are PLACEHOLDERS to tune with play.
import { ARMIES } from './armies.js';

export const SIGHT = { army: 3, scout: 5, flyer: 4, hero: 4, city: 4, boat: 4 };
export const fogOn = (g) => !!g.rules.fog;
const idx = (g, x, y) => y * g.width + x;
const fogOf = (g) => (g.fog ??= { explored: new Map(), seen: new Map() });
const exploredOf = (g, realmId) => { const f = fogOf(g); let s = f.explored.get(realmId); if (!s) f.explored.set(realmId, (s = new Set())); return s; };
const seenOf = (g, realmId) => { const f = fogOf(g); let s = f.seen.get(realmId); if (!s) f.seen.set(realmId, (s = new Map())); return s; };

/** How far this army sees. */
export function sightOf(a) {
  const d = ARMIES[a.type];
  if (a.type === 'scout') return SIGHT.scout;
  if (a.type === 'hero') return SIGHT.hero;
  if (d.fly) return SIGHT.flyer;
  if (d.naval || a.afloat) return SIGHT.boat;
  return SIGHT.army;
}
/** Visit every on-map square within r of (x, y). */
function disc(g, x, y, r, fn) {
  const r2 = r * r + 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r2) continue;
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= g.width || ny >= g.height) continue;
    fn(nx, ny);
  }
}
function noteCity(g, realmId, c, garrison) {
  seenOf(g, realmId).set(c.id, { owner: c.owner ?? null, razed: !!c.razed, turn: g.turn, garrison });
}
const garrisonOf = (g, c) => [...g.armies.values()].filter((a) => a.x === c.x && a.y === c.y).map((a) => a.type);

/** Everything this realm can see right now: squares within sight of its own armies (on the map) and cities. */
export function visibleSet(g, realmId) {
  const vis = new Set();
  for (const a of g.armies.values()) if (a.owner === realmId && a.x != null) disc(g, a.x, a.y, sightOf(a), (x, y) => vis.add(idx(g, x, y)));
  for (const c of g.cities.values()) if (c.owner === realmId && !c.razed) disc(g, c.x, c.y, SIGHT.city, (x, y) => vis.add(idx(g, x, y)));
  return vis;
}
const cityAtIdx = (g) => { if (!g._cityIdx || g._cityIdx.n !== g.cities.size) { g._cityIdx = new Map([...g.cities.values()].map((c) => [idx(g, c.x, c.y), c])); g._cityIdx.n = g.cities.size; } return g._cityIdx; };

/** Lift the cover around (x, y) for a realm, and note any city seen there. Cheap: called after every move. */
export function revealAround(g, realmId, x, y, r) {
  if (!fogOn(g)) return;
  const ex = exploredOf(g, realmId); const cities = cityAtIdx(g);
  disc(g, x, y, r, (nx, ny) => { const i = idx(g, nx, ny); ex.add(i); const c = cities.get(i); if (c) noteCity(g, realmId, c, garrisonOf(g, c)); });
}
/** Full refresh from every own army and city (start of turn, after a capture). */
export function refreshFog(g, realmId) {
  if (!fogOn(g)) return null;
  for (const a of g.armies.values()) if (a.owner === realmId && a.x != null) revealAround(g, realmId, a.x, a.y, sightOf(a));
  for (const c of g.cities.values()) if (c.owner === realmId && !c.razed) revealAround(g, realmId, c.x, c.y, SIGHT.city);
  return null;
}
export const isExplored = (g, realmId, x, y) => !fogOn(g) || exploredOf(g, realmId).has(idx(g, x, y));
export const exploredCount = (g, realmId) => (fogOn(g) ? exploredOf(g, realmId).size : g.width * g.height);

/**
 * What a realm knows about one city: { owner, razed, turn, live, garrison } or null if it has never seen it.
 * live = in sight right now (the facts are current). Otherwise the facts are as of `turn`.
 */
export function knownCity(g, realmId, c, vis = null) {
  if (!fogOn(g) || c.owner === realmId) return { owner: c.owner ?? null, razed: !!c.razed, turn: g.turn, live: true, garrison: garrisonOf(g, c) };
  if ((vis ?? visibleSet(g, realmId)).has(idx(g, c.x, c.y))) return { owner: c.owner ?? null, razed: !!c.razed, turn: g.turn, live: true, garrison: garrisonOf(g, c) };
  const s = seenOf(g, realmId).get(c.id);
  if (s) return { ...s, live: false };
  return isExplored(g, realmId, c.x, c.y) ? { owner: null, razed: false, turn: 0, live: false, garrison: [] } : null;     // explored but never watched: shown as it was (neutral)
}

/** Everything a screen needs to draw this realm's map. */
export function fogView(g, realmId) {
  refreshFog(g, realmId);
  const vis = visibleSet(g, realmId);
  const cities = []; for (const c of g.cities.values()) { const k = knownCity(g, realmId, c, vis); if (k) cities.push({ id: c.id, x: c.x, y: c.y, name: c.name, ...k }); }
  const armies = [...g.armies.values()].filter((a) => a.x != null && (a.owner === realmId || vis.has(idx(g, a.x, a.y))));
  return { on: fogOn(g), explored: fogOn(g) ? exploredOf(g, realmId) : null, visible: vis, cities, armies, width: g.width, height: g.height };
}
export const tileIndex = idx;
