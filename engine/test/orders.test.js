import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';

function game() {
  const g = E.createGame({ width: 20, height: 6, seed: 4 });
  E.addRealm(g, { id: 'A', gold: 500, human: true }); E.addRealm(g, { id: 'B', gold: 500 });
  E.addCity(g, { id: 'ca', name: 'Aldmere', x: 1, y: 2, income: 30, production: ['linf'], owner: 'A' });
  E.addCity(g, { id: 'cb', name: 'Bremmor', x: 18, y: 2, income: 20, production: ['linf'], owner: 'B' });
  return g;
}

test('Done rests an army for this turn only', () => {
  const g = game(); const a = E.addArmy(g, 'pike', 'A', 3, 2), b = E.addArmy(g, 'linf', 'A', 4, 2); E.beginTurn(g, 'A');
  assert.deepEqual(E.idleArmies(g, 'A').map((x) => x.id), [a.id, b.id]);
  assert.ok(E.markDone(g, 'A', [a.id]).ok); assert.deepEqual(E.idleArmies(g, 'A').map((x) => x.id), [b.id]);
  E.beginTurn(g, 'A'); assert.equal(a.done, false); assert.equal(E.idleArmies(g, 'A').length, 2, 'back in the queue next turn');
  assert.equal(E.markDone(g, 'B', [a.id]).reason, 'not-your-armies');
});

test('nextIdle walks the queue in a steady order, wraps, and runs out when everyone is done', () => {
  const g = game(); const ids = [1, 2, 3].map(() => E.addArmy(g, 'linf', 'A', 5, 2).id); E.beginTurn(g, 'A');
  assert.equal(E.nextIdle(g, 'A').id, ids[0]); assert.equal(E.nextIdle(g, 'A', ids[0]).id, ids[1]); assert.equal(E.nextIdle(g, 'A', ids[2]).id, ids[0]);
  E.markDone(g, 'A', ids); assert.equal(E.nextIdle(g, 'A'), null);
});

test('Fortify holds the ground over turns and camps; moving or Wake up ends it', () => {
  const g = game(); const a = E.addArmy(g, 'pike', 'A', 5, 2); E.beginTurn(g, 'A');
  assert.ok(E.fortify(g, 'A', [a.id]).ok); assert.equal(a.fortified, true); assert.equal(a.defending, true);
  E.beginTurn(g, 'A'); E.beginTurn(g, 'A');
  assert.equal(a.fortified, true, 'still fortified two turns on'); assert.equal(a.camped, true); assert.equal(E.idleArmies(g, 'A').length, 0, 'fortified armies are not in the queue');
  E.wakeUp(g, 'A', [a.id]); assert.equal(a.fortified, false); assert.equal(E.idleArmies(g, 'A').length, 1);
  E.fortify(g, 'A', [a.id]); E.moveGroup(g, [a.id], 6, 2); assert.equal(a.fortified, false); assert.equal(a.camped, false);
  const boat = E.addArmy(g, 'pike', 'A', 5, 3); boat.afloat = true; assert.equal(E.fortify(g, 'A', [boat.id]).reason, 'afloat');
});

test('a fortified army wakes when an enemy comes within 3 squares, and not before', () => {
  const g = game(); const a = E.addArmy(g, 'pike', 'A', 5, 2); const e = E.addArmy(g, 'pike', 'B', 10, 2);
  E.beginTurn(g, 'A'); E.fortify(g, 'A', [a.id]);
  e.x = 9; E.beginTurn(g, 'A'); assert.equal(a.fortified, true, '4 squares away: sleeps on');
  e.x = 8; const ev = E.beginTurn(g, 'A'); assert.equal(a.fortified, false); assert.deepEqual(ev.find((x) => x.type === 'woke').armies, [a.id]);
});

test('the wake rule works the same under fog (an army sees as far as it wakes)', () => {
  const g = game(); g.rules.fog = true; const a = E.addArmy(g, 'pike', 'A', 8, 2); const e = E.addArmy(g, 'pike', 'B', 11, 2);
  E.beginTurn(g, 'A'); E.fortify(g, 'A', [a.id]);
  E.beginTurn(g, 'A'); assert.equal(a.fortified, false, 'a pikeman sees 3 squares, so an enemy at 3 is seen and wakes it');
  e.x = 13; E.fortify(g, 'A', [a.id]); E.beginTurn(g, 'A'); assert.equal(a.fortified, true, 'at 5 squares it is out of sight and out of range');
});

test('Disband removes armies for good, saves their upkeep, counts in the ledger, and refuses heroes and other realms\' armies', () => {
  const g = game(); const a = E.addArmy(g, 'hcav', 'A', 3, 2), b = E.addArmy(g, 'hcav', 'A', 3, 2), h = E.addArmy(g, 'hero', 'A', 3, 2), foe = E.addArmy(g, 'hcav', 'B', 12, 2);
  const before = E.realmEconomy(g, 'A').upkeep;
  assert.equal(E.disband(g, 'A', [h.id]).reason, 'cannot-disband-hero'); assert.equal(E.disband(g, 'A', [foe.id]).reason, 'not-your-armies');
  assert.deepEqual(E.disband(g, 'A', [a.id, b.id]), { ok: true, count: 2 });
  assert.equal(g.armies.has(a.id), false); assert.equal(E.realmEconomy(g, 'A').upkeep, before - 8); assert.equal(g.stats.realms.get('A').armiesDisbanded, 2);
});

test('Concede ends the game for a human, drops the realm from play, and the status says why', () => {
  const g = game(); E.addArmy(g, 'pike', 'A', 3, 2); E.addArmy(g, 'pike', 'B', 12, 2);
  assert.deepEqual(E.gameStatus(g), { over: false, reason: null, victor: null, realm: null });
  g.turn = 9; assert.ok(E.concede(g, 'A').ok);
  assert.deepEqual(E.gameStatus(g), { over: true, reason: 'conceded', victor: null, realm: 'A' });
  assert.equal(E.liveRealms(g).includes('A'), false); assert.equal(g.stats.realms.get('A').fell, 9);
  assert.equal(E.concede(g, 'A').reason, 'already-conceded'); assert.equal(E.concede(g, 'Z').reason, 'no-such-realm');
});

test('game status: victory with more than half the cities, elimination of the human', () => {
  const g = game(); E.addCity(g, { id: 'cc', name: 'C', x: 10, y: 2, income: 10, production: [], owner: 'A' });
  assert.deepEqual(E.gameStatus(g), { over: true, reason: 'victory', victor: 'A', realm: 'A' });
  const h = game(); h.cities.get('ca').owner = 'B';
  assert.equal(E.gameStatus(h).reason, 'victory', 'B now holds both cities');
  const k = game(); k.cities.get('ca').owner = null; E.addCity(k, { id: 'cx', name: 'X', x: 8, y: 2, owner: 'B' }); E.addCity(k, { id: 'cy', name: 'Y', x: 9, y: 2, owner: null });
  E.addCity(k, { id: 'cz', name: 'Z', x: 9, y: 3, owner: null });
  assert.deepEqual(E.gameStatus(k), { over: true, reason: 'eliminated', victor: null, realm: 'A' });
});

test('a conceded game still saves and loads', () => {
  const g = game(); E.concede(g, 'A'); const r = E.importSave(E.exportSave(E.saveGame(g))); assert.ok(r.ok); assert.equal(E.gameStatus(r.game).reason, 'conceded');
});
