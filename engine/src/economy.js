import { ARMIES, isBuildableType, priceOf } from './armies.js';
import { isHero } from './units.js';
import { hasDoctrine, upkeepFractionFor } from './doctrines.js';

// ---- defence bonus a city gives its defenders -------------------------------
/** the 90s original: player cities +1 (builds 1-2 types) or +2 (builds 3-4); neutral cities +1 (3-4 types) else 0; razed 0. */
export function cityDefenceBonus(city) {
  if (city.razed) return 0;
  const n = city.production.length;
  if (city.owner) return n >= 3 ? 2 : 1;
  return n >= 3 ? 1 : 0;
}
export const siteDefenceBonus = (site) => (site === 'ruin' || site === 'temple' ? 2 : site === 'tower' ? 1 : 0);

// ---- money -------------------------------------------------------------------
export const cityIncomeOf = (city) => (city.razed || !city.owner ? 0 : city.income);

export function armyUpkeep(army, rules) {
  if (isHero(army)) return 0;
  const d = ARMIES[army.type];
  if (d.special && !rules.specialUpkeep) return 0;
  return Math.floor(priceOf(d, rules) * upkeepFractionFor(rules, army.owner)) + (army.afloat && !hasDoctrine(rules, army.owner, 'sea') ? rules.navalUpkeepExtra : 0);
}

export function realmIncome(cities, realmId) {
  return cities.filter((c) => c.owner === realmId).reduce((s, c) => s + cityIncomeOf(c), 0);
}
export function realmUpkeep(armies, realmId, rules) {
  return armies.filter((a) => a.owner === realmId).reduce((s, a) => s + armyUpkeep(a, rules), 0);
}

// ---- production --------------------------------------------------------------
export const establishCost = (type, rules) => priceOf(ARMIES[type], rules) * ARMIES[type].build * rules.establishCostPerCostBuild;

export function validateProductionType(type) {
  if (!ARMIES[type]) return 'unknown army type';
  if (!isBuildableType(type)) return 'that army cannot be built in cities';
  return null;
}

// ---- capturing a city --------------------------------------------------------
export const CAPTURE_CHOICES = ['occupy', 'pillage', 'sack', 'raze'];

/** Applies the capture choice to the city and returns the gold the captor receives. */
export function applyCapture(city, byRealm, choice, rules) {
  if (!CAPTURE_CHOICES.includes(choice)) throw new Error(`unknown capture choice: ${choice}`);
  const income = city.income;
  city.building = null;
  city.vector = null;
  switch (choice) {
    case 'occupy':
      city.owner = byRealm;
      return 0;
    case 'pillage':
      city.owner = byRealm;
      city.production = city.production.slice(0, -1);   // damages productive capacity
      return income * rules.pillageGoldPerIncome;
    case 'sack':
      city.owner = byRealm;
      city.production = [];                            // strips all production
      return income * rules.sackGoldPerIncome;
    case 'raze':
      city.owner = null;
      city.razed = true;
      city.production = [];
      return 0;
  }
}
