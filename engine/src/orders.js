// Army orders and ending the game (approved menus 16a-16n and phone screen 15j).
//   Done      rests an army for this turn only; it is back in the queue next turn.
//   Fortify   holds the ground for as many turns as you like and defends better (the camp bonus); wakes when an enemy comes near, or on Wake up.
//   Disband   removes an army for good (no refund; its upkeep stops). Heroes cannot be disbanded.
//   Concede   the realm gives up: the game ends and the summary is shown.
import { isHero } from './units.js';
import { stat } from './stats.js';
import { fogOn, visibleSet, tileIndex } from './fog.js';

export const WAKE_RANGE = 3;      // an enemy army this close (squares) wakes a fortified one. PLACEHOLDER
const mine = (g, realmId, ids) => ids.map((id) => g.armies.get(id)).filter((a) => a && a.owner === realmId && a.x != null);

export function markDone(g, realmId, ids) {
  const list = mine(g, realmId, ids); if (!list.length || list.length !== ids.length) return { ok: false, reason: 'not-your-armies' };
  list.forEach((a) => { a.done = true; }); return { ok: true, count: list.length };
}
export function fortify(g, realmId, ids) {
  const list = mine(g, realmId, ids); if (!list.length || list.length !== ids.length) return { ok: false, reason: 'not-your-armies' };
  if (list.some((a) => a.afloat)) return { ok: false, reason: 'afloat' };
  list.forEach((a) => { a.fortified = true; a.defending = true; a.done = true; }); return { ok: true, count: list.length };
}
export function wakeUp(g, realmId, ids) {
  const list = mine(g, realmId, ids); if (!list.length) return { ok: false, reason: 'not-your-armies' };
  list.forEach((a) => { a.fortified = false; a.done = false; }); return { ok: true, count: list.length };
}
/** Start of a realm's turn: "Done" is forgotten, and a fortified army with an enemy close by wakes up. Returns the ids that woke. */
export function newTurnOrders(g, realmId) {
  const vis = fogOn(g) ? visibleSet(g, realmId) : null; const woke = [];
  const enemies = [...g.armies.values()].filter((a) => a.owner !== realmId && a.x != null && (!vis || vis.has(tileIndex(g, a.x, a.y))));
  for (const a of g.armies.values()) {
    if (a.owner !== realmId) continue;
    a.done = false;
    if (a.fortified && enemies.some((e) => Math.max(Math.abs(e.x - a.x), Math.abs(e.y - a.y)) <= WAKE_RANGE)) { a.fortified = false; woke.push(a.id); }
  }
  return woke;
}
/** Armies that still want an order this turn, in a steady order (by id number). Stacks are listed by their top army only if `byStack`. */
export function idleArmies(g, realmId) {
  return [...g.armies.values()].filter((a) => a.owner === realmId && a.x != null && a.mp > 0 && !a.done && !a.fortified && !a.afloat)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}
/** The next army to hand the player: the first idle one after `afterId`, wrapping round. null when none is left (time to End turn). */
export function nextIdle(g, realmId, afterId = null) {
  const list = idleArmies(g, realmId); if (!list.length) return null;
  const n = afterId ? Number(String(afterId).slice(1)) : -1;
  return list.find((a) => Number(a.id.slice(1)) > n) ?? list[0];
}

export function disband(g, realmId, ids) {
  const list = mine(g, realmId, ids); if (!list.length || list.length !== ids.length) return { ok: false, reason: 'not-your-armies' };
  if (list.some(isHero)) return { ok: false, reason: 'cannot-disband-hero' };
  list.forEach((a) => { g.armies.delete(a.id); }); stat(g, realmId, 'armiesDisbanded', list.length);
  return { ok: true, count: list.length };
}

/** The realm gives up. It plays no more turns; its cities and armies stay as they were for the final summary. */
export function concede(g, realmId) {
  const realm = g.realms.get(realmId); if (!realm) return { ok: false, reason: 'no-such-realm' };
  if (realm.conceded) return { ok: false, reason: 'already-conceded' };
  realm.conceded = g.turn; const s = g.stats?.realms.get(realmId); if (s && s.fell == null) s.fell = g.turn;
  if (realm.human) g.over = { reason: 'conceded', realm: realmId, turn: g.turn };
  return { ok: true };
}
/**
 * Is the game finished? { over, reason: 'victory' | 'conceded' | 'eliminated' | null, victor, realm }.
 * Victory (more than half of all cities) comes from victor(g), passed in to avoid a circular import; eliminated = every human realm has gone under.
 */
export function statusFrom(g, victorOf, live) {
  if (g.over) return { over: true, reason: g.over.reason, victor: null, realm: g.over.realm };
  const v = victorOf(g); if (v) return { over: true, reason: 'victory', victor: v, realm: v };
  const humans = [...g.realms.values()].filter((r) => r.human);
  if (humans.length && humans.every((h) => !live(g).includes(h.id))) return { over: true, reason: 'eliminated', victor: null, realm: humans[0].id };
  return { over: false, reason: null, victor: null, realm: null };
}
