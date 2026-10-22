import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';

function game(gold = 5000) {
  const g = E.createGame({ width: 10, height: 4, seed: 3 });
  E.addRealm(g, { id: 'A', gold }); E.addRealm(g, { id: 'B', gold });
  E.addCity(g, { id: 'ca', name: 'Aldmere', x: 0, y: 1, income: 30, production: ['linf', 'pike'], owner: 'A' });
  E.addCity(g, { id: 'cb', name: 'Bremmor', x: 5, y: 1, income: 20, production: ['linf', 'pike'], owner: 'B' });
  return g;
}
const own = (g, id, ...keys) => { for (const k of keys) assert.ok(E.buyDoctrine(g, id, k).ok, k); };

test('twelve doctrines in four groups, each with a base price', () => {
  assert.equal(E.DOCTRINE_KEYS.length, 12);
  assert.deepEqual([...new Set(E.DOCTRINE_KEYS.map((k) => E.DOCTRINES[k].group))].sort(), ['Army', 'Cities', 'Heroes', 'Sea and siege']);
  for (const k of E.DOCTRINE_KEYS) assert.ok(E.DOCTRINES[k].base >= 350 && E.DOCTRINES[k].text.length > 10);
});

test('each doctrine owned makes the next 25% dearer, to the nearest 5 (the approved screen: 2 owned = 56% above base)', () => {
  const g = game();
  assert.equal(E.doctrinePrice(g, 'A', 'tax'), 500);
  own(g, 'A', 'drilled');                                       // 400
  assert.equal(E.doctrinePrice(g, 'A', 'tax'), 625);
  own(g, 'A', 'walls');                                         // 750 at 1.25 owned... walls base 600 * 1.25 = 750
  assert.equal(E.doctrinePrice(g, 'A', 'tax'), 780);            // 500 * 1.5625 = 781.25
  assert.equal(E.doctrinePrice(g, 'A', 'sappers'), 940);        // 600 * 1.5625 = 937.5 -> 940
  assert.equal(E.doctrinePrice(g, 'B', 'tax'), 500, 'the other realm is unaffected');
  assert.equal(g.realms.get('A').gold, 5000 - 400 - 750);
});

test('buying checks gold, ownership and the name', () => {
  const g = game(300);
  assert.deepEqual(E.buyDoctrine(g, 'A', 'tax'), { ok: false, reason: 'not-enough-gold', price: 500 });
  assert.equal(E.buyDoctrine(g, 'A', 'nope').reason, 'no-such-doctrine');
  g.realms.get('A').gold = 5000; own(g, 'A', 'tax');
  assert.equal(E.buyDoctrine(g, 'A', 'tax').reason, 'already-owned');
  assert.equal(g.stats.realms.get('A').goldSpent, 500); assert.deepEqual(g.stats.realms.get('A').doctrines, [{ key: 'tax', turn: 1, price: 500 }]);
});

test('Drilled Ranks: Seasoned after 3 duels won, only for the owner', () => {
  const g = game(); own(g, 'A', 'drilled');
  const a = E.addArmy(g, 'pike', 'A', 1, 1), b = E.addArmy(g, 'pike', 'B', 6, 1);
  a.duelsWon = 3; b.duelsWon = 3;
  assert.equal(E.rankOf(a, g.rules), 1); assert.equal(E.rankOf(b, g.rules), 0);
  a.duelsWon = 9; assert.equal(E.rankOf(a, g.rules), 1); a.duelsWon = 10; assert.equal(E.rankOf(a, g.rules), 2);
});

test('Long March: +2 move points for foot armies only', () => {
  const g = game(); own(g, 'A', 'march');
  const pike = E.addArmy(g, 'pike', 'A', 1, 1), cav = E.addArmy(g, 'hcav', 'A', 1, 1), enemy = E.addArmy(g, 'pike', 'B', 6, 1);
  assert.equal(E.moveOf(pike, g.rules), 10); assert.equal(E.moveOf(cav, g.rules), 16); assert.equal(E.moveOf(enemy, g.rules), 8);
  E.beginTurn(g, 'A'); assert.equal(pike.mp, 10);
});

test('Field Hospitals: 3 pips a turn in your own cities', () => {
  for (const [doc, healed] of [[false, 2], [true, 3]]) {
    const g = game(); if (doc) own(g, 'A', 'hospitals');
    const a = E.addArmy(g, 'hinf', 'A', 0, 1); a.wounded = 3;
    E.beginTurn(g, 'A'); assert.equal(a.wounded, 3 - healed);
  }
});

test("Hero's Call and Heraldry", () => {
  const g = game(); const full = E.heroHireCost(g, 'A');
  own(g, 'A', 'call'); assert.equal(E.heroHireCost(g, 'A'), Math.round(full * 0.6)); assert.equal(E.heroHireCost(g, 'B'), full);
  const h = E.addArmy(g, 'hero', 'A', 1, 1), hb = E.addArmy(g, 'hero', 'B', 6, 1);
  assert.equal(E.battleXpFor(g.rules, h), 1); own(g, 'A', 'heraldry');
  assert.equal(E.battleXpFor(g.rules, h), 2); assert.equal(E.battleXpFor(g.rules, hb), 1);
});

test('Stone Walls adds 1 for the owner; Sapper Corps takes 1 off for the attacker; neither touches open ground', () => {
  const g = game();
  const base = E.tileDefenceBonus(g, 5, 1);
  own(g, 'B', 'walls'); assert.equal(E.tileDefenceBonus(g, 5, 1), base + 1);
  own(g, 'A', 'sappers'); assert.equal(E.tileDefenceBonus(g, 5, 1, 'A'), base, 'sappers cancel the walls');
  assert.equal(E.tileDefenceBonus(g, 5, 1, 'B'), base + 1, 'it is the attacker who needs the sappers');
  assert.equal(E.tileDefenceBonus(g, 0, 1, 'A'), E.tileDefenceBonus(g, 0, 1), 'sappers do not weaken your own city');
  assert.equal(E.tileDefenceBonus(g, 3, 3), 0);
});

test('Hold the Line: a stack that just ordered defend gets its camp bonus at once; without it, only after a full turn', () => {
  const dBonus = (doc, camped) => {
    const g = game(); if (doc) own(g, 'B', 'line');
    const att = [1, 2, 3].map(() => E.addArmy(g, 'hinf', 'A', 2, 1));
    const d = E.addArmy(g, 'pike', 'B', 3, 1); E.defend(g, [d.id]); d.camped = camped;
    return E.attack(g, att.map((x) => x.id), 3, 1).battle.fights[0].stackBonus.defender;
  };
  assert.equal(dBonus(false, false), 0, 'ordered to defend, but not yet camped');
  assert.equal(dBonus(false, true), 1, 'a full turn camped gives +1');
  assert.equal(dBonus(true, false), 1, 'Hold the Line gives it at once');
});

test('Quick Muster: cheap armies take a turn less (never under one); dear ones are unchanged', () => {
  const g = game(); const pike = E.ARMIES.pike, linf = E.ARMIES.linf, hcav = E.ARMIES.hcav;
  assert.equal(E.buildTurns(g.rules, 'A', pike), 3);
  own(g, 'A', 'muster');
  assert.equal(E.buildTurns(g.rules, 'A', pike), 2); assert.equal(E.buildTurns(g.rules, 'A', linf), 1); assert.equal(E.buildTurns(g.rules, 'A', hcav), 3);
  assert.equal(E.buildTurns(g.rules, 'B', pike), 3);
  E.setProduction(g, 'ca', 'pike'); E.beginTurn(g, 'A'); assert.equal([...g.armies.values()].length, 0);
  E.beginTurn(g, 'A'); assert.equal([...g.armies.values()].filter((a) => a.type === 'pike').length, 1, 'pikemen ready in 2 turns');
});

test('Quartermasters, Tax Reform and Sea Lords change the money', () => {
  const g = game(); E.addArmy(g, 'hcav', 'A', 0, 1); E.addArmy(g, 'hcav', 'B', 5, 1);
  const n = E.realmEconomy(g, 'A'); assert.equal(n.upkeep, 4);
  own(g, 'A', 'quarter'); assert.equal(E.realmEconomy(g, 'A').upkeep, 3, '8g × 40% = 3');
  own(g, 'A', 'tax'); assert.equal(E.realmEconomy(g, 'A').income, n.income + 4);
  assert.equal(E.realmEconomy(g, 'B').upkeep, 4);
  const boat = E.addArmy(g, 'pike', 'A', 1, 1); boat.afloat = true;
  const afloat = E.armyUpkeep(boat, g.rules); own(g, 'A', 'sea');
  assert.equal(E.armyUpkeep(boat, g.rules), afloat - g.rules.navalUpkeepExtra);
});

test('Sea Lords: boats fight at strength 5 at sea', () => {
  const g = game(); const boat = E.addArmy(g, 'pike', 'A', 1, 1);
  const ctx = { rules: g.rules, seaBattle: true, letters: '' }; const bonus = { total: 0 };
  assert.equal(E.armyStrength(boat, bonus, [], ctx), g.rules.navyStrength);
  own(g, 'A', 'sea'); assert.equal(E.armyStrength(boat, bonus, [], ctx), 5);
  assert.equal(E.armyStrength(E.addArmy(g, 'pike', 'B', 6, 1), bonus, [], ctx), g.rules.navyStrength);
});

test('computer realms buy doctrines, one a turn, keep their reserve, and never go broke doing it', () => {
  const g = game(3000);
  const k = { ...E.AI_SETTINGS, docReserve: 600 };
  assert.equal(E.chooseDoctrine(g, 'A', k), 'tax');                         // 3000 - 500 = 2500
  assert.equal(E.chooseDoctrine(g, 'A', k), 'drilled');                     // 400 × 1.25 = 500 -> 2000 left
  const left = g.realms.get('A').gold;
  while (E.chooseDoctrine(g, 'A', k)) { /* buy until the reserve stops it */ }
  assert.ok(g.realms.get('A').gold >= 600, 'reserve kept'); assert.ok(g.realms.get('A').gold < left);
  assert.ok(E.doctrineCount(g, 'A') >= 3);
  const poor = game(700); assert.equal(E.chooseDoctrine(poor, 'A', k), null);
});
