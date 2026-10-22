import { grantXp, isHero } from './units.js';
import { makeItem, itemsOfTier } from './items.js';
import { ARMIES } from './armies.js';
import { stat, earned } from './stats.js';

// Quests (manual ch.14i and Rules of Engagement). A hero who is blessed at a temple may be offered a quest. One quest per realm at a time, given to a specific
// hero; he or his stack must do it as the AGGRESSOR (being attacked never counts). Kinds, from Rules of Engagement:
//   take-city : occupy or raze one named city          plunder : sack or pillage cities for a sum of gold
//   slay      : kill one named enemy hero or one kind of special army     kill : destroy 10-25 armies of another realm
// Reward: gold, a special item, a temple ally, the location of a stronghold, or (rarely) a hero who joins. +10 hero xp. Quest numbers are PLACEHOLDERS.
const between = (rng, [lo, hi]) => lo + Math.floor(rng.next() * (hi - lo + 1));
/** "a Wizard", "an Elemental", "The Worm", "an Undead". */
const withArticle = (name) => (/^the /i.test(name) ? name : `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`);

export function offerQuest(g, hero) {
  if (!g.rules.quests) return null;
  const realm = g.realms.get(hero.owner);
  if (realm.quest || realm.questOffer) return null;
  if (g.rng.next() >= g.rules.questChance) return null;
  const others = [...g.realms.keys()].filter((r) => r !== hero.owner);
  const cities = [...g.cities.values()].filter((c) => c.owner !== hero.owner && !c.razed);
  const kinds = ['take-city', 'plunder', 'slay', 'kill'].filter((k) => (k === 'take-city' ? cities.length : k === 'kill' ? others.length : true));
  const kind = kinds[Math.floor(g.rng.next() * kinds.length)];
  const q = { kind, heroId: hero.id, progress: 0 };
  if (kind === 'take-city') { const c = cities[Math.floor(g.rng.next() * cities.length)]; q.cityId = c.id; q.text = `Take ${c.name}`; }
  else if (kind === 'plunder') { q.goal = between(g.rng, g.rules.questPlunder); q.text = `Plunder ${q.goal} gold from captured cities`; }
  else if (kind === 'slay') {
    const heroes = [...g.armies.values()].filter((a) => isHero(a) && a.owner !== hero.owner && a.owner);
    if (heroes.length && g.rng.next() < 0.5) { const t = heroes[Math.floor(g.rng.next() * heroes.length)]; q.targetHero = t.id; q.text = `Slay the hero ${t.name}`; }
    else {
      // only a kind of special army some other realm actually fields; with none about, fall back to a hero target or a kill quest
      const sp = [...new Set([...g.armies.values()].filter((a) => a.owner && a.owner !== hero.owner && ARMIES[a.type].special).map((a) => a.type))].map((k) => ARMIES[k]);
      if (sp.length) { const t = sp[Math.floor(g.rng.next() * sp.length)]; q.targetType = t.key; q.text = `Slay ${withArticle(t.name)}`; }
      else if (heroes.length) { const t = heroes[Math.floor(g.rng.next() * heroes.length)]; q.targetHero = t.id; q.text = `Slay the hero ${t.name}`; }
      else { q.kind = 'kill'; q.targetRealm = others[Math.floor(g.rng.next() * others.length)]; q.goal = between(g.rng, g.rules.questKill); q.text = `Destroy ${q.goal} armies of ${g.realms.get(q.targetRealm).name}`; }
    }
  } else { q.targetRealm = others[Math.floor(g.rng.next() * others.length)]; q.goal = between(g.rng, g.rules.questKill); q.text = `Destroy ${q.goal} armies of ${g.realms.get(q.targetRealm).name}`; }
  q.reward = pickReward(g, hero.owner);
  realm.questOffer = q;
  return q;
}
/** Is the realm under its hero limit? (game.js heroLimit, worked out here to keep quests.js free of a circular import.) */
function roomForHero(g, realmId) {
  const owned = [...g.cities.values()].filter((c) => c.owner === realmId).length;
  const limit = owned * 2 > g.cities.size ? g.rules.maxHeroesMajority : g.rules.maxHeroes;
  return [...g.armies.values()].filter((a) => a.owner === realmId && isHero(a)).length < limit;
}
function pickReward(g, realmId) {
  const realm = g.realms.get(realmId); const r = g.rng.next();
  const poor = realm.gold < 300;
  if (poor || r < 0.30) return { kind: 'gold', gold: between(g.rng, g.rules.questGold) };
  if (g.rules.questHeroChance > 0 && roomForHero(g, realmId) && g.rng.next() < g.rules.questHeroChance) return { kind: 'hero' };   // rare: a hero joins (checked again when the quest is done)
  if (r < 0.65) return { kind: 'item', itemKey: itemsOfTier(2, 3)[Math.floor(g.rng.next() * itemsOfTier(2, 3).length)] };
  if (r < 0.85) return { kind: 'ally', type: ['wiz', 'wyrm', 'undead', 'demon', 'elem', 'devil', 'arch', 'drag'][Math.floor(g.rng.next() * 8)] };
  return { kind: 'stronghold' };
}
export function acceptQuest(g, realmId) { const r = g.realms.get(realmId); if (!r.questOffer) return { ok: false, reason: 'no-offer' }; r.quest = r.questOffer; r.questOffer = null; return { ok: true, quest: r.quest }; }
export function declineQuest(g, realmId) { g.realms.get(realmId).questOffer = null; return { ok: true }; }

const heroIn = (q, group) => group.some((a) => a.id === q.heroId);

/** Called when a battle is over. `attackers` are the whole attacking group; `deadDefenders` the armies the attackers killed. */
export function questKills(g, realmId, attackers, deadDefenders) {
  const realm = g.realms.get(realmId); const q = realm?.quest; if (!q || !heroIn(q, attackers)) return null;
  if (q.kind === 'slay') {
    if (deadDefenders.some((d) => (q.targetHero && d.id === q.targetHero) || (q.targetType && d.type === q.targetType))) return finish(g, realmId);
  } else if (q.kind === 'kill') {
    q.progress += deadDefenders.filter((d) => d.owner === q.targetRealm).length;
    if (q.progress >= q.goal) return finish(g, realmId);
  }
  return null;
}
/** Called when a city is captured by `survivors` with a capture choice and the gold it gave. */
export function questCapture(g, realmId, survivors, city, choice, gold) {
  const realm = g.realms.get(realmId); const q = realm?.quest; if (!q || !heroIn(q, survivors)) return null;
  if (q.kind === 'take-city' && q.cityId === city.id && (choice === 'occupy' || choice === 'raze')) return finish(g, realmId);
  if (q.kind === 'plunder' && (choice === 'sack' || choice === 'pillage')) { q.progress += gold; if (q.progress >= q.goal) return finish(g, realmId); }
  return null;
}
/** Start of turn: a quest that can no longer be done is cancelled (its hero is dead, or its city is already ours / razed). */
export function checkQuest(g, realmId) {
  const realm = g.realms.get(realmId); const q = realm.quest; if (!q) return null;
  const hero = g.armies.get(q.heroId);
  const dead = !hero || (q.kind === 'take-city' && (g.cities.get(q.cityId)?.owner === realmId || g.cities.get(q.cityId)?.razed));
  const gone = (q.kind === 'kill' && ![...g.cities.values()].some((c) => c.owner === q.targetRealm) && ![...g.armies.values()].some((a) => a.owner === q.targetRealm))
    || (q.kind === 'slay' && q.targetHero && !g.armies.has(q.targetHero))                                                     // the target hero fell to someone else
    || (q.kind === 'slay' && q.targetType && ![...g.armies.values()].some((a) => a.type === q.targetType && a.owner && a.owner !== realmId));   // none of that kind left to slay
  if (dead || gone) { realm.quest = null; return { type: 'quest-impossible', text: q.text }; }
  return null;
}
function finish(g, realmId) {
  const realm = g.realms.get(realmId); const q = realm.quest; realm.quest = null;
  const hero = g.armies.get(q.heroId); const out = { type: 'quest-done', text: q.text, reward: q.reward };
  if (hero) grantXp(hero, g.rules.xp.quest, g.rules);
  const rw = q.reward;
  stat(g, realmId, 'questsDone');
  if (rw.kind === 'gold') { realm.gold += rw.gold; earned(g, realmId, rw.gold); }
  else if (rw.kind === 'item' && hero) hero.items.push(makeItem(g, rw.itemKey));
  else if (rw.kind === 'ally' && hero) out.ally = { type: rw.type, x: hero.x, y: hero.y };       // game.js places it: avoids a circular import
  else if (rw.kind === 'hero') out.hero = { x: hero?.x ?? null, y: hero?.y ?? null };              // game.js places him (or pays gold if the realm is at its hero limit)
  else if (rw.kind === 'stronghold') { const st = [...g.sites.values()].find((s) => s.stronghold && !s.explored); if (st) { st.revealedTo = [...(st.revealedTo ?? []), realmId]; out.stronghold = { x: st.x, y: st.y }; } }
  g.events.push(out);
  return out;
}
