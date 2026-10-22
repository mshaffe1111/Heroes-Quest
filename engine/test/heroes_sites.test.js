import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { scriptedRng } from '../src/rng.js';
import { generateMap } from '../src/mapgen/index.js';

function world(extra = {}) {
  const g = E.createGame({ width: 12, height: 8, seed: 11, ...extra });
  E.addRealm(g, { id: 'A', name: 'Verdant Court', gold: 1000 }); E.addRealm(g, { id: 'B', name: 'Crimson Horde', gold: 1000 });
  E.addCity(g, { id: 'ca', x: 0, y: 0, owner: 'A', production: ['linf'] });
  E.addCity(g, { id: 'cb', x: 11, y: 7, owner: 'B', production: ['linf'] });
  return g;
}
const rngFrom = (g, ...vals) => { let i = 0; g.rng = { next: () => (i < vals.length ? vals[i++] : 0.5), int: () => 1, pick: (a) => a[0] }; return g; };

// ---- items ----------------------------------------------------------------------------------------------------
test('items: strength raises the hero and his natural command; command items add straight to the stack bonus; a flight item lifts the group', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 2, 2); const base = E.heroStrength(h, g.rules);
  h.items.push(E.makeItem(g, 'dawnblade')); assert.equal(E.heroStrength(h, g.rules), base + 2);
  h.items.push(E.makeItem(g, 'hostbanner')); assert.equal(E.heroCommandItems(h), 2);
  const w = E.addArmy(g, 'linf', 'A', 2, 2); assert.equal(E.groupCanFly([h, w]), false);
  h.items.push(E.makeItem(g, 'wings')); assert.equal(E.groupCanFly([h, w]), true);
});
test('a hero with a speed item doubles the stack he ended the turn in; two such heroes triple it; one hero with two items does not stack', () => {
  const g = world();
  const h1 = E.addArmy(g, 'hero', 'A', 3, 3), h2 = E.addArmy(g, 'hero', 'A', 3, 3), w = E.addArmy(g, 'hinf', 'A', 3, 3), far = E.addArmy(g, 'hinf', 'A', 6, 6);
  const refresh = () => { for (const a of [h1, h2, w, far]) { a.mp = 0; a.fresh = true; } E.beginTurn(g, 'A'); };
  refresh(); assert.equal(w.mp, 8);
  h1.items.push(E.makeItem(g, 'boots'), E.makeItem(g, 'staff'));     // two items on ONE hero: still double
  refresh(); assert.equal(w.mp, 16); assert.equal(far.mp, 8);
  h2.items.push(E.makeItem(g, 'boots'));                              // a second hero with one: triple
  refresh(); assert.equal(w.mp, 24); assert.equal(far.mp, 8);
  assert.equal(E.speedMultiplier([h1, h2, w]), 3);
});
test('tax items add gold to the turn income', () => {
  const g = world(); E.addCity(g, { id: 'c9', x: 2, y: 0, income: 20, owner: 'A' });
  const h = E.addArmy(g, 'hero', 'A', 2, 0); const before = E.realmEconomy(g, 'A').income;
  h.items.push(E.makeItem(g, 'purse')); assert.equal(E.realmEconomy(g, 'A').income, before + 10);
});
test('a dead hero drops his items where he fell, but they are lost if he died in or over open water', () => {
  const g = world({ rules: { classic: true } }); g.rng = scriptedRng([20, 1, 20, 1]);       // the attacker wins both rounds
  const e = E.addArmy(g, 'ele', 'A', 3, 3); const h = E.addArmy(g, 'hero', 'B', 4, 4); h.items.push(E.makeItem(g, 'crown'));
  E.attack(g, [e.id], 4, 4); assert.equal(g.armies.has(h.id), false); assert.equal(E.groundItemsAt(g, 4, 4).length, 1);
  const g2 = world({ rules: { classic: true } }); g2.rng = scriptedRng([20, 1, 20, 1]); E.setTile(g2, 5, 3, { terrain: 'water' });
  const dr = E.addArmy(g2, 'drag', 'A', 4, 3); const h2 = E.addArmy(g2, 'hero', 'B', 5, 3); h2.afloat = true; h2.items.push(E.makeItem(g2, 'crown'));
  E.attack(g2, [dr.id], 5, 3); assert.equal(g2.armies.has(h2.id), false); assert.equal(E.groundItemsAt(g2, 5, 3).length, 0);
});
test('heroes pick up, drop and hand over items on their own square', () => {
  const g = world(); const a = E.addArmy(g, 'hero', 'A', 3, 3), b = E.addArmy(g, 'hero', 'A', 3, 3);
  const it = E.makeItem(g, 'keenblade'); a.items.push(it);
  assert.equal(E.dropItem(g, a.id, it.id).ok, true); assert.equal(E.groundItemsAt(g, 3, 3).length, 1);
  assert.equal(E.takeItem(g, b.id, it.id).ok, true); assert.equal(b.items.length, 1);
  assert.equal(E.giveItem(g, b.id, a.id, it.id).ok, true); assert.equal(a.items.length, 1);
  const far = E.addArmy(g, 'hero', 'A', 6, 6); assert.equal(E.giveItem(g, a.id, far.id, it.id).reason, 'not-together');
});

// ---- ruins ----------------------------------------------------------------------------------------------------
test('a ruin needs a hero; a win explores it for +3 xp and it cannot be searched twice', () => {
  const g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'wiz' });
  const w = E.addArmy(g, 'hinf', 'A', 5, 5); assert.equal(E.exploreRuin(g, [w.id]).reason, 'needs-a-hero');
  const h = E.addArmy(g, 'hero', 'A', 5, 5); rngFrom(g, 0.0, 0.0);      // roll 0 wins; reward pick 0 = gold
  const r = E.exploreRuin(g, [h.id, w.id]); assert.equal(r.ok, true); assert.equal(r.outcome, 'gold');
  assert.equal(h.xp, 3); assert.equal(g.realms.get('A').gold, 1000 + r.gold);
  assert.equal(E.exploreRuin(g, [h.id]).reason, 'already-explored');
});
test('a hero who loses at a ruin dies and the ruin stays unexplored', () => {
  const g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'drag' }); const h = E.addArmy(g, 'hero', 'A', 5, 5);
  h.items.push(E.makeItem(g, 'pennant')); rngFrom(g, 0.999);
  assert.equal(E.exploreRuin(g, [h.id]).outcome, 'died'); assert.equal(g.armies.has(h.id), false);
  assert.equal(E.siteAt(g, 5, 5).explored, false); assert.equal(E.groundItemsAt(g, 5, 5).length, 1);
});
test('more armies with the hero and a weaker guardian make the one-roll win more likely', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 1, 1);
  const alone = E.ruinWinChance(h, 'drag', 0, g.rules), withArmy = E.ruinWinChance(h, 'drag', 6, g.rules), weak = E.ruinWinChance(h, 'wiz', 0, g.rules);
  assert.ok(withArmy > alone); assert.ok(weak > alone); assert.ok(alone >= g.rules.ruinWinMin && withArmy <= g.rules.ruinWinMax);
});
test('ruin rewards: an item goes to the hero; the guardian can join as a free ally; a sage offers choices', () => {
  let g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'wiz' }); let h = E.addArmy(g, 'hero', 'A', 5, 5);
  rngFrom(g, 0.0, 0.35, 0.0); assert.equal(E.exploreRuin(g, [h.id]).outcome, 'item'); assert.equal(h.items.length, 1);   // weights 30/30/25/15: 0.35 -> item
  g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'wiz' }); h = E.addArmy(g, 'hero', 'A', 5, 5);
  rngFrom(g, 0.0, 0.7); const r = E.exploreRuin(g, [h.id]); assert.equal(r.outcome, 'ally'); assert.equal(E.armiesAt(g, 5, 5).some((a) => a.type === 'wiz'), true);
  assert.equal(E.armyUpkeep(E.armiesAt(g, 5, 5).find((a) => a.type === 'wiz'), g.rules), 0);
  g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'wiz' }); h = E.addArmy(g, 'hero', 'A', 5, 5);
  rngFrom(g, 0.0, 0.95, 0.5, 0.5); const s = E.exploreRuin(g, [h.id]); assert.equal(s.outcome, 'sage'); assert.ok(s.options.length >= 2);
  const gold0 = g.realms.get('A').gold; const c = E.resolveSage(g, 0); assert.equal(c.ok, true); assert.equal(g.realms.get('A').gold, gold0 + c.chosen.gold);
});
test('a stronghold holds a top-tier item', () => {
  const g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'drag', stronghold: true }); const h = E.addArmy(g, 'hero', 'A', 5, 5);
  for (let i = 0; i < 7; i++) E.addArmy(g, 'hinf', 'A', 5, 5).id;     // an escort helps
  rngFrom(g, 0.0, 0.1); const r = E.exploreRuin(g, [h.id, ...E.armiesAt(g, 5, 5).filter((a) => a !== h).map((a) => a.id)]);
  assert.equal(r.outcome, 'item'); assert.ok(r.item.tier >= 1);
});

// ---- temples and libraries --------------------------------------------------------------------------------------
test('a temple blesses every army once: +1 strength, and a hero gains 1 xp; a second visit does nothing', () => {
  const g = world({}); g.rules.quests = false; E.addSite(g, { x: 4, y: 4, kind: 'temple' });
  const h = E.addArmy(g, 'hero', 'A', 4, 4), w = E.addArmy(g, 'hinf', 'A', 4, 4);
  const r = E.visitTemple(g, [h.id, w.id]); assert.equal(r.blessed, 2);
  assert.equal(w.blessings, 1); assert.equal(E.baseStrength(w, g.rules), 4); assert.equal(h.xp, 1);
  assert.equal(E.visitTemple(g, [h.id, w.id]).blessed, 0); assert.equal(w.blessings, 1);
  E.addSite(g, { x: 8, y: 4, kind: 'temple' }); E.setTile(g, 8, 4, { site: 'temple' }); w.x = 8; w.y = 4; assert.equal(E.visitTemple(g, [w.id]).blessed, 1); assert.equal(w.blessings, 2);
});
test('a library teaches a hero once', () => {
  const g = world(); E.addSite(g, { x: 4, y: 4, kind: 'library' }); const h = E.addArmy(g, 'hero', 'A', 4, 4);
  assert.equal(E.studyLibrary(g, [h.id]).ok, true); assert.equal(h.xp, g.rules.libraryXp); assert.equal(E.studyLibrary(g, [h.id]).reason, 'already-studied');
});

// ---- quests -----------------------------------------------------------------------------------------------------
test('a temple may offer a hero one quest; accepting it makes it the realm\'s only quest', () => {
  const g = world(); E.addSite(g, { x: 4, y: 4, kind: 'temple' }); const h = E.addArmy(g, 'hero', 'A', 4, 4);
  rngFrom(g, 0.0, 0.0, 0.0, 0.0, 0.0);
  const r = E.visitTemple(g, [h.id]); assert.ok(r.quest, 'offered'); assert.equal(E.acceptQuest(g, 'A').ok, true);
  assert.equal(g.realms.get('A').quest.heroId, h.id);
  assert.equal(E.offerQuest(g, h), null);      // already has one
});
test('take-city quest: the hero\'s stack occupies the named city -> +10 xp and the reward', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 10, 7); const e = E.addArmy(g, 'ele', 'A', 10, 7);
  g.realms.get('A').quest = { kind: 'take-city', heroId: h.id, cityId: 'cb', text: 'Take cb', reward: { kind: 'gold', gold: 400 }, progress: 0 };
  const a = E.attack(g, [h.id, e.id], 11, 7); assert.equal(a.captureNeeded, true);
  const gold0 = g.realms.get('A').gold; E.resolveCapture(g, 'occupy');
  assert.equal(g.realms.get('A').quest, null); assert.equal(h.xp >= 10, true); assert.ok(g.realms.get('A').gold >= gold0 + 400);
});
test('plunder quest counts gold from sack and pillage only when the hero is there', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 10, 7); const e = E.addArmy(g, 'ele', 'A', 10, 7), w = E.addArmy(g, 'ele', 'A', 9, 7);
  g.realms.get('A').quest = { kind: 'plunder', heroId: h.id, goal: 100, text: 'p', reward: { kind: 'gold', gold: 50 }, progress: 0 };
  E.attack(g, [w.id], 10, 6);      // not relevant
  E.attack(g, [h.id, e.id], 11, 7); E.resolveCapture(g, 'sack');     // 20 income x 12 = 240 >= 100
  assert.equal(g.realms.get('A').quest, null);
});
test('kill quest: only armies the hero\'s stack destroys as the attacker count; being attacked does not', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 5, 5); const e = E.addArmy(g, 'ele', 'A', 5, 5);
  g.realms.get('A').quest = { kind: 'kill', heroId: h.id, targetRealm: 'B', goal: 2, text: 'k', reward: { kind: 'gold', gold: 1 }, progress: 0 };
  E.addArmy(g, 'scout', 'B', 6, 5); E.addArmy(g, 'scout', 'B', 6, 5);
  E.attack(g, [h.id, e.id], 6, 5); assert.equal(g.realms.get('A').quest, null);
  // the other way round: B attacks and kills A's defenders: no progress for A's quest
  const g2 = world(); const hh = E.addArmy(g2, 'hero', 'A', 5, 5); g2.realms.get('A').quest = { kind: 'kill', heroId: hh.id, targetRealm: 'B', goal: 1, text: 'k', reward: { kind: 'gold', gold: 1 }, progress: 0 };
  const attacker = E.addArmy(g2, 'scout', 'B', 6, 5); E.attack(g2, [attacker.id], 5, 5);
  assert.equal(g2.realms.get('A').quest?.progress ?? 0, 0);
});
test('a quest whose hero has died is cancelled at the start of the turn', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 5, 5);
  g.realms.get('A').quest = { kind: 'kill', heroId: h.id, targetRealm: 'B', goal: 5, text: 'k', reward: { kind: 'gold', gold: 1 }, progress: 0 };
  g.armies.delete(h.id); const ev = E.beginTurn(g, 'A'); assert.ok(ev.some((e) => e.type === 'quest-impossible')); assert.equal(g.realms.get('A').quest, null);
});

// ---- hiring heroes and the Standard -------------------------------------------------------------------------------
test('hero offers: rare (1 in 80 a turn; 1 in 6 under classic rules), only with enough gold and room; accepting hires him at the offered price', () => {
  const g = world(); E.addArmy(g, 'hero', 'A', 0, 0); rngFrom(g, 0.005, 0.0, 0.0);     // 0.005 < 1/80 -> offer
  const gold0 = g.realms.get('A').gold; const ev = E.beginTurn(g, 'A'); const offer = ev.find((e) => e.type === 'hero-offer'); assert.ok(offer);
  const cost = offer.cost; const after = g.realms.get('A').gold;
  const r = E.acceptHero(g, 'A'); assert.equal(r.ok, true); assert.equal(g.realms.get('A').gold, after - cost);
  const g2 = world(); g2.realms.get('A').gold = 1; E.addArmy(g2, 'hero', 'A', 0, 0); rngFrom(g2, 0.01); assert.equal(E.beginTurn(g2, 'A').some((e) => e.type === 'hero-offer'), false);
  const g3 = world(); E.addArmy(g3, 'hero', 'A', 0, 0); rngFrom(g3, 0.5); assert.equal(E.beginTurn(g3, 'A').some((e) => e.type === 'hero-offer'), false);
  const g4 = world(); E.addArmy(g4, 'hero', 'A', 0, 0); rngFrom(g4, 0.1); assert.equal(E.beginTurn(g4, 'A').some((e) => e.type === 'hero-offer'), false, '0.1 is no offer at 1 in 80');
  const g5 = world(); g5.rules.classic = true; E.addArmy(g5, 'hero', 'A', 0, 0); rngFrom(g5, 0.1, 0.0, 0.0); assert.equal(E.beginTurn(g5, 'A').some((e) => e.type === 'hero-offer'), true, 'classic rules keep 1 in 6');
  assert.ok(E.heroHireCost(g, 'A') > E.heroHireCost(world(), 'A'), 'later heroes cost more');
});
test('the Standard: +1 command, plantable only on open, road, woods or hills, vectoring reaches it, four armies per turn', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 3, 3); const std = E.giveStandard(g, h.id); assert.equal(E.heroCommandItems(h), 1);
  E.setTile(g, 3, 3, { terrain: 'water' }); assert.equal(E.plantStandard(g, h.id).reason, 'cannot-plant-here');
  E.setTile(g, 3, 3, { terrain: 'mountain' }); assert.equal(E.plantStandard(g, h.id).reason, 'cannot-plant-here');
  E.setTile(g, 3, 3, { terrain: 'woods' }); assert.equal(E.plantStandard(g, h.id).ok, true); assert.equal(E.heroCommandItems(h), 0);
  assert.equal(E.plantStandard(g, h.id).reason, 'no-standard');
  // vector production to the flag
  const c = g.cities.get('ca'); c.production = ['scout']; c.vector = 'flag'; E.setProduction(g, 'ca', 'scout');
  for (let t = 0; t < 12; t++) { E.beginTurn(g, 'A'); g.turn++; }
  assert.ok(E.armiesAt(g, 3, 3).filter((a) => a.type === 'scout').length >= 1);
  const moved = h; E.takeStandard(g, moved.id); assert.equal(moved.items.some((i) => i.id === std.id), true);
  const h2 = E.addArmy(g, 'hero', 'A', 7, 7); E.giveStandard(g, h2.id); E.setTile(g, 7, 7, { terrain: 'open', site: 'temple' });
  assert.equal(E.plantStandard(g, h2.id).reason, 'cannot-plant-here');
});

// ---- on a generated map -----------------------------------------------------------------------------------------
test('a generated map has ruins with guardians (some strongholds), temples, and every first hero carries the Standard', () => {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 4 }));
  const sites = [...g.sites.values()]; assert.ok(sites.length >= 10);
  assert.ok(sites.filter((s) => s.kind === 'ruin').every((s) => s.guardian));
  for (const r of g.realms.keys()) { const hero = [...g.armies.values()].find((a) => a.owner === r && E.isHero(a)); assert.ok(hero.items.some((i) => i.standard), r); }
});
