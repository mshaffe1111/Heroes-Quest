import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

function play(shape, seed, turns) {
  const { game: g } = E.mapToGame(generateMap({ shape, seed, width: 110, height: 72, cities: 28, realms: 6 }));
  for (let t = 0; t < turns; t++) { for (const r of E.liveRealms(g)) { E.beginTurn(g, r); E.aiPlay(g, r); } E.endRound(g); }
  return g;
}
const owners = (g) => [...g.cities.values()].map((c) => c.owner ?? '-').join(',');

function invariants(g) {
  const perTile = new Map();
  for (const a of g.armies.values()) {
    if (a.x == null) continue;
    const t = E.tileAt(g, a.x, a.y); const k = `${a.x},${a.y}`; (perTile.get(k) ?? perTile.set(k, []).get(k)).push(a);
    const fly = E.groupCanFly(E.armiesAt(g, a.x, a.y).filter((q) => q.owner === a.owner));      // a hero with a flight item carries his whole group (over mountains too)
    if (!fly && !a.afloat) assert.ok(t.terrain !== 'water' || t.bridge || t.cityId, `${a.type} on foot in open water at ${k}`);
    if (!fly && t.terrain === 'mountain') assert.fail(`${a.type} on a mountain at ${k}`);
    if (a.afloat) assert.ok(t.terrain === 'water' || E.isEmbarkPoint(g, a.x, a.y), `afloat ${a.type} on land at ${k}`);
    assert.ok(Number.isFinite(a.mp) && a.mp >= 0);
  }
  for (const [k, list] of perTile) {
    const [x, y] = k.split(',').map(Number); assert.ok(list.length <= E.armyLimitAt(g, x, y), `stack of ${list.length} at ${k}`);
    assert.equal(new Set(list.map((a) => a.owner)).size, 1, `mixed owners at ${k}`);
  }
  for (const r of g.realms.values()) assert.ok(Number.isFinite(r.gold));
}

test('computer warlords: ten turns on a map play out legally, take neutral cities and fight', () => {
  const g = play('continent', 3, 10);
  invariants(g);
  const neutral = [...g.cities.values()].filter((c) => !c.owner && !c.razed).length;
  assert.ok(neutral <= 28 - 6 - 5, `only ${28 - 6 - neutral} cities were taken`);
  const s = Object.values(g.ai).map((x) => x.stats); const sum = (k) => s.reduce((a, x) => a + x[k], 0);
  assert.ok(sum('captures') >= 4); assert.ok(sum('attacks') >= sum('captures'));
  assert.ok(sum('rejected') <= 0.06 * (sum('moves') + sum('attacks')) + 2, `${sum('rejected')} rejected of ${sum('moves')} moves`);
});
test('computer warlords cross the sea by boat on an island map, and never break the movement rules', () => {
  const g = play('archipelago', 3, 14);
  invariants(g);
  const embarks = Object.values(g.ai).reduce((a, x) => a + x.stats.embarks, 0); assert.ok(embarks >= 3, `${embarks} embarkations`);
});
test('the same seed gives the same game', () => {
  assert.equal(owners(play('continent', 5, 6)), owners(play('continent', 5, 6)));
});
test('victor: more than half the cities wins; liveRealms drops a realm with nothing left', () => {
  const g = E.createGame({ width: 6, height: 6 }); E.addRealm(g, { id: 'A' }); E.addRealm(g, { id: 'B' });
  E.addCity(g, { id: 'c1', x: 0, y: 0, owner: 'A' }); E.addCity(g, { id: 'c2', x: 2, y: 0, owner: 'B' }); E.addCity(g, { id: 'c3', x: 4, y: 0, owner: 'A' });
  assert.equal(E.victor(g), 'A'); g.cities.get('c3').owner = null; assert.equal(E.victor(g), null);
  g.cities.get('c2').owner = null; assert.deepEqual(E.liveRealms(g), ['A']);
});
test('active neutrals start producing defenders after they beat off an attack (up to five)', () => {
  const g = E.createGame({ width: 6, height: 3, seed: 2 }); E.addRealm(g, { id: 'A' });
  E.addCity(g, { id: 'n', x: 3, y: 1, owner: null, production: ['hinf', 'pike'] }); g.cities.get('n').active = true;
  E.addArmy(g, 'hinf', null, 3, 1); const w = E.addArmy(g, 'scout', 'A', 2, 1);
  g.rng = { next: () => 0.1, int: (() => { const v = [1, 20, 1, 20]; let i = 0; return () => v[i++ % 4]; })() };      // the attacker loses
  E.attack(g, [w.id], 3, 1); assert.equal(g.cities.get('n').provoked, true);
  for (let i = 0; i < 8; i++) E.neutralTurn(g);
  assert.equal(E.armiesAt(g, 3, 1).length, 5);
});

// ---- difficulty levels ------------------------------------------------------------------------------------------------
function playLevels(seed, turns, levelOf) {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed, width: 110, height: 72, cities: 28, realms: 6 }));
  [...g.realms.keys()].forEach((id, i) => E.setDifficulty(g, id, levelOf(i)));
  for (let t = 0; t < turns; t++) { for (const r of E.liveRealms(g)) { E.beginTurn(g, r); E.aiPlay(g, r); } E.endRound(g); }
  return g;
}
test('difficulty: four levels; only judgement knobs differ, never gold, armies or rules; Medium is the plain AI', () => {
  assert.deepEqual(E.LEVELS, ['easy', 'medium', 'hard', 'expert']);
  assert.deepEqual(E.DIFFICULTY.medium, {});
  for (const lv of E.LEVELS) for (const k of Object.keys(E.DIFFICULTY[lv])) assert.ok(k in E.AI_SETTINGS, `${lv}.${k} is not an AI knob`);
  const g = E.createGame({ width: 4, height: 4 }); E.addRealm(g, { id: 'A' });
  assert.throws(() => E.setDifficulty(g, 'A', 'nightmare')); E.setDifficulty(g, 'A', 'hard'); assert.equal(g.realms.get('A').difficulty, 'hard');
  assert.equal(g.realms.get('A').gold, g.rules.startGold);
});
test('difficulty: a realm with no level plays exactly like one set to Medium', () => {
  const plain = play('continent', 4, 8); const med = playLevels(4, 8, () => 'medium');
  assert.equal(owners(plain), owners(med));
});
test('difficulty: every level plays legally and the same seed gives the same game', () => {
  for (const lv of E.LEVELS) { const g = playLevels(6, 8, () => lv); invariants(g); assert.equal(owners(g), owners(playLevels(6, 8, () => lv)), lv); }
});
test('difficulty: Easy sometimes stays home with spare soldiers; Medium never does', () => {
  const idled = (g) => Object.values(g.ai).reduce((a, x) => a + (x.stats.idled ?? 0), 0);
  assert.ok(idled(playLevels(2, 12, () => 'easy')) >= 3); assert.equal(idled(playLevels(2, 12, () => 'medium')), 0);
});

test('a battle listener hears every fight with who attacked whom, and cannot change the outcome', () => {
  const heard = [];
  E.setBattleHook((b) => { heard.push(b); throw new Error('a listener that blows up must not matter'); });
  try {
    const g = play('continent', 5, 12);
    const fights = g.stats.battles.length;
    assert.ok(fights > 0, 'the computer realms fought');
    assert.equal(heard.length, g.stats.battles.filter((b) => b.attackers > 0 && b.defenders > 0).length);
    for (const b of heard) { assert.ok(b.result.battle && b.attacker && b.attacker !== b.defender); assert.ok(Number.isInteger(b.x) && Number.isInteger(b.y)); }
  } finally { E.setBattleHook(null); }
  const plain = play('continent', 5, 12);
  assert.equal(plain.stats.battles.length > 0, true);
});
