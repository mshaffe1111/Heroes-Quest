import { ARMIES } from './armies.js';
import { def, isHero, baseStrength, isFlyingArmy } from './units.js';

/**
 * Default fight order: weakest first, strongest last, heroes always last.
 * Over mountains or sea a flying army goes after the hero so the hero is never stranded.
 */
export function defaultOrder(armies, rules, { overRough = false } = {}) {
  const key = (a) => baseStrength(a, rules) * 1000 + def(a).cost * 10;
  const sorted = [...armies].sort((x, y) => (isHero(x) - isHero(y)) || key(x) - key(y) || String(x.id).localeCompare(String(y.id)));
  if (overRough) {
    const flyers = sorted.filter((a) => !isHero(a) && isFlyingArmy(a));
    if (flyers.length && sorted.some(isHero)) {
      const best = flyers[flyers.length - 1];
      return [...sorted.filter((a) => a !== best), best];
    }
  }
  return sorted;
}

/** Apply a realm's saved Fight Order (list of army ids); armies not in the list keep default order at the front. */
export function applyCustomOrder(armies, orderIds, rules, opts) {
  if (!orderIds || !orderIds.length) return defaultOrder(armies, rules, opts);
  const pos = new Map(orderIds.map((id, i) => [id, i]));
  const base = defaultOrder(armies, rules, opts);
  const known = base.filter((a) => pos.has(a.id)).sort((x, y) => pos.get(x.id) - pos.get(y.id));
  const unknown = base.filter((a) => !pos.has(a.id));
  return [...unknown, ...known];
}

/** The army shown for the whole stack: the one that fights last (the strongest by default). */
export const displayArmy = (orderedArmies) => orderedArmies[orderedArmies.length - 1] ?? null;

/** What the map badge shows: top army + how many are in the stack. */
export function stackBadge(orderedArmies) {
  const top = displayArmy(orderedArmies);
  return top ? { type: top.type, name: ARMIES[top.type].name, count: orderedArmies.length } : null;
}
