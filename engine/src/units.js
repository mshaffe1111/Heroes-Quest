import { ARMIES } from './armies.js';
import { hasDoctrine, footBonus } from './doctrines.js';

let autoId = 1;
export const def = (a) => ARMIES[a.type];
export const isHero = (a) => a.type === 'hero';
export const isNavy = (a) => !!def(a).naval;

/** Make an army (or a hero). Pass an id from the game; tests may omit it. */
export function createArmy(type, owner, extra = {}) {
  if (!ARMIES[type]) throw new Error(`unknown army type: ${type}`);
  const army = { id: extra.id ?? `a${autoId++}`, type, owner, blessings: 0, medals: 0, wounded: 0, duelsWon: 0, x: null, y: null,
    mp: ARMIES[type].move, camped: false, defendTurns: 0, afloat: false, ...extra };
  if (type === 'hero') {
    Object.assign(army, { name: extra.name ?? 'Hero', level: extra.level ?? 1, xp: extra.xp ?? 0, items: extra.items ?? [], perks: extra.perks ?? [], perkPoints: extra.perkPoints ?? 0 });
  }
  return army;
}

// ---- heroes ----------------------------------------------------------------
/** Does this army (a hero) carry the perk? */
export const hasPerk = (h, key) => !!h?.perks?.includes(key);
/** A hero's strength before the Banner-bearer perk; command bonus and the like are worked out from this. */
export function heroCoreStrength(h, rules) {
  const itemStr = h.items.reduce((s, i) => s + (i.strength || 0), 0);
  const s = heroLevelStrength(h.level, rules) + h.blessings + h.medals + itemStr;
  return Math.min(rules.maxBaseStrength, s);
}
/** The hero's own strength in a fight: Banner-bearer adds one to him alone (not to his command). */
export function heroStrength(h, rules) {
  return Math.min(rules.maxBaseStrength, heroCoreStrength(h, rules) + (hasPerk(h, 'banner') ? 1 : 0));
}
/** A hero's strength from his level alone (rules.heroStrengthByLevel; older rule sets without the table use base + perLevel x (level - 1)). */
export function heroLevelStrength(level, rules) {
  const t = rules.heroStrengthByLevel; const i = Math.max(0, Math.min(level, rules.heroMaxLevel) - 1);
  return t?.length ? t[Math.min(i, t.length - 1)] : rules.heroBaseStrength + i * rules.heroStrengthPerLevel;
}
/** A hero's move points from his level alone (rules.heroMoveByLevel, or base + perLevel x (level - 1)). */
export function heroLevelMove(level, rules) {
  const t = rules.heroMoveByLevel; const i = Math.max(0, Math.min(level, rules.heroMaxLevel) - 1);
  return t?.length ? t[Math.min(i, t.length - 1)] : rules.heroBaseMove + i * rules.heroMovePerLevel;
}
export function heroMove(h, rules) {
  const itemMove = h.items.reduce((s, i) => s + (i.move || 0), 0);
  return heroLevelMove(h.level, rules) + itemMove + (hasPerk(h, 'pathfinder') ? rules.pathfinderMove : 0);
}
/** Natural command bonus from the hero's strength (manual: <=6 -> +1, 7-8 -> +2, 9 -> +3). */
export function naturalCommand(strength) {
  return strength >= 9 ? 3 : strength >= 7 ? 2 : strength >= 4 ? 1 : 0;
}
export const heroCommandItems = (h) => h.items.reduce((s, i) => s + (i.command || 0), 0);
export const heroHasFlightItem = (h) => h.items.some((i) => i.fly);

export function levelForXp(xp, rules) {
  let lvl = 1;
  rules.heroXpThresholds.forEach((t, i) => { if (xp >= t) lvl = i + 1; });
  return Math.min(lvl, rules.heroMaxLevel);
}
/** Experience needed for the next level, or null at the top level. */
export function xpForNextLevel(h, rules) {
  return h.level >= rules.heroMaxLevel ? null : rules.heroXpThresholds[h.level] ?? null;
}
/** Add XP; returns the number of levels gained. */
export function grantXp(h, amount, rules) {
  h.xp += amount;
  const next = levelForXp(h.xp, rules);
  const gained = next - h.level;
  if (gained > 0) { h.level = next; if (!rules.classic) h.perkPoints = (h.perkPoints || 0) + gained; }     // each level earns a perk to choose
  return Math.max(0, gained);
}

// ---- veterans ------------------------------------------------------------------------------
/** 0 = green, 1 = Seasoned, 2 = Veteran. Ordinary armies earn ranks by winning duels; heroes level up instead; classic mode has none. */
export function rankOf(a, rules) {
  if (rules.classic || isHero(a)) return 0;
  const w = a.duelsWon || 0;
  const seasoned = rules.veteranDuels[0] - (hasDoctrine(rules, a.owner, 'drilled') ? 1 : 0);      // Drilled Ranks
  return w >= rules.veteranDuels[1] ? 2 : w >= seasoned ? 1 : 0;
}
export const RANK_NAMES = ['', 'Seasoned', 'Veteran'];

// ---- pips and wounds ------------------------------------------------------------------
/** Most hits this army can take. In classic mode (plain the 90s original) it is two for everyone. */
export function maxPips(a, rules) {
  if (rules.classic) return rules.hitsToKill;
  return isHero(a) ? rules.heroPips + heroLevelPips(a.level, rules) + (hasPerk(a, 'tough') ? 1 : 0) : def(a).pips + (rankOf(a, rules) >= 1 ? 1 : 0);
}
/** Extra pips a hero has from his level: one for each level in rules.heroExtraPipLevels he has reached (older rule sets: heroExtraPipLevel). */
export function heroLevelPips(level, rules) {
  const at = rules.heroExtraPipLevels ?? [rules.heroExtraPipLevel];
  return at.filter((l) => level >= l).length;
}
/** Hits this army can still take: its pips less the wounds it is carrying. */
export function pipsOf(a, rules) {
  return rules.classic ? rules.hitsToKill : Math.max(1, maxPips(a, rules) - (a.wounded || 0));
}

// ---- strength ---------------------------------------------------------------
export function baseStrength(a, rules) {
  return isHero(a) ? heroStrength(a, rules) : def(a).str + a.blessings + a.medals + (rankOf(a, rules) >= 2 ? 1 : 0);
}
export function moveOf(a, rules) {
  return (isHero(a) ? heroMove(a, rules) : def(a).move) + footBonus(rules, a);
}
/** base + this army's own terrain bonus, never above 9. letters = terrain letters of the battlefield. */
export function individualStrength(a, letters, rules) {
  let s = baseStrength(a, rules);
  const ib = def(a).indiv;
  if (ib && ib.on.some((l) => letters.includes(l))) s += ib.amount;
  return Math.min(rules.maxBaseStrength, s);
}
export function isFlyingArmy(a) { return !!def(a).fly; }
