import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

const fresh = (seed = 6, fog = false) => {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed, width: 60, height: 40, cities: 16, realms: 4 }));
  g.rules.fog = fog; g.realms.get([...g.realms.keys()][0]).human = true; return g;
};
const turn = (g) => { for (const r of E.liveRealms(g)) { E.beginTurn(g, r); if (!g.realms.get(r).human) E.aiPlay(g, r); } E.endRound(g); };
const print = (g) => JSON.stringify([[...g.cities.values()].map((c) => c.owner ?? '-').join(''), [...g.realms.values()].map((r) => r.gold), g.armies.size, g.turn, g.rng.next()]);
const round = (g) => { const r = E.importSave(E.exportSave(E.saveGame(g))); assert.ok(r.ok, r.reason); return r.game; };

test('encode and decode keep Maps, Sets, shared objects and odd numbers; caches (_) are left out', () => {
  const shared = { n: 1 }; const root = { m: new Map([['a', shared], ['b', new Set([1, 2])]]), arr: [shared, shared], big: Infinity, nan: NaN, _cache: { x: 1 }, nested: { s: new Set([shared]) } };
  const back = E.decode(JSON.parse(JSON.stringify(E.encode(root))));
  assert.equal(back.m.get('a'), back.arr[0]); assert.equal(back.arr[0], back.arr[1]); assert.equal(back.nested.s.values().next().value, back.arr[0]);
  assert.deepEqual([...back.m.get('b')], [1, 2]); assert.equal(back.big, Infinity); assert.ok(Number.isNaN(back.nan)); assert.equal('_cache' in back, false);
});

test('a loaded game is the same game: realms, cities, armies, gold, doctrines, stats, fog', () => {
  const g = fresh(6, true); const me = [...g.realms.keys()][0];
  for (let i = 0; i < 12; i++) turn(g);
  g.realms.get(me).gold = 5000; E.buyDoctrine(g, me, 'tax');
  const h = round(g);
  assert.equal(h.turn, g.turn); assert.equal(h.cities.size, g.cities.size); assert.equal(h.armies.size, g.armies.size); assert.equal(h.tiles.size, g.tiles.size);
  for (const [id, r] of g.realms) { assert.equal(h.realms.get(id).gold, r.gold); assert.deepEqual([...(h.rules.docs.get(id) ?? [])], [...(g.rules.docs.get(id) ?? [])]); }
  assert.deepEqual(E.standings(h).map((r) => [r.id, r.citiesNow, r.battles]), E.standings(g).map((r) => [r.id, r.citiesNow, r.battles]));
  assert.equal(E.exploredCount(h, me), E.exploredCount(g, me));
  assert.deepEqual([...h.tiles.keys()].slice(0, 50), [...g.tiles.keys()].slice(0, 50));
  assert.equal(h.rules.fog, true); assert.ok(h.stats.realms instanceof Map);
});

test('save, load, play on: the loaded game and the original stay identical turn after turn (dice included)', () => {
  const g = fresh(9, true);
  for (let i = 0; i < 15; i++) turn(g);
  const h = round(g);
  for (let i = 0; i < 12; i++) { turn(g); turn(h); assert.equal(print(h), print(g), `diverged after ${i + 1} more turns`); }
});

test('an army on its way between cities is still one army after a save', () => {
  const g = fresh(2); const city = [...g.cities.values()].find((c) => c.owner);
  const dest = [...g.cities.values()].find((c) => c.owner === city.owner && c.id !== city.id);
  if (!dest) return;       // this seed gave the realm one city
  const a = E.addArmy(g, 'linf', city.owner, null, null); g.transit.push({ army: a, owner: city.owner, from: city.id, to: dest.id, arrive: g.turn + 2 });
  const h = round(g); assert.equal(h.transit[0].army, h.armies.get(a.id));
});

test('files: a damaged or altered file, a stranger and a newer version are refused', () => {
  const g = fresh(); const text = E.exportSave(E.saveGame(g));
  const outer = JSON.parse(text); outer.body = outer.body.replace('"turn":1', '"turn":7'); assert.notEqual(outer.body, JSON.parse(text).body);
  assert.equal(E.importSave(JSON.stringify(outer)).reason, 'damaged', 'edited by hand, so the checksum no longer matches');
  assert.equal(E.importSave(text.slice(0, text.length - 40)).reason, 'not-a-save', 'cut short');
  assert.equal(E.importSave('{"hello":1}').reason, 'not-a-save'); assert.equal(E.importSave('garbage').reason, 'not-a-save');
  const newer = E.saveGame(g); newer.version = 99; assert.equal(E.importSave(E.exportSave(newer)).reason, 'saved-by-a-newer-version');
  const cut = E.saveGame(g); delete cut.game.cities; assert.equal(E.importSave(E.exportSave(cut)).reason, 'damaged');
});

test('the summary has what the Save screen shows', () => {
  const g = fresh(); const me = [...g.realms.keys()][0]; g.meta = { difficulty: 'hard', shape: 'continent' };
  const s = E.saveGame(g, { playedMs: 8040000 }).summary;
  assert.equal(s.turn, 1); assert.equal(s.realmId, me); assert.equal(s.difficulty, 'hard'); assert.equal(s.shape, 'continent'); assert.equal(s.playedMs, 8040000);
  assert.ok(s.cities >= 1 && s.stacks >= 1 && s.gold >= 0 && s.hero); assert.deepEqual(s.rules, { fog: false, classic: false });
});

test('slots: two autosaves that rotate, four named slots, autosaves cannot be overwritten by hand', () => {
  const store = E.memoryStore(); const g = fresh();
  assert.deepEqual(E.listSaves(store).map((x) => [x.slot, x.empty]), [['auto1', true], ['auto2', true], ['slot1', true], ['slot2', true], ['slot3', true], ['slot4', true]]);
  E.autosave(store, g, {}, 1000); turn(g); E.autosave(store, g, {}, 2000); turn(g); E.autosave(store, g, {}, 3000);
  const l = E.listSaves(store);
  assert.equal(l[0].summary.turn, 3); assert.equal(l[1].summary.turn, 2); assert.equal(l[0].auto, true); assert.equal(l[0].name, 'Autosave, turn 3');
  assert.equal(E.saveToSlot(store, 'auto1', 'x', g).reason, 'not-a-manual-slot');
  assert.deepEqual(E.saveToSlot(store, 'slot3', '  Before Frostmere  ', g, {}, 5000), { ok: true, slot: 'slot3', name: 'Before Frostmere' });
  assert.equal(E.saveToSlot(store, 'slot4', '', g).name, 'Turn 3', 'an empty name becomes "Turn N"');
  const r = E.loadFromSlot(store, 'slot3'); assert.ok(r.ok); assert.equal(r.game.turn, 3);
  assert.equal(E.loadFromSlot(store, 'slot1').reason, 'empty-slot');
  assert.ok(E.deleteSlot(store, 'slot3').ok); assert.equal(E.listSaves(store)[4].empty, true); assert.equal(E.deleteSlot(store, 'nope').reason, 'no-such-slot');
});

test('a full store is reported, not crashed on', () => {
  const store = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {} };
  assert.equal(E.saveToSlot(store, 'slot1', 'a', fresh()).reason, 'storage-full'); assert.equal(E.autosave(store, fresh()).reason, 'storage-full');
});

test('a game with scripted dice (tests only) cannot be saved, and says so', () => {
  const g = fresh(); g.rng = E.scriptedRng([1]); assert.throws(() => E.saveGame(g), /scripted/);
});
