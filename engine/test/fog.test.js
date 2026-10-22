import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

function game(fog = true) {
  const g = E.createGame({ width: 30, height: 10, seed: 5, rules: { fog } });
  E.addRealm(g, { id: 'A', gold: 500 }); E.addRealm(g, { id: 'B', gold: 500 });
  E.addCity(g, { id: 'ca', name: 'Aldmere', x: 2, y: 5, income: 30, production: ['linf'], owner: 'A' });
  E.addCity(g, { id: 'cb', name: 'Bremmor', x: 20, y: 5, income: 20, production: ['linf'], owner: 'B' });
  return g;
}
const has = (g, id, x, y) => E.isExplored(g, id, x, y);

test('fog off: everything is explored and every city is known live', () => {
  const g = game(false);
  assert.ok(has(g, 'A', 29, 9)); const k = E.knownCity(g, 'A', g.cities.get('cb'));
  assert.deepEqual({ owner: k.owner, live: k.live }, { owner: 'B', live: true });
  assert.equal(E.fogView(g, 'A').on, false);
});

test('fog on: a realm starts knowing only the ground around its own cities and armies', () => {
  const g = game(); const a = E.addArmy(g, 'scout', 'A', 2, 5);
  E.beginTurn(g, 'A');
  assert.ok(has(g, 'A', 2, 5) && has(g, 'A', 6, 5), 'a city sees 4 squares');
  assert.ok(!has(g, 'A', 8, 5), 'but not 6');
  assert.ok(!has(g, 'A', 20, 5), 'and nothing of the far side');
  assert.equal(E.knownCity(g, 'A', g.cities.get('cb')), null, 'Bremmor has never been seen');
  assert.ok(a);
});

test('sight: scouts 5, flyers, heroes, cities and boats 4, everyone else 3', () => {
  const g = game(); const s = (t, extra) => E.sightOf(E.addArmy(g, t, 'A', 2, 5, extra));
  assert.equal(s('scout'), 5); assert.equal(s('hero'), 4); assert.equal(s('peg'), 4); assert.equal(s('pike'), 3); assert.equal(s('lcav'), 3);
  assert.equal(s('pike', { afloat: true }), 4);
});

test('exploring uncovers ground for good; leaving does not cover it again', () => {
  const g = game(); const s = E.addArmy(g, 'scout', 'A', 2, 5); E.beginTurn(g, 'A');
  let x = 2; while (x < 12) { const r = E.moveGroup(g, [s.id], x + 1, 5); if (!r.ok) break; x++; }
  assert.ok(x >= 8, 'the scout got somewhere'); assert.ok(has(g, 'A', x + 5, 5), 'it sees 5 ahead');
  s.x = 2; s.y = 5; assert.ok(has(g, 'A', x + 5, 5), 'still explored after it has gone back');
  const vis = E.fogView(g, 'A').visible; assert.ok(!vis.has(E.tileIndex(g, x + 5, 5)), 'but no longer in sight');
});

test('a city out of sight shows who held it and when; it updates the moment it is seen again', () => {
  const g = game(); const s = E.addArmy(g, 'scout', 'A', 17, 5); E.beginTurn(g, 'A');
  s.mp = 99; E.moveGroup(g, [s.id], 18, 5);
  let k = E.knownCity(g, 'A', g.cities.get('cb'));
  assert.equal(k.owner, 'B'); assert.equal(k.live, true);
  s.x = 5; s.y = 5;                                              // the scout goes home
  g.cities.get('cb').owner = 'C'; g.turn = 9;                       // meanwhile Bremmor changes hands
  k = E.knownCity(g, 'A', g.cities.get('cb'));
  assert.equal(k.owner, 'B', 'A still believes it is B\'s'); assert.equal(k.live, false); assert.equal(k.turn, 1);
  s.x = 17; s.y = 5; E.refreshFog(g, 'A'); k = E.knownCity(g, 'A', g.cities.get('cb'));
  assert.equal(k.owner, 'C'); assert.equal(k.live, true); assert.equal(k.turn, 9);
});

test('enemy armies show only within sight; your own always do', () => {
  const g = game(); const mine = E.addArmy(g, 'pike', 'A', 10, 5); const near = E.addArmy(g, 'pike', 'B', 12, 5), far = E.addArmy(g, 'pike', 'B', 16, 5);
  E.beginTurn(g, 'A'); const ids = new Set(E.fogView(g, 'A').armies.map((a) => a.id));
  assert.ok(ids.has(mine.id) && ids.has(near.id) && !ids.has(far.id));
});

test('the computer plays fair: over a fogged game it sends scouts, nobody finds the whole map in 30 turns, and it breaks no rule', () => {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 4, width: 60, height: 40, cities: 16, realms: 4 }));
  g.rules.fog = true;
  for (let t = 0; t < 30; t++) {
    for (const r of E.liveRealms(g)) { E.beginTurn(g, r); E.aiPlay(g, r); }
    E.endRound(g);
  }
  let scouts = 0, rejected = 0, moves = 0;
  for (const [id, st] of Object.entries(g.ai)) { scouts += st.stats.scouts ?? 0; rejected += st.stats.rejected; moves += st.stats.moves + st.stats.attacks; assert.ok(E.exploredCount(g, id) < g.width * g.height, 'nobody has seen the whole map'); }
  assert.ok(scouts >= 4, `scouts sent: ${scouts}`); assert.ok(rejected <= 0.08 * moves + 3, `${rejected} rejected of ${moves}`);
  for (const r of g.realms.values()) assert.ok(Number.isFinite(r.gold));
});
