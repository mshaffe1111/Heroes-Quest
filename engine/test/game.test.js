import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';

function world(extra = {}) {
  const g = E.createGame({ width: 10, height: 10, seed: 5, ...extra });
  E.addRealm(g, { id: 'A', name: 'Verdant Court', gold: 100 });
  E.addRealm(g, { id: 'B', name: 'Crimson Horde', gold: 100 });
  return g;
}

test('income is the sum of city incomes; upkeep is half the build price of every army', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, income: 20, owner: 'A', production: ['hinf'] });
  E.addCity(g, { id: 'c2', x: 3, y: 1, income: 25, owner: 'A' });
  E.addCity(g, { id: 'c3', x: 5, y: 1, income: 28, owner: 'B' });
  E.addArmy(g, 'hcav', 'A', 1, 1); E.addArmy(g, 'hcav', 'A', 1, 1); E.addArmy(g, 'scout', 'A', 1, 1);
  E.addArmy(g, 'hero', 'A', 1, 1);
  const eco = E.realmEconomy(g, 'A');
  assert.deepEqual(eco, { income: 45, upkeep: 9, net: 36 });   // 4 + 4 + 1
  E.beginTurn(g, 'A');
  assert.equal(g.realms.get('A').gold, 136);
});
test('production: a 2-turn army appears on the second turn and its price is paid then', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, income: 0, owner: 'A', production: ['orc', 'linf'] });
  assert.equal(E.setProduction(g, 'c1', 'orc').ok, true);
  E.beginTurn(g, 'A');
  assert.equal(E.armiesAt(g, 1, 1).length, 0);
  E.beginTurn(g, 'A');
  assert.equal(E.armiesAt(g, 1, 1).length, 1);
  assert.equal(E.armiesAt(g, 1, 1)[0].type, 'orc');
  assert.equal(g.realms.get('A').gold, 100 - 3);   // orc price 3 (Heroes Quest price; 4 in classic mode); its upkeep starts next turn
});
test('a city can only build one of its own army types', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, owner: 'A', production: ['hinf'] });
  assert.equal(E.setProduction(g, 'c1', 'drag').ok, false);
});
test('a city holds at most 4 army types and specials cannot be built', () => {
  const g = world();
  assert.throws(() => E.addCity(g, { id: 'x', x: 0, y: 0, production: ['scout', 'linf', 'hinf', 'pike', 'hcav'] }));
  assert.throws(() => E.addCity(g, { id: 'y', x: 0, y: 1, production: ['drag'] }));
});
test('paying to add a type: cost is charged; when full you must choose one to replace', () => {
  const g = world();
  g.realms.get('A').gold = 5000;
  E.addCity(g, { id: 'c1', x: 1, y: 1, owner: 'A', production: ['scout', 'linf', 'hinf', 'pike'] });
  assert.equal(E.addProductionType(g, 'A', 'c1', 'hcav').reason, 'slots-full-choose-one-to-replace');
  const r = E.addProductionType(g, 'A', 'c1', 'hcav', 'scout');
  assert.equal(r.ok, true);
  assert.deepEqual(g.cities.get('c1').production, ['hcav', 'linf', 'hinf', 'pike']);
  assert.equal(g.realms.get('A').gold, 5000 - r.cost);
});
test('vectoring: a built army travels build time + 2 turns and then appears in the destination city', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, owner: 'A', production: ['linf'] });
  E.addCity(g, { id: 'c2', x: 8, y: 8, owner: 'A' });
  E.setProduction(g, 'c1', 'linf'); E.setVector(g, 'c1', 'c2');
  E.beginTurn(g, 'A');                       // built, now in transit (arrives turn 3)
  assert.equal(E.armiesAt(g, 8, 8).length, 0);
  g.turn = 2; E.beginTurn(g, 'A');
  assert.equal(E.armiesAt(g, 8, 8).length, 0);
  g.turn = 3; E.beginTurn(g, 'A');
  assert.equal(E.armiesAt(g, 8, 8).length, 1);
});
test('armies in transit by vectoring cost their upkeep while on the road', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, owner: 'A', production: ['hcav'] });
  E.addCity(g, { id: 'c2', x: 8, y: 8, owner: 'A' });
  E.setProduction(g, 'c1', 'hcav'); E.setVector(g, 'c1', 'c2');
  for (let t = 1; t <= 3; t++) { g.turn = t; E.beginTurn(g, 'A'); }
  assert.ok(E.realmEconomy(g, 'A').upkeep > 0);   // built on turn 3, still travelling (arrives turn 5), and already paid for
});

// ---- moving ------------------------------------------------------------------------
test('moving costs terrain points; a group stops when it cannot pay', () => {
  const g = world();
  E.setTile(g, 2, 1, { terrain: 'hills' });
  const a = E.addArmy(g, 'hinf', 'A', 1, 1);       // move 8
  a.mp = 3;
  const r = E.moveGroup(g, [a.id], 2, 1);          // hills cost 4
  assert.equal(r.ok, false); assert.equal(r.reason, 'no-move-points');
  a.mp = 4;
  assert.equal(E.moveGroup(g, [a.id], 2, 1).ok, true);
  assert.equal(a.mp, 0); assert.equal(a.x, 2);
});
test('cannot move onto enemies, into enemy cities, over mountains, or past the stack limit', () => {
  const g = world();
  E.setTile(g, 2, 0, { terrain: 'mountain' });
  E.addCity(g, { id: 'c3', x: 0, y: 1, owner: 'B' });
  E.addArmy(g, 'linf', 'B', 1, 2);
  const a = E.addArmy(g, 'hinf', 'A', 1, 1);
  assert.equal(E.moveGroup(g, [a.id], 1, 2).reason, 'enemy-here');
  assert.equal(E.moveGroup(g, [a.id], 0, 1).reason, 'enemy-city');
  assert.equal(E.moveGroup(g, [a.id], 2, 0).reason, 'forbidden-terrain');
  for (let i = 0; i < 8; i++) E.addArmy(g, 'scout', 'A', 2, 1);
  assert.equal(E.moveGroup(g, [a.id], 2, 1).reason, 'stack-limit');
});
test('unused move points carry over, at most 2; new armies get none the first turn', () => {
  const g = world();
  const a = E.addArmy(g, 'hinf', 'A', 1, 1);        // move 8
  E.beginTurn(g, 'A');
  assert.equal(a.mp, 8);                              // fresh: no carry-over
  E.beginTurn(g, 'A');
  assert.equal(a.mp, 10);                             // 8 unused -> only 2 carry
});
test('a stack encamps after a full turn on Defend and gets +1', () => {
  const g = world();
  const a = E.addArmy(g, 'hinf', 'A', 1, 1);
  const b = E.addArmy(g, 'linf', 'B', 2, 1);
  E.defend(g, [a.id]);
  assert.equal(a.camped, false);
  E.beginTurn(g, 'A');
  assert.equal(a.camped, true);
  g.rng = E.scriptedRng([1, 20, 1, 20]);          // the attacker keeps losing rounds
  const r = E.attack(g, [b.id], 1, 1);
  assert.equal(r.battle.fights[0].stackBonus.defender, 1);
  E.moveGroup(g, [a.id], 1, 2);
  assert.equal(a.camped, false);
});

// ---- fighting and cities ---------------------------------------------------------------
test('attack: the loser is removed, the winner takes the square, heroes earn battle XP', () => {
  const g = world();
  const hero = E.addArmy(g, 'hero', 'A', 1, 1);
  const lone = E.addArmy(g, 'linf', 'B', 2, 1);
  g.rng = E.scriptedRng([20, 1, 20, 1]);
  const r = E.attack(g, [hero.id], 2, 1);
  assert.equal(r.attackersWon, true);
  assert.equal(g.armies.has(lone.id), false);
  assert.equal(hero.x, 2);
  assert.equal(hero.xp, 1);
});
test('a lost attack destroys the whole attacking group and the defenders stay put', () => {
  const g = world();
  const a1 = E.addArmy(g, 'scout', 'A', 1, 1);
  const d = E.addArmy(g, 'drag', 'B', 2, 1);
  g.rng = E.scriptedRng([1, 20, 1, 20]);
  const r = E.attack(g, [a1.id], 2, 1);
  assert.equal(r.attackersWon, false);
  assert.equal(g.armies.has(a1.id), false);
  assert.equal(d.x, 2);
});
test('taking a defended city: win, then choose; occupy keeps the city and its production', () => {
  const g = world();
  E.addCity(g, { id: 'cx', x: 2, y: 1, owner: 'B', income: 30, production: ['hinf', 'pike', 'hcav'] });
  const att = E.addArmy(g, 'hcav', 'A', 1, 1);
  E.addArmy(g, 'linf', 'B', 2, 1);
  g.rng = E.scriptedRng([20, 1, 20, 1]);
  const r = E.attack(g, [att.id], 2, 1);
  assert.equal(r.captureNeeded, true);
  assert.equal(att.x, 1);                       // waits outside until the choice is made
  E.resolveCapture(g, 'occupy');
  assert.equal(g.cities.get('cx').owner, 'A');
  assert.deepEqual(g.cities.get('cx').production, ['hinf', 'pike', 'hcav']);
  assert.equal(att.x, 2);
});
test('capture follows the approved screen: pillage keeps every kind, sack loses its dearest kind for more gold, raze pays a purse and burns it', () => {
  const run = (choice) => {
    const g = world();
    E.addCity(g, { id: 'cx', x: 2, y: 1, owner: 'B', income: 10, production: ['hinf', 'pike', 'hcav'] });
    const att = E.addArmy(g, 'hcav', 'A', 1, 1);
    g.rng = E.scriptedRng([]);
    const r = E.attack(g, [att.id], 2, 1);      // empty city: no fight
    assert.equal(r.captureNeeded, true);
    const res = E.resolveCapture(g, choice);
    return { g, res, city: g.cities.get('cx') };
  };
  const o = run('occupy');
  assert.equal(o.res.gold, 0); assert.deepEqual(o.city.production, ['hinf', 'pike', 'hcav']); assert.equal(o.city.owner, 'A');
  const p = run('pillage');
  assert.equal(p.res.gold, 80); assert.deepEqual(p.city.production, ['hinf', 'pike', 'hcav']); assert.equal(p.city.owner, 'A');     // income x 8, nothing lost
  const s = run('sack');
  assert.equal(s.res.gold, 80 + 120); assert.deepEqual(s.city.production, ['hinf', 'pike']); assert.equal(s.city.owner, 'A');      // + half of Heavy Cavalry's teaching cost (8 x 3 x 10 / 2)
  const z = run('raze');
  assert.equal(z.res.gold, 40); assert.equal(z.city.razed, true); assert.equal(z.city.owner, null); assert.deepEqual(z.city.production, []);   // income x 4
  assert.ok(s.res.gold > p.res.gold && p.res.gold > z.res.gold && z.res.gold > o.res.gold);
});
test('capture outcomes: the screen example (14 gold, 3 kinds) and a city that builds nothing is never worth sacking', () => {
  const rules = E.makeRules();
  const out = E.captureOutcomes({ income: 14, production: ['linf', 'hinf', 'hcav'] }, rules);
  assert.deepEqual([out.occupy.gold, out.pillage.gold, out.sack.gold, out.raze.gold], [0, 112, 232, 56]);   // the mock-up shows +0 / +120 / +260 / +60
  assert.equal(out.sack.kindLost, 'hcav'); assert.deepEqual(out.sack.kinds, ['linf', 'hinf']); assert.equal(out.pillage.kinds.length, 3);
  const empty = E.captureOutcomes({ income: 20, production: [] }, rules);
  assert.ok(empty.sack.gold <= empty.pillage.gold); assert.equal(empty.sack.kindLost, null);
  const bare = E.captureOutcomes({ income: 20, production: [] }, E.makeRules({ sackGoldPerIncome: 30 }));     // even with a bigger sack multiplier
  assert.ok(bare.sack.gold <= bare.pillage.gold);
  // loot follows what is destroyed: a city that loses Griffins gives more than one that loses Light Infantry
  const rich = E.captureOutcomes({ income: 14, production: ['linf', 'grif'] }, rules).sack.gold;
  const poor = E.captureOutcomes({ income: 14, production: ['linf'] }, rules).sack.gold;
  assert.ok(rich > poor);
});
test('later-sequel add-on: a razed city can be rebuilt for 800 gp by an army standing there', () => {
  const g = world();
  E.addCity(g, { id: 'cx', x: 2, y: 1, owner: null, income: 10 });
  g.cities.get('cx').razed = true;
  g.realms.get('A').gold = 900;
  assert.equal(E.rebuildCity(g, 'A', 'cx').reason, 'no-army-on-site');
  E.addArmy(g, 'linf', 'A', 2, 1);
  assert.equal(E.rebuildCity(g, 'A', 'cx').ok, true);
  assert.equal(g.realms.get('A').gold, 100);
  assert.equal(g.cities.get('cx').owner, 'A');
});
test('city defence bonus: player +1 (1-2 types) / +2 (3-4); neutral +1 (3-4) / 0; razed 0; ruins and temples +2; towers +1', () => {
  const mkc = (owner, n, razed = false) => ({ owner, razed, production: ['scout', 'linf', 'hinf', 'pike'].slice(0, n) });
  assert.equal(E.cityDefenceBonus(mkc('A', 2)), 1);
  assert.equal(E.cityDefenceBonus(mkc('A', 3)), 2);
  assert.equal(E.cityDefenceBonus(mkc(null, 4)), 1);
  assert.equal(E.cityDefenceBonus(mkc(null, 2)), 0);
  assert.equal(E.cityDefenceBonus(mkc('A', 4, true)), 0);
  assert.equal(E.siteDefenceBonus('ruin'), 2); assert.equal(E.siteDefenceBonus('temple'), 2); assert.equal(E.siteDefenceBonus('tower'), 1);
});

// ---- heroes -----------------------------------------------------------------------------
test('heroes level up to 9; levels 2-4 at 15, 30 and 60 XP as before, later levels need much more; strength grows slowly after level 4', () => {
  const g = world();
  const h = E.addArmy(g, 'hero', 'A', 1, 1);
  assert.equal(E.heroStrength(h, g.rules), 5); assert.equal(E.heroMove(h, g.rules), 14);
  E.grantXp(h, 15, g.rules); assert.equal(h.level, 2);
  E.grantXp(h, 15, g.rules); assert.equal(h.level, 3);
  E.grantXp(h, 30, g.rules); assert.equal(h.level, 4);
  assert.equal(E.heroStrength(h, g.rules), 8); assert.equal(E.heroMove(h, g.rules), 20);      // today's curve, unchanged to level 4
  const t = g.rules.heroXpThresholds; assert.equal(t.length, 9); assert.equal(g.rules.heroMaxLevel, 9);
  for (let i = 2; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= t[i - 1] - t[i - 2], 'each level needs at least as much more xp as the one before');
  assert.equal(E.xpForNextLevel(h, g.rules), t[4]);
  E.grantXp(h, 10000, g.rules); assert.equal(h.level, 9); assert.equal(E.xpForNextLevel(h, g.rules), null);
  assert.equal(h.perkPoints, 8);                                                             // one perk choice for every level gained
  // strength never grows faster than today's +1 a level, and stays within the cap
  let prev = 0; for (let l = 1; l <= 9; l++) { const s = E.heroLevelStrength(l, g.rules); assert.ok(s - prev <= 1 || l === 1); assert.ok(s <= g.rules.maxBaseStrength); prev = s; }
  assert.equal(E.heroStrength(h, g.rules), 9);
});
test('hero limit is 5, or 6 if you hold more than half the cities', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 0, y: 0, owner: 'A' });
  E.addCity(g, { id: 'c2', x: 1, y: 0, owner: 'B' });
  assert.equal(E.heroLimit(g, 'A'), 5);
  E.addCity(g, { id: 'c3', x: 2, y: 0, owner: 'A' });
  assert.equal(E.heroLimit(g, 'A'), 6);
  g.realms.get('A').gold = 1000;
  for (let i = 0; i < 6; i++) assert.equal(E.hireHero(g, 'A', 'c1', 100).ok, true);
  assert.equal(E.hireHero(g, 'A', 'c1', 100).reason, 'too-many-heroes');
});

// ---- map display --------------------------------------------------------------------------
test('stackViewAt shows the strongest army and a count', () => {
  const g = world();
  E.addArmy(g, 'scout', 'A', 4, 4); E.addArmy(g, 'ele', 'A', 4, 4); E.addArmy(g, 'linf', 'A', 4, 4);
  const v = E.stackViewAt(g, 4, 4);
  assert.equal(v.top.type, 'ele'); assert.equal(v.badge.count, 3);
});

// ---- advisor -------------------------------------------------------------------------------
test('combat advisor: sensible odds, and the same answer every time for the same seed', () => {
  const att = [E.createArmy('hcav', 'A'), E.createArmy('hcav', 'A')];
  const dfn = [E.createArmy('linf', 'B')];
  const o1 = E.estimateOdds({ attackers: att, defenders: dfn, tile: { terrain: 'open' }, rules: E.makeRules() });
  const o2 = E.estimateOdds({ attackers: att, defenders: dfn, tile: { terrain: 'open' }, rules: E.makeRules() });
  assert.deepEqual(o1, o2);
  assert.ok(o1.winChance > 0.95);
});

test('only 8 armies can move or attack together', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, owner: 'A' });
  const ids = Array.from({ length: 9 }, () => E.addArmy(g, 'scout', 'A', 1, 1).id);
  assert.equal(E.moveGroup(g, ids, 2, 1).reason, 'group-too-big');
  E.addArmy(g, 'linf', 'B', 2, 2);
  assert.equal(E.attack(g, ids, 2, 2).reason, 'group-too-big');
  assert.equal(E.moveGroup(g, ids.slice(0, 8), 2, 1).ok, true);
});
