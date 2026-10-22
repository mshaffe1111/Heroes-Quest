import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

function play(turns, hook = null, fog = false) {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 5, width: 110, height: 72, cities: 28, realms: 6 }));
  g.rules.fog = fog;
  if (hook) E.setActionHook(hook);
  try { for (let t = 0; t < turns; t++) { for (const r of E.liveRealms(g)) { E.beginTurn(g, r); E.aiPlay(g, r); } E.endRound(g); } } finally { E.setActionHook(null); }
  return g;
}
const fingerprint = (g) => JSON.stringify([g.rng.getState(), g.turn, [...g.cities.values()].map((c) => [c.id, c.owner, c.razed]), [...g.armies.values()].map((a) => [a.id, a.type, a.owner, a.x, a.y, a.wounded])]);

test('the action feed records moves, fights and captures, and changes nothing (fog off and on)', () => {
  for (const fog of [false, true]) {
    const heard = []; const withHook = play(14, (e) => heard.push(e), fog); const plain = play(14, null, fog);
    assert.equal(fingerprint(withHook), fingerprint(plain), `fog ${fog}: a listener must not change the game`);
    const kinds = new Set(heard.map((e) => e.t));
    for (const k of ['move', 'orders', 'attack', 'capture']) assert.ok(kinds.has(k), `fog ${fog}: saw ${k}`);
    for (const e of heard.filter((x) => x.t === 'move')) { assert.ok(e.realm && e.ids.length && e.types.length === e.ids.length); assert.equal(Math.max(Math.abs(e.from[0] - e.to[0]), Math.abs(e.from[1] - e.to[1])), 1, 'one square at a time'); }
    assert.equal(heard.filter((e) => e.t === 'attack' && e.fought).length, withHook.stats.battles.filter((b) => b.attackers > 0 && b.defenders > 0).length, 'one attack event per fight');
  }
});
test('a listener that throws is ignored, and no hook means no events', () => {
  const a = play(8, () => { throw new Error('boom'); }); const b = play(8);
  assert.equal(fingerprint(a), fingerprint(b));
  assert.equal(E.isRecording(), false);
});
test('a saved game is byte-identical with and without a listener, and loads', () => {
  const withHook = play(6, () => {}); const plain = play(6);
  const a = JSON.stringify(E.saveGame(withHook)); const b = JSON.stringify(E.saveGame(plain));
  assert.equal(a, b, 'the feed must leave nothing in the save');
  assert.ok(E.loadGame(JSON.parse(a)).ok);
});
