import { groupCanFly, limitingMovePoints } from './movement.js';
import { moveLetter, isLandingKind } from './terrain.js';
import { def, isHero, moveOf, hasPerk } from './units.js';
import { tileAt, isEmbarkPoint, cityAt, armiesAt } from './game.js';
import { Heap } from './mapgen/grid.js';

const D8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Search from a group's square: the cheapest cost, in move points, to every square it can reach under the same rules as moveGroup:
 * walking, embarking at a coastal city / port / bridge, sailing, coming ashore at a landing point, flying.
 * Taking to the boats or stepping off them each END a move, so each costs a whole turn of the group's move points.
 * Enemy squares block the way unless `through` is set; an enemy square can still be a destination (the last step is an attack).
 * `maxCost` stops the search early (move points). Use routeTo() to read a route out of the result.
 */
export function routeSearch(g, ids, { through = false, maxCost = Infinity } = {}) {
  const real = ids.map((id) => g.armies.get(id)); const first = real[0]; const owner = first.owner;
  const canFly = groupCanFly(real);
  const turn = Math.max(1, limitingMovePoints(real.map((a) => ({ ...a, mp: Math.max(a.mp, 1) }))));
  const penalty = Math.max(1, Math.min(...real.map((a) => moveOf(a, g.rules))));      // a landing or an embarkation ends the turn: price it as a whole turn's march, so a group that has spent its move is not lured onto the boats
  const W = g.width, H = g.height; const N = W * H * 2;
  const dist = new Float64Array(N).fill(Infinity); const prev = new Int32Array(N).fill(-1); const how = new Array(N);
  const id = (x, y, af) => (y * W + x) * 2 + af;
  const heap = new Heap(); const s0 = id(first.x, first.y, first.afloat ? 1 : 0); dist[s0] = 0; heap.push(0, s0);
  // who stands where, worked out once per search (armiesAt scans every army, so asking it per square cost squares x armies)
  const occ = new Set(); for (const a of g.armies.values()) if (a.x != null && a.owner !== owner) occ.add(a.y * W + a.x);
  const hostile = (x, y) => { const c = cityAt(g, x, y); return (c && c.owner !== owner && !c.razed) || occ.has(y * W + x); };
  // the cost of a square for this group without building arrays per square: the same rules as movement.groupMoveCost
  const rules = g.rules, tc = rules.terrainCost; const bonus = new Set(); for (const a of real) { if (!isHero(a)) for (const l of def(a).moveBonus ?? []) bonus.add(l); else if (hasPerk(a, 'ranger')) { bonus.add('W'); bonus.add('H'); } }
  const costOf = (t, af) => {
    if (canFly) return rules.flyCost;
    if (af) { if (t.terrain === 'water' && !t.cityId) return t.shore ? tc.shore : tc.sea; return isLandingKind(t) ? rules.landingCost : Infinity; }
    if (t.bridge) return tc.road; if (t.terrain === 'water' || t.terrain === 'mountain') return Infinity; if (t.cityId) return tc.city; if (t.road) return tc.road;
    let c = tc[t.terrain] ?? tc.open; const l = moveLetter(t); if (l && bonus.has(l)) c = tc.open; return c;
  };
  const hostileMemo = new Map(); const isHostile = (x, y) => { const k = y * W + x; let v = hostileMemo.get(k); if (v === undefined) { v = hostile(x, y); hostileMemo.set(k, v); } return v; };
  while (heap.size) {
    const [k, s] = heap.pop(); if (k > dist[s]) continue; if (k > maxCost) break;
    const af = s & 1, p = s >> 1, x = p % W, y = (p / W) | 0;
    if (!through && !(x === first.x && y === first.y) && isHostile(x, y)) continue;      // an attack ends the route
    const relax = (nx, ny, naf, c, action) => { const ns = id(nx, ny, naf); const nd = k + c; if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = s; how[ns] = action; heap.push(nd, ns); } };
    if (!canFly && isEmbarkPoint(g, x, y)) relax(x, y, af ? 0 : 1, penalty, af ? 'disembark' : 'embark');
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy; const t = tileAt(g, nx, ny); if (!t) continue;
      const c = costOf(t, af); if (!Number.isFinite(c)) continue;
      const lands = !canFly && af === 1 && t.terrain !== 'water';
      const action = isHostile(nx, ny) ? 'attack' : lands ? 'land' : af && !canFly ? 'sail' : 'move';
      relax(nx, ny, lands ? 0 : af, c + (lands ? penalty : 0), action);
    }
  }
  return { g, W, dist, prev, how, s0, turn };
}
/** Read the cheapest route to (x, y) out of a routeSearch result: { cost, turnsApprox, steps:[{x,y,action}] } or null. */
export function routeTo(search, to) {
  const { W, dist, prev, how, s0, turn } = search; const a = (to.y * W + to.x) * 2;
  const goal = dist[a] <= dist[a + 1] ? a : a + 1; if (!Number.isFinite(dist[goal])) return null;
  const steps = []; for (let s = goal; s >= 0 && s !== s0; s = prev[s]) { const p = s >> 1; steps.push({ x: p % W, y: (p / W) | 0, action: how[s] }); }
  steps.reverse();
  return { cost: dist[goal], turnsApprox: Math.ceil(dist[goal] / turn), steps };
}
/** Cheapest route for a group to one square (see routeSearch). Returns null when it cannot get there. */
export function planRoute(g, ids, to, opts = {}) { return routeTo(routeSearch(g, ids, opts), to); }
