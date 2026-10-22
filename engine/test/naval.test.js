import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { mk, sea } from './helpers.js';

// A strip of map:  x=0 land with coastal city "home" at (0,2), sea x=1..4, x=5 land with enemy coastal city "far" at (5,2)
function coast(extra = {}) {
  const g = E.createGame({ width: 8, height: 6, seed: 3, ...extra });
  E.addRealm(g, { id: 'A', gold: 100 }); E.addRealm(g, { id: 'B', gold: 100 });
  for (let y = 0; y < 6; y++) for (let x = 1; x <= 4; x++) E.setTile(g, x, y, { terrain: 'water' });
  E.addCity(g, { id: 'home', x: 0, y: 2, owner: 'A', production: ['hinf'] });
  E.addCity(g, { id: 'far', x: 5, y: 2, owner: 'B', production: ['hinf'] });
  E.addCity(g, { id: 'inland', x: 7, y: 5, owner: 'A' });
  return g;
}
const ids = (...a) => a.map((x) => x.id);

test('embarking: a group at a coastal city takes to the boats and stops; it sails next turn', () => {
  const g = coast();
  const a = E.addArmy(g, 'hinf', 'A', 0, 2), b = E.addArmy(g, 'orc', 'A', 0, 2);
  assert.equal(E.moveGroup(g, ids(a, b), 1, 2).reason, 'embark-first');     // asked to go over water from a port
  assert.deepEqual(E.embark(g, ids(a, b)), { ok: true });
  assert.ok(a.afloat && b.afloat);
  assert.equal(a.mp, 0); assert.equal(b.mp, 0);
  assert.equal(E.moveGroup(g, ids(a, b), 1, 2).reason, 'no-move-points');   // cannot sail this turn
  E.beginTurn(g, 'A');
  assert.equal(E.moveGroup(g, ids(a, b), 1, 2).ok, true);
  assert.deepEqual([a.x, a.y], [1, 2]);
});
test('embarking is refused away from a coastal city, port or bridge, and for groups that can fly', () => {
  const g = coast();
  const inland = E.addArmy(g, 'hinf', 'A', 7, 5);
  assert.equal(E.embark(g, ids(inland)).reason, 'not-an-embarkation-point');   // city with no water next to it
  const field = E.addArmy(g, 'hinf', 'A', 3, 3);                               // standing in the sea tile is no port either
  assert.equal(E.embark(g, ids(field)).reason, 'not-an-embarkation-point');
  const bat = E.addArmy(g, 'bat', 'A', 0, 2);
  assert.equal(E.embark(g, ids(bat)).reason, 'group-can-fly');
  const again = E.addArmy(g, 'hinf', 'A', 0, 2); E.embark(g, ids(again));
  assert.equal(E.embark(g, ids(again)).reason, 'already-afloat');
});
test('a port (anchor square) is an embarkation point; the same square inland of the water is not', () => {
  const g = coast();
  E.setTile(g, 0, 4, { terrain: 'open', port: true });
  E.setTile(g, 7, 0, { terrain: 'open', port: true });                         // a "port" nowhere near water does nothing
  const a = E.addArmy(g, 'hinf', 'A', 0, 4), b = E.addArmy(g, 'hinf', 'A', 7, 0);
  assert.equal(E.embark(g, ids(a)).ok, true);
  assert.equal(E.embark(g, ids(b)).reason, 'not-an-embarkation-point');
});
test('walkers can never step into open water', () => {
  const g = coast();
  const a = E.addArmy(g, 'hinf', 'A', 0, 0);                                   // plain coast, no port
  assert.equal(E.moveGroup(g, ids(a), 1, 0).reason, 'forbidden-terrain');
});
test('boats sail water at the sea cost, shallows at the shore cost, and cannot step on plain land', () => {
  const g = coast();
  E.setTile(g, 1, 1, { terrain: 'water', shore: true });
  E.setTile(g, 0, 1, { terrain: 'open' });
  const a = E.addArmy(g, 'hinf', 'A', 0, 2); E.embark(g, ids(a)); E.beginTurn(g, 'A');
  const mp0 = a.mp;
  assert.equal(E.moveGroup(g, ids(a), 1, 1).cost, g.rules.terrainCost.shore);
  assert.equal(E.moveGroup(g, ids(a), 2, 1).cost, g.rules.terrainCost.sea);
  assert.equal(a.mp, mp0 - g.rules.terrainCost.shore - g.rules.terrainCost.sea);
  // back next to plain land: no landing there
  E.beginTurn(g, 'A');
  E.moveGroup(g, ids(a), 1, 1);
  assert.equal(E.moveGroup(g, ids(a), 0, 1).reason, 'not-a-landing-point');
});
test('coming ashore at your own coastal city ends the move and puts the armies back on foot', () => {
  const g = coast();
  const a = E.addArmy(g, 'hinf', 'A', 1, 2); a.afloat = true; a.mp = 8;
  const r = E.moveGroup(g, ids(a), 0, 2);
  assert.equal(r.ok, true); assert.equal(r.landed, true);
  assert.equal(a.afloat, false); assert.equal(a.mp, 0);
  E.beginTurn(g, 'A');
  assert.ok(a.mp > 0);
});
test('landing at a port square works the same way', () => {
  const g = coast();
  E.setTile(g, 0, 4, { terrain: 'open', port: true });
  const a = E.addArmy(g, 'hinf', 'A', 1, 4); a.afloat = true; a.mp = 8;
  assert.equal(E.moveGroup(g, ids(a), 0, 4).landed, true);
  assert.equal(a.afloat, false);
});
test('a half-afloat group must be split first', () => {
  const g = coast();
  const a = E.addArmy(g, 'hinf', 'A', 0, 2), b = E.addArmy(g, 'hinf', 'A', 0, 2);
  a.afloat = true;
  assert.equal(E.moveGroup(g, ids(a, b), 0, 3).reason, 'mixed-group');
});
test('afloat armies cost +1 gp upkeep each', () => {
  const g = coast();
  const a = E.addArmy(g, 'hinf', 'A', 0, 2);
  const before = E.realmEconomy(g, 'A').upkeep;
  E.embark(g, ids(a));
  assert.equal(E.realmEconomy(g, 'A').upkeep, before + 1);
});
test('flyers cross the sea with no boat and a hero rides with them', () => {
  const g = coast();
  const p = E.addArmy(g, 'peg', 'A', 0, 2), h = E.addArmy(g, 'hero', 'A', 0, 2);
  assert.equal(E.moveGroup(g, ids(p, h), 1, 2).ok, true);
  assert.equal(p.afloat, false);
});
test('a boat group may attack a coastal city from the water and fights with its LAND strength', () => {
  const g = coast();
  const e = E.addArmy(g, 'ele', 'A', 4, 2); e.afloat = true; e.mp = 16;
  E.addArmy(g, 'linf', 'B', 5, 2);
  const r = E.attack(g, ids(e), 5, 2);
  assert.equal(r.ok, true);
  assert.equal(r.battle.fights[0].attacker.strength, 8);   // elephants keep 8: this is an assault on a city, not a sea fight
  assert.equal(e.afloat, true);                              // a failed or unfinished assault leaves the boats at sea
});
test('capturing a city from the sea lands the survivors there, on foot, with no move left', () => {
  const g = coast();
  const e = E.addArmy(g, 'ele', 'A', 4, 2); e.afloat = true; e.mp = 16;
  const r = E.attack(g, ids(e), 5, 2);                         // empty city: walks in
  assert.equal(r.captureNeeded, true);
  E.resolveCapture(g, 'occupy');
  assert.deepEqual([e.x, e.y], [5, 2]);
  assert.equal(e.afloat, false); assert.equal(e.mp, 0);
  assert.equal(g.cities.get('far').owner, 'A');
});
test('boats fight boats at sea with strength 4, whatever the army is', () => {
  const g = coast();
  const e = E.addArmy(g, 'ele', 'A', 2, 2); e.afloat = true; e.mp = 16;
  const d = E.addArmy(g, 'hinf', 'B', 3, 2); d.afloat = true;
  const r = E.attack(g, ids(e), 3, 2);
  assert.equal(r.battle.fights[0].attacker.strength, g.rules.navyStrength);
  assert.equal(r.battle.fights[0].defender.strength, g.rules.navyStrength);
});
test('a walker cannot attack boats out at sea', () => {
  const g = coast();
  const w = E.addArmy(g, 'hinf', 'A', 0, 2);
  const d = E.addArmy(g, 'hinf', 'B', 1, 2); d.afloat = true;
  assert.equal(E.attack(g, ids(w), 1, 2).reason, 'forbidden-terrain');
});

// ---- bridges: a water square with a deck --------------------------------------------------------------------------
function strait() {
  const g = E.createGame({ width: 9, height: 3, seed: 4 });
  E.addRealm(g, { id: 'A', gold: 100 }); E.addRealm(g, { id: 'B', gold: 100 });
  for (let x = 3; x <= 5; x++) E.setTile(g, x, 1, { terrain: 'water' });
  for (let x = 3; x <= 5; x++) E.setTile(g, x, 0, { terrain: 'water' }), E.setTile(g, x, 2, { terrain: 'water' });
  for (let x = 3; x <= 5; x++) E.setTile(g, x, 1, { terrain: 'water', bridge: true });   // the deck
  return g;
}
test('a bridge deck is walkable at road cost for walkers', () => {
  const g = strait();
  const a = E.addArmy(g, 'hinf', 'A', 2, 1);
  const mp0 = a.mp;
  for (let x = 3; x <= 6; x++) assert.equal(E.moveGroup(g, ids(a), x, 1).ok, true);
  assert.equal(a.mp, mp0 - 3 * g.rules.terrainCost.road - g.rules.terrainCost.open);
  assert.equal(a.afloat, false);
});
test('walkers cannot step off the deck into the water beside it, but can embark from the deck first', () => {
  const g = strait();
  const a = E.addArmy(g, 'hinf', 'A', 4, 1);
  assert.equal(E.moveGroup(g, ids(a), 4, 0).reason, 'embark-first');
  assert.equal(E.embark(g, ids(a)).ok, true);
  E.beginTurn(g, 'A');
  assert.equal(E.moveGroup(g, ids(a), 4, 0).ok, true);       // now sailing under / beside the bridge
});
test('boats pass under a bridge deck and stay afloat; they come ashore only by choosing to disembark on it', () => {
  const g = strait();
  const a = E.addArmy(g, 'hinf', 'A', 4, 0); a.afloat = true; a.mp = 8;
  assert.equal(E.moveGroup(g, ids(a), 4, 1).landed, false);
  assert.equal(a.afloat, true);
  assert.deepEqual(E.disembark(g, ids(a)), { ok: true });
  assert.equal(a.afloat, false); assert.equal(a.mp, 0);
  assert.equal(E.disembark(g, ids(a)).reason, 'not-afloat');
});
test('a fight on a bridge deck is a land fight (road), not a sea fight', () => {
  const g = strait();
  const e = E.addArmy(g, 'ele', 'A', 4, 0); e.afloat = true; e.mp = 16;
  E.addArmy(g, 'linf', 'B', 4, 1);
  const r = E.attack(g, ids(e), 4, 1);
  assert.equal(r.battle.fights[0].attacker.strength, 8);
});
test('flying groups ignore all of it', () => {
  const g = strait();
  const p = E.addArmy(g, 'grif', 'A', 2, 1);
  assert.equal(E.moveGroup(g, ids(p), 3, 0).ok, true);
  assert.equal(E.embark(g, ids(p)).reason, 'group-can-fly');
});
