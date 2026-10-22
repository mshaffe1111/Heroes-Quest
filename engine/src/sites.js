import { ARMIES } from './armies.js';
import { makeItem, itemsOfTier, dropDeadHeroItems } from './items.js';
import { addArmy, armiesAt } from './game.js';
import { offerQuest } from './quests.js';
import { grantXp, isHero, heroStrength } from './units.js';
import { stat, earned } from './stats.js';

// Special sites (manual ch.13): ruins, temples, towers, and the library (later-sequel add-on).
// What the manual states: ruins are always guarded; beating or winning over the guardians explores the ruin, which then yields gold,
// an artefact, an ally, or a Sage with up to three choices; an explored ruin is useless; a hero who dies leaves it unexplored.
// Temples bless every army and hero that visits (+1 strength each, once per temple); a hero gains 1 xp when blessed and may be offered a quest.
// Everything numeric below is a PLACEHOLDER (rules.js lists each).
const sk = (x, y) => `${x},${y}`;

export function addSite(g, { x, y, kind, guardian = null, stronghold = false }) {
  g.sites.set(sk(x, y), { x, y, kind, explored: false, guardian, stronghold, blessed: [], studied: [] });
  const t = g.tiles.get(sk(x, y)) ?? { terrain: 'open' }; g.tiles.set(sk(x, y), { ...t, site: kind });
}
export const siteAt = (g, x, y) => g.sites.get(sk(x, y)) ?? null;
/** Special armies that can guard a ruin or join a hero; `weight` falls as they get stronger. */
export const guardianTypes = () => Object.values(ARMIES).filter((a) => a.special).sort((a, b) => a.str - b.str).map((a) => a.key);

function heroGroup(g, ids) {
  const armies = ids.map((id) => g.armies.get(id)); if (armies.some((a) => !a)) throw new Error('unknown army');
  const hero = armies.find(isHero); return { armies, hero };
}

/** A group with a hero on a ruin: the hero faces the guardian on one die roll, helped by every other army in the group. */
export function ruinWinChance(hero, guardianType, helpers, rules) {
  const gs = ARMIES[guardianType]?.str ?? 4;
  const p = rules.ruinBaseWin + rules.ruinPerStrength * (heroStrength(hero, rules) - gs) + rules.ruinPerArmy * Math.min(7, helpers);
  return Math.max(rules.ruinWinMin, Math.min(rules.ruinWinMax, p));
}

function pick(rng, weights) {
  const keys = Object.keys(weights); let r = rng.next() * keys.reduce((s, k) => s + weights[k], 0);
  for (const k of keys) { if ((r -= weights[k]) < 0) return k; } return keys[keys.length - 1];
}
const between = (rng, [lo, hi]) => lo + Math.floor(rng.next() * (hi - lo + 1));

/** Search a ruin. Returns { ok, outcome } where outcome is one of: died, gold, item, ally, sage. A sage leaves g.pendingSage to answer. */
export function exploreRuin(g, ids) {
  const { armies, hero } = heroGroup(g, ids);
  if (!hero) return { ok: false, reason: 'needs-a-hero' };
  const site = siteAt(g, hero.x, hero.y);
  if (!site || site.kind !== 'ruin') return { ok: false, reason: 'not-a-ruin' };
  if (site.explored) return { ok: false, reason: 'already-explored' };
  if (g.pendingSage) return { ok: false, reason: 'sage-waiting' };
  const realm = g.realms.get(hero.owner);
  const guard = site.guardian ?? guardianTypes()[0];
  const helpers = armies.length - 1;
  const p = ruinWinChance(hero, guard, helpers, g.rules);
  if (g.rng.next() >= p) { dropDeadHeroItems(g, hero, hero.x, hero.y, false); g.armies.delete(hero.id); stat(g, hero.owner, 'heroesLost'); stat(g, hero.owner, 'armiesLost'); return { ok: true, outcome: 'died', hero: hero.id }; }     // the ruin stays unexplored
  site.explored = true; stat(g, hero.owner, 'ruinsExplored'); grantXp(hero, g.rules.xp.ruin, g.rules);
  if (site.stronghold) { const it = makeItem(g, pick(g.rng, { crown: 2, sunsplitter: 2, staff: 2, wings: 1, hostbanner: 1 })); hero.items.push(it); return { ok: true, outcome: 'item', item: it }; }
  const kind = pick(g.rng, g.rules.ruinRewardWeights);
  if (kind === 'gold') { const gold = between(g.rng, g.rules.ruinGold); realm.gold += gold; earned(g, hero.owner, gold); return { ok: true, outcome: 'gold', gold }; }
  if (kind === 'item') { const tier = itemsOfTier(1, 2); const it = makeItem(g, tier[Math.floor(g.rng.next() * tier.length)]); hero.items.push(it); return { ok: true, outcome: 'item', item: it }; }
  if (kind === 'ally') {
    if (armiesAt(g, hero.x, hero.y).length >= g.rules.stackLimit) { const gold = between(g.rng, g.rules.ruinGold); realm.gold += gold; earned(g, hero.owner, gold); return { ok: true, outcome: 'gold', gold, because: 'no-room-for-ally' }; }
    const ally = addArmy(g, guard, hero.owner, hero.x, hero.y);      // the guardian joins; free of upkeep (rules.specialUpkeep is false)
    return { ok: true, outcome: 'ally', army: ally.id, type: guard };
  }
  // sage: up to three choices
  const opts = [{ kind: 'gold', gold: between(g.rng, g.rules.ruinGold) }];
  const stronghold = [...g.sites.values()].find((s) => s.stronghold && !s.explored && !(s.revealedTo ?? []).includes(hero.owner));
  if (stronghold) opts.push({ kind: 'stronghold', x: stronghold.x, y: stronghold.y });
  opts.push({ kind: 'item', itemKey: itemsOfTier(1, 2)[Math.floor(g.rng.next() * itemsOfTier(1, 2).length)] });
  g.pendingSage = { realmId: hero.owner, heroId: hero.id, options: opts };
  return { ok: true, outcome: 'sage', options: opts };
}
export function resolveSage(g, index) {
  const s = g.pendingSage; if (!s) throw new Error('no sage is waiting');
  const o = s.options[index]; if (!o) return { ok: false, reason: 'no-such-choice' };
  g.pendingSage = null; const realm = g.realms.get(s.realmId); const hero = g.armies.get(s.heroId);
  if (o.kind === 'gold') { realm.gold += o.gold; earned(g, s.realmId, o.gold); }
  else if (o.kind === 'item' && hero) hero.items.push(makeItem(g, o.itemKey));
  else if (o.kind === 'stronghold') { const st = siteAt(g, o.x, o.y); st.revealedTo = [...(st.revealedTo ?? []), s.realmId]; }
  return { ok: true, chosen: o };
}

/** Temples: every army and hero in the group is blessed (+1 strength) unless this temple already blessed it. A hero gains xp for it. */
export function visitTemple(g, ids) {
  const { armies } = heroGroup(g, ids); const first = armies[0];
  const site = siteAt(g, first.x, first.y);
  if (!site || site.kind !== 'temple') return { ok: false, reason: 'not-a-temple' };
  let blessed = 0;
  for (const a of armies) {
    if (site.blessed.includes(a.id)) continue;
    site.blessed.push(a.id); a.blessings = (a.blessings ?? 0) + 1; blessed++;
    if (isHero(a)) grantXp(a, g.rules.xp.blessing, g.rules);
  }
  const hero = armies.find(isHero); let quest = null;
  if (hero) quest = offerQuest(g, hero);
  return { ok: true, blessed, quest };
}

/** Library (later-sequel add-on; numbers are placeholders): a hero studies once per library for experience. */
export function studyLibrary(g, ids) {
  const { hero } = heroGroup(g, ids); if (!hero) return { ok: false, reason: 'needs-a-hero' };
  const site = siteAt(g, hero.x, hero.y); if (!site || site.kind !== 'library') return { ok: false, reason: 'not-a-library' };
  if (site.studied.includes(hero.id)) return { ok: false, reason: 'already-studied' };
  site.studied.push(hero.id); const levels = grantXp(hero, g.rules.libraryXp, g.rules);
  return { ok: true, xp: g.rules.libraryXp, levels };
}
