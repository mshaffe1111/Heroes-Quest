import { combatLetters, isSea } from './terrain.js';
import { dieSizeFor } from './rules.js';
import { hasDoctrine, DOCTRINE_NUMBERS } from './doctrines.js';
import { def, isHero, individualStrength, naturalCommand, heroStrength, heroCommandItems, isFlyingArmy, pipsOf, maxPips, hasPerk, heroCoreStrength } from './units.js';

/**
 * Stack bonus for one side (the 90s original rules):
 *   hero bonus   = strongest hero's natural command + all command items
 *   non-hero     = the single best stack bonus among the armies (terrain-limited ones only where they apply)
 *   city/camp    = defenders only
 * Total is capped at +5. Enemy cancel-armies remove their category first.
 */
export function sideBonus(armies, enemies, ctx) {
  const { rules, letters } = ctx;
  const cancelHero = enemies.some((e) => def(e).cancelHero);
  const cancelNonHero = enemies.some((e) => def(e).cancelNonHero);
  const cancelCity = enemies.some((e) => def(e).cancelCity || (isHero(e) && hasPerk(e, 'siege')));      // a catapult, or a Siege Master leading the attack
  const pool = ctx.seaBattle ? armies.filter((a) => isFlyingArmy(a) || isHero(a)) : armies;

  const heroes = pool.filter(isHero);
  let hero = 0;
  if (heroes.length && !cancelHero) {
    hero = Math.max(...heroes.map((h) => naturalCommand(heroCoreStrength(h, rules)))) +
      heroes.reduce((s, h) => s + heroCommandItems(h), 0);
  }
  let nonHero = 0;
  if (!cancelNonHero) {
    for (const a of pool) {
      const sb = def(a).stack;
      if (sb && (!sb.on || sb.on.some((l) => letters.includes(l)))) nonHero = Math.max(nonHero, sb.amount);
    }
  }
  // hero perks that lift the whole stack: Rally always, Fortifier when defending, Charge in the opening duel of an attack
  if (heroes.length && !cancelHero) {
    const n = rules.perkDuels, duel = ctx.duel ?? 99;
    if (duel < n.rally && heroes.some((h) => hasPerk(h, 'rally'))) hero += 1;
    if (ctx.defending && duel < n.fortifier && heroes.some((h) => hasPerk(h, 'fortifier'))) hero += 1;
    if (!ctx.defending && duel < n.charge && heroes.some((h) => hasPerk(h, 'charge'))) hero += 1;
  }
  const city = ctx.defending && !cancelCity ? ctx.cityBonus : 0;
  const total = Math.min(rules.maxStackBonus, hero + nonHero + city);
  return { hero, nonHero, city, total };
}

/** Highest single "enemy subtract" among the opposing armies (Elephants: -1). */
export const enemySubtract = (enemies) => enemies.reduce((m, e) => Math.max(m, def(e).enemySubtract || 0), 0);

/** One strength better when this army counters the army it is facing (Heroes Quest; off in classic mode and in sea battles, where every boat fights at 4). */
export function counterBonus(army, foe, rules, seaBattle = false, foeStack = null, ownStack = null) {
  if (rules.classic || seaBattle || !foe) return 0;
  if (foeStack?.some((h) => hasPerk(h, 'tactician'))) return 0;      // a Tactician in the opposing stack cancels the counter
  if (!def(army).beats?.includes(foe.type)) return 0;
  return rules.counterBonus + (ownStack?.some((h) => hasPerk(h, 'tactician')) ? rules.tacticianCounter : 0);     // and sharpens his own stack's counters
}

/** Final strength of one army in the current battle situation. `foe` is the army it is facing, for counters. */
export function armyStrength(army, ownBonus, enemies, ctx, foe = null, foeStack = null, ownStack = null) {
  const { rules } = ctx;
  if (ctx.seaBattle && !isFlyingArmy(army)) return hasDoctrine(rules, army.owner, 'sea') ? DOCTRINE_NUMBERS.seaStrength : rules.navyStrength;
  const indiv = individualStrength(army, ctx.letters, rules);
  const modified = Math.min(rules.maxModifiedStrength, indiv + ownBonus.total + counterBonus(army, foe, rules, ctx.seaBattle, foeStack, ownStack));
  return Math.max(1, modified - enemySubtract(enemies));
}

/** One duel: a race of rounds. The attacker needs `hpD` hits to bring the defender down, the defender needs `hpA`. Returns who won and what each side has left. */
function fightOne(strA, strD, rng, die, hpA, hpD) {
  let rounds = 0;
  while (hpA > 0 && hpD > 0) {
    if (++rounds > 100000) throw new Error('fight never ended (strengths too high for the die?)');
    const rA = rng.int(die);
    const rD = rng.int(die);
    const lowA = rA <= strD;  // attacker is "low" if its roll is at or below the defender's strength
    const lowD = rD <= strA;
    if (lowA === lowD) continue;   // both low or both high: roll again
    if (lowA) hpA--; else hpD--;
  }
  return { attackerWon: hpD <= 0, rounds, hpA, hpD };
}

/** Battlefield context from the defender's tile. */
export function battleContext(tile, rules, { cityBonus = 0, camped = false } = {}) {
  const letters = combatLetters(tile);
  return {
    rules, letters,
    seaBattle: isSea(tile),
    defenceBonus: Math.max(cityBonus, camped ? rules.campBonus : 0),
  };
}

/** Strengths of the two front armies right now (also used by the battle screen preview). */
export function frontStrengths(att, defn, bc, { duel = 99 } = {}) {      // duel: how many duels have already been fought in this battle
  const ctxA = { ...bc, defending: false, cityBonus: 0, duel };
  const ctxD = { ...bc, defending: true, cityBonus: bc.defenceBonus, duel };
  const bA = sideBonus(att, defn, ctxA);
  const bD = sideBonus(defn, att, ctxD);
  return { a: armyStrength(att[0], bA, defn, ctxA, defn[0], defn, att), d: armyStrength(defn[0], bD, att, ctxD, att[0], att, defn), bonusA: bA, bonusD: bD };
}

/**
 * Resolve a whole battle. `attackers` and `defenders` are arrays in fight order (index 0 fights first).
 * Does not change the armies; returns who lived and a fight-by-fight log.
 * Bonuses are recalculated before every fight, so losing a bonus-giving army weakens the rest.
 *
 * Heroes Quest: every army fights until it has no pips left, and the pips it loses stay lost (result.wounds says how many each survivor carries; the caller
 * decides what to do with them). `retreat`, if given, is asked after every duel in which both sides still have armies: return true and the attacker
 * calls the assault off (result.retreated). `fallBack` is the same question put to defenders on open ground: true and they leave the field (result.fled). It is handed copies of the armies still standing, wounds included, so it can ask the odds calculator.
 */
export function resolveBattle({ attackers, defenders, tile, cityBonus = 0, camped = false, rng, rules, retreat = null, fallBack = null }) {
  const bc = battleContext(tile, rules, { cityBonus, camped });
  const die = dieSizeFor(rules);
  // work on copies carrying the wounds the armies bring in; the originals are never touched
  const copy = new Map();
  const dup = (a) => { const c = { ...a, wounded: rules.classic ? 0 : a.wounded || 0 }; copy.set(c.id, a); return c; };
  const att = attackers.map(dup);
  const dfn = defenders.map(dup);
  const startWound = new Map([...att, ...dfn].map((c) => [c.id, c.wounded]));
  const wins = new Map();
  const deadA = [];
  const deadD = [];
  const fights = [];
  let retreated = false;
  let fled = false;

  while (att.length && dfn.length) {
    const s = frontStrengths(att, dfn, bc, { duel: fights.length });
    const a = att[0];
    const d = dfn[0];
    const hp = (c) => (rules.classic ? Math.max(1, rules.hitsToKill - (rules.damageCarriesOver ? c.wounded || 0 : 0)) : pipsOf(c, rules));   // classic: two hits, less any taken earlier in this battle
    const r = fightOne(s.a, s.d, rng, die, hp(a), hp(d));
    fights.push({ attacker: { id: a.id, type: a.type, strength: s.a }, defender: { id: d.id, type: d.type, strength: s.d },
      winner: r.attackerWon ? 'attacker' : 'defender', rounds: r.rounds, stackBonus: { attacker: s.bonusA.total, defender: s.bonusD.total } });
    if (r.attackerWon) {
      dfn.shift(); deadD.push(d); wins.set(a.id, (wins.get(a.id) || 0) + 1);
      a.wounded = rules.damageCarriesOver ? maxPips(a, rules) - r.hpA : startWound.get(a.id);
    } else {
      att.shift(); deadA.push(a); wins.set(d.id, (wins.get(d.id) || 0) + 1);
      d.wounded = rules.damageCarriesOver ? maxPips(d, rules) - r.hpD : startWound.get(d.id);
    }
    if (att.length && dfn.length && (retreat || fallBack)) {
      const snap = { attackers: att.map((c) => ({ ...c })), defenders: dfn.map((c) => ({ ...c })), fights };
      if (retreat && retreat(snap)) { retreated = true; break; }
      if (fallBack && fallBack(snap)) { fled = true; break; }       // the defenders in the open give ground; the attackers hold the field
    }
  }
  const orig = (c) => copy.get(c.id);
  const wounds = new Map([...att, ...dfn].map((c) => [c.id, c.wounded]));
  return {
    winner: retreated ? 'none' : fled ? 'attacker' : att.length ? 'attacker' : 'defender',
    retreated,
    fled,
    fights,
    survivors: { attackers: att.map(orig), defenders: dfn.map(orig) },
    dead: { attackers: deadA.map(orig), defenders: deadD.map(orig) },
    duelsWon: wins,   // army id -> duels it won in this battle (the caller records them; ranks do not change mid-battle)
    wounds,    // army id -> wounds carried out of the battle, for every survivor
  };
}
