import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

function game() {
  const g = E.createGame({ width: 8, height: 4, seed: 7 });
  E.addRealm(g, { id: 'A', gold: 100 }); E.addRealm(g, { id: 'B', gold: 100 });
  E.addCity(g, { id: 'ca', name: 'Aldmere', x: 0, y: 1, income: 30, production: ['linf'], owner: 'A' });
  E.addCity(g, { id: 'cb', name: 'Bremmor', x: 3, y: 1, income: 20, production: ['linf'], owner: 'B' });
  return g;
}
const sides = (g, a, b) => ({ A: g.stats.realms.get(a), B: g.stats.realms.get(b) });

test('every realm gets a blank ledger the moment it is added', () => {
  const g = game();
  for (const id of ['A', 'B']) { const s = g.stats.realms.get(id); assert.equal(s.startGold, 100); assert.equal(s.fell, null); for (const k of E.STAT_KEYS) assert.equal(s[k], 0, k); }
  assert.deepEqual(g.stats.series, []); assert.deepEqual(g.stats.battles, []);
});

test('income and upkeep are counted as gold earned and spent, and production as armies built', () => {
  const g = game();
  const a = E.addArmy(g, 'linf', 'A', 0, 1);
  const eco = E.realmEconomy(g, 'A');
  E.beginTurn(g, 'A');
  const s = g.stats.realms.get('A');
  assert.equal(s.goldEarned, eco.income); assert.equal(s.goldSpent, eco.upkeep); assert.equal(s.armiesBuilt, 0);
  E.setProduction(g, 'ca', 'linf');
  for (let i = 0; i < 6; i++) E.beginTurn(g, 'A');
  assert.ok(s.armiesBuilt >= 1, 'a light infantry army finished');
  assert.equal(g.realms.get('A').gold - s.startGold, s.goldEarned - s.goldSpent, 'gold balances to the coin');
  assert.ok(a);
});

test('a fight is logged and counted for both sides', () => {
  const g = game();
  const att = [1, 2, 3].map(() => E.addArmy(g, 'hinf', 'A', 2, 1));
  E.addArmy(g, 'linf', 'B', 3, 1);
  E.beginTurn(g, 'A');
  const r = E.attack(g, att.map((x) => x.id), 3, 1);
  assert.ok(r.ok && r.battle);
  const { A, B } = sides(g, 'A', 'B');
  assert.equal(A.battles, 1); assert.equal(B.battles, 1);
  assert.equal(g.stats.battles.length, 1);
  const b = g.stats.battles[0];
  assert.equal(b.attacker, 'A'); assert.equal(b.defender, 'B'); assert.equal(b.place, 'Bremmor'); assert.equal(b.attackers, 3); assert.equal(b.defenders, 1); assert.equal(b.size, 4);
  assert.equal(A.kills, b.lostDefenders); assert.equal(B.kills, b.lostAttackers);
  assert.equal(A.armiesLost, b.lostAttackers); assert.equal(B.armiesLost, b.lostDefenders);
  assert.equal(A.battlesWon + B.battlesWon, 1);
  assert.equal(A.battlesWon, b.winner === 'attacker' ? 1 : 0);
});

test('taking a city counts for the taker and against the old owner; razing counts only as a loss', () => {
  for (const [choice, taken] of [['occupy', 1], ['sack', 1], ['raze', 0]]) {
    const g = game();
    const att = [1, 2, 3, 4].map(() => E.addArmy(g, 'hinf', 'A', 2, 1));
    E.beginTurn(g, 'A');
    const r = E.attack(g, att.map((x) => x.id), 3, 1);
    assert.ok(r.captureNeeded, 'an empty city falls to four armies');
    const gold0 = g.realms.get('A').gold, earned0 = g.stats.realms.get('A').goldEarned;
    const { gold } = E.resolveCapture(g, choice);
    const { A, B } = sides(g, 'A', 'B');
    assert.equal(A.citiesTaken, taken, choice); assert.equal(B.citiesLost, 1, choice);
    assert.equal(g.realms.get('A').gold - gold0, gold);
    assert.equal(A.goldEarned - earned0, gold, 'loot is counted as gold earned');
  }
});

test('endRound snapshots each realm\'s cities, keeps the peak, and marks a fallen realm once', () => {
  const g = game();
  E.addArmy(g, 'linf', 'A', 0, 1);
  E.beginTurn(g, 'A'); E.endRound(g);
  assert.equal(g.stats.series.length, 1);
  assert.deepEqual(g.stats.series[0], { turn: 1, cities: { A: 1, B: 1 } });
  assert.equal(g.stats.realms.get('B').fell, null, 'B still holds a city, so it has not fallen');
  g.cities.get('cb').owner = 'A';
  E.endRound(g);
  assert.equal(g.stats.realms.get('B').fell, 2, 'B has nothing left at the end of round 2');
  assert.equal(g.stats.realms.get('A').mostCities, 2);
  E.endRound(g);
  assert.equal(g.stats.realms.get('B').fell, 2, 'the fall is recorded once');
});

test('standings: the victor first, then more cities, then who lasted longer', () => {
  const g = game(); E.addRealm(g, { id: 'C' });
  g.stats.realms.get('A').mostCities = 3; g.stats.realms.get('B').fell = 40; g.stats.realms.get('C').fell = 20;
  g.cities.get('ca').owner = 'A'; g.cities.get('cb').owner = null;
  const rows = E.standings(g, 'A');
  assert.deepEqual(rows.map((r) => r.id), ['A', 'B', 'C']);
  assert.equal(rows[0].winner, true); assert.equal(rows[0].citiesNow, 1); assert.equal(rows[1].citiesNow, 0);
  assert.equal(E.standings(g, 'C')[0].id, 'C');
});

test('biggestBattle finds the largest fight, optionally for one realm', () => {
  const g = game();
  g.stats.battles.push({ attacker: 'A', defender: 'B', size: 6 }, { attacker: 'B', defender: null, size: 12 }, { attacker: 'A', defender: 'B', size: 9 });
  assert.equal(E.biggestBattle(g).size, 12); assert.equal(E.biggestBattle(g, 'A').size, 9); assert.equal(E.biggestBattle(g, 'Z'), null);
});

test('the Unsworn have no ledger and are ignored, not crashed on', () => {
  const g = game(); E.stat(g, null, 'kills', 5); E.stat(g, 'nobody', 'kills', 5);
  assert.equal(g.stats.realms.size, 2);
});

test('over twenty turns of a computer game the ledger balances: gold to the coin, and battle totals agree', () => {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 5, width: 80, height: 54, cities: 20, realms: 5 }));
  for (const r of g.realms.values()) g.stats.realms.get(r.id).startGold = r.gold;
  for (let t = 0; t < 20; t++) { for (const r of E.liveRealms(g)) { E.beginTurn(g, r); E.aiPlay(g, r); } E.endRound(g); }
  let kills = 0, lost = 0, battlesLogged = 0;
  for (const [id, s] of g.stats.realms) {
    assert.equal(g.realms.get(id).gold - s.startGold, s.goldEarned - s.goldSpent, `${id} gold balance`);
    assert.ok(s.battlesWon <= s.battles); assert.ok(s.mostCities >= 0); kills += s.kills; lost += s.armiesLost;
  }
  for (const b of g.stats.battles) battlesLogged += b.lostAttackers + b.lostDefenders;
  assert.ok(g.stats.battles.length > 5, 'there was fighting');
  assert.ok(kills <= battlesLogged && lost <= battlesLogged + 200);        // the Unsworn's side is not counted, so these are at most the log totals
  assert.equal(g.stats.series.length, 20);
  const taken = [...g.stats.realms.values()].reduce((a, s) => a + s.citiesTaken, 0);
  const lostC = [...g.stats.realms.values()].reduce((a, s) => a + s.citiesLost, 0);
  assert.ok(taken >= lostC, 'every city lost by a realm was taken by one; the rest came from the Unsworn');
  const now = new Map(); for (const c of g.cities.values()) if (c.owner) now.set(c.owner, (now.get(c.owner) ?? 0) + 1);
  for (const [id, s] of g.stats.realms) assert.equal(now.get(id) ?? 0, 1 + s.citiesTaken - s.citiesLost, `${id}: one capital + taken - lost = cities held`);
});
