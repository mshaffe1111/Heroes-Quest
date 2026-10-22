import { moveLetter, isLandingKind } from './terrain.js';
import { def, isHero, isFlyingArmy, heroHasFlightItem } from './units.js';

/**
 * A group flies only if every non-hero army flies. A hero may ride along with flyers, and a hero
 * holding a flight item lets the whole group fly. A hero alone, or any non-flyer, grounds the group.
 */
export function groupCanFly(armies) {
  if (armies.some((a) => isHero(a) && heroHasFlightItem(a))) return true;
  const others = armies.filter((a) => !isHero(a));
  return others.length > 0 && others.every(isFlyingArmy);
}

/** Move points that decide whether the group can step: heroes follow the others (they use the group's cost). */
export function limitingMovePoints(armies) {
  const others = armies.filter((a) => !isHero(a));
  const pool = others.length ? others : armies;
  return Math.min(...pool.map((a) => a.mp));
}

/**
 * Cost for the whole group to enter a tile (Infinity = not allowed).
 *  - Flyers ignore boats, sea and mountains.
 *  - A group afloat sails open water (shore or sea cost) and passes under bridge decks; it can only come ashore at a
 *    landing point (city, port or bridge) - see landsAshore() - and may attack a coastal city from the water.
 *  - A group on foot can never enter open water; a bridge deck costs the road price.
 */
export function groupMoveCost(armies, tile, rules) {
  if (groupCanFly(armies)) return rules.flyCost;
  const tc = rules.terrainCost;
  const afloat = armies.every((a) => a.afloat);
  if (afloat) {
    if (tile.terrain === 'water' && !tile.cityId) return tile.shore ? tc.shore : tc.sea;
    return isLandingKind(tile) ? rules.landingCost : Infinity;   // a boat may only come ashore at a city, port or bridge
  }
  if (tile.bridge) return tc.road;
  if (tile.terrain === 'water' || tile.terrain === 'mountain') return Infinity;
  if (tile.cityId) return tc.city;
  if (tile.road) return tc.road;
  let cost = tc[tile.terrain] ?? tc.open;
  const letter = moveLetter(tile);
  // One army with a move bonus lets the whole group pay the open-ground cost.
  if (letter && armies.some((a) => !isHero(a) && def(a).moveBonus?.includes(letter))) cost = tc.open;
  return cost;
}

/** True when this move takes a boat group onto land: it stops there and the armies are on foot again. */
export function landsAshore(armies, tile) {
  return !groupCanFly(armies) && armies.every((a) => a.afloat) && tile.terrain !== 'water';
}

export const canPay = (armies, cost) => Number.isFinite(cost) && limitingMovePoints(armies) >= cost;

export function spendMovePoints(armies, cost) {
  for (const a of armies) a.mp = Math.max(0, a.mp - cost);
}
