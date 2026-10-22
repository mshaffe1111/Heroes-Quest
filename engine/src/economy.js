import { ARMIES, canRealmBuild, priceOf } from './armies.js';
import { isHero } from './units.js';
import { hasDoctrine, upkeepFractionFor } from './doctrines.js';
import { DEFAULT_RULES } from './rules.js';

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
  if (d.special && !rules.specialUpkeep && !army.cityBuilt) return 0;     // allies from ruins, temples and quests are free; a special army a city built (a signature army) pays like any other
  return Math.floor(priceOf(d, rules) * upkeepFractionFor(rules, army.owner)) + (army.afloat && !hasDoctrine(rules, army.owner, 'sea') ? rules.navalUpkeepExtra : 0);
}

export function realmIncome(cities, realmId) {
  return cities.filter((c) => c.owner === realmId).reduce((s, c) => s + cityIncomeOf(c), 0);
}
export function realmUpkeep(armies, realmId, rules) {
  const mine = armies.filter((a) => a.owner === realmId);
  const qm = new Set(mine.filter((a) => isHero(a) && a.x != null && a.perks?.includes('quartermaster')).map((a) => a.x + ',' + a.y));      // Quartermaster: half upkeep beside him
  return mine.reduce((s, a) => s + (qm.size && a.x != null && qm.has(a.x + ',' + a.y) ? Math.floor(armyUpkeep(a, rules) / 2) : armyUpkeep(a, rules)), 0);
}

// ---- production --------------------------------------------------------------
export const establishCost = (type, rules) => priceOf(ARMIES[type], rules) * ARMIES[type].build * rules.establishCostPerCostBuild;

/** Why this type cannot go on a city's production list (null = it can). `realmId`, when given, may build its own signature army even if it is a special type. */
export function validateProductionType(type, realmId = null) {
  if (!ARMIES[type]) return 'unknown army type';
  if (!canRealmBuild(realmId, type)) return 'that army cannot be built in cities';
  return null;
}

// ---- capturing a city --------------------------------------------------------
// The approved Capture screen (2026-10-22):
//   Occupy  +0       keep it whole; it pays its income from next turn and builds for you
//   Pillage +coffers take its coffers, keep the city: a lean haul, no ruin (every army kind kept)
//   Sack    +more    its coffers and a lot more, and leave it burning: the city loses one army kind (its dearest), and the extra loot is half of what
//                    teaching that kind cost. A city that builds nothing has nothing more to take, so Sack never pays more than Pillage there.
//   Raze    +purse   take what you can carry; the city is gone (no owner, no income, no production) until someone rebuilds it for 800 gold
// The multipliers are PLACEHOLDERS in rules.js (pillageGoldPerIncome, sackGoldPerIncome, sackShareOfLostKind, razeGoldPerIncome).
export const CAPTURE_CHOICES = ['occupy', 'pillage', 'sack', 'raze'];

/** The kind a sacked city loses: the one that cost most to teach (the later one on a tie). null if it builds nothing. */
export function sackedKind(city, rules) {
  let best = null;
  for (const t of city.production) if (ARMIES[t] && (best == null || establishCost(t, rules) >= establishCost(best, rules))) best = t;
  return best;
}

/**
 * What each capture choice would give, without changing anything (for the Capture screen, and so the screen and the rule cannot drift).
 * Returns { occupy, pillage, sack, raze }, each { gold, kinds (the production list left), kindLost, razed }.
 */
export function captureOutcomes(city, rules) {
  const n = (k) => rules[k] ?? DEFAULT_RULES[k];      // a game saved before these rules existed still gets numbers
  const income = city.income || 0; const kinds = [...city.production];
  const pillage = Math.round(income * n('pillageGoldPerIncome'));
  const lost = sackedKind(city, rules);
  const sackBase = Math.round(income * n('sackGoldPerIncome'));
  const sack = lost ? sackBase + Math.round(establishCost(lost, rules) * n('sackShareOfLostKind')) : Math.min(sackBase, pillage);
  return {
    occupy: { gold: 0, kinds, kindLost: null, razed: false },
    pillage: { gold: pillage, kinds, kindLost: null, razed: false },
    sack: { gold: sack, kinds: lost ? kinds.filter((t, i) => i !== kinds.lastIndexOf(lost)) : kinds, kindLost: lost, razed: false },
    raze: { gold: Math.round(income * n('razeGoldPerIncome')), kinds: [], kindLost: null, razed: true },
  };
}

/** Applies the capture choice to the city and returns the gold the captor receives. */
export function applyCapture(city, byRealm, choice, rules) {
  if (!CAPTURE_CHOICES.includes(choice)) throw new Error(`unknown capture choice: ${choice}`);
  const out = captureOutcomes(city, rules)[choice];
  city.building = null;
  city.vector = null;
  city.production = [...out.kinds];
  if (out.razed) { city.owner = null; city.razed = true; } else city.owner = byRealm;
  return out.gold;
}
