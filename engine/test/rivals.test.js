import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rungsFor, RUNGS, setupRivals, applyHabit, rivalReveal } from '../src/rivals.js';
import { generateMap } from '../src/mapgen/index.js';
import { mapToGame } from '../src/index.js';

const names = (level, n) => rungsFor(level, n).map((i) => RUNGS[i]);

test('three rivals spread across each difficulty band (Matt 22 Oct)', () => {
  assert.deepEqual(names('easy', 3), ['clumsy', 'weak', 'normal']);
  assert.deepEqual(names('medium', 3), ['weak', 'normal', 'good']);
  assert.deepEqual(names('hard', 3), ['normal', 'good', 'sharp']);
  assert.deepEqual(names('expert', 3), ['good', 'sharp', 'sharp']);
});
test('one rival sits in the middle of the band; Expert is Sharp', () => {
  assert.deepEqual(names('easy', 1), ['weak']); assert.deepEqual(names('medium', 1), ['normal']);
  assert.deepEqual(names('hard', 1), ['good']); assert.deepEqual(names('expert', 1), ['sharp']);
});
test('seven rivals never leave the band, and include both ends', () => {
  for (const [lvl, lo, hi] of [['easy', 0, 2], ['medium', 1, 3], ['hard', 2, 4], ['expert', 3, 4]]) {
    const r = rungsFor(lvl, 7); assert.ok(r.every((x) => x >= lo && x <= hi), lvl); assert.equal(Math.min(...r), lo); assert.equal(Math.max(...r), hi);
  }
});
test('habits tilt style only a little and never touch gold or armies', () => {
  const base = { aggression: 0.5, patience: 2, crewMax: 6, poolCities: 2, travelTurns: 6, garrison: 2, fallBackBelow: 0.25 };
  for (const h of ['cautious', 'raider', 'gatherer']) { const c = applyHabit(base, h); assert.ok(Math.abs(c.aggression - 0.5) <= 0.15 + 1e-9); assert.equal(Object.keys(c).length, Object.keys(base).length); }
  assert.equal(applyHabit(base, 'steady'), base);
});

function game(seed, n) {
  const map = generateMap({ shape: 'continent', seed, width: 150, height: 96, cities: 60, realms: 8 });
  const ids = ['verdant', 'ivory', 'gold', 'ember', 'crimson', 'azure', 'tide', 'ashen'].slice(0, n + 1);
  return mapToGame(map, { realmIds: ids }).game;
}
test('setupRivals sets level, skill, rung and habit for every computer realm, the same for the same seed', () => {
  const a = game(41, 3); a.realms.get('verdant').human = true; const ra = setupRivals(a, 'verdant', 'hard');
  const b = game(41, 3); b.realms.get('verdant').human = true; const rb = setupRivals(b, 'verdant', 'hard');
  assert.deepEqual(ra, rb); assert.equal(ra.length, 3);
  for (const { id } of ra) { const r = a.realms.get(id); assert.ok(r.rung && r.difficulty && typeof r.skill === 'number' && r.habit); }
  assert.deepEqual(ra.map((q) => q.rung), ['normal', 'good', 'sharp']);
  assert.equal(rivalReveal(a)[0].rung, 'sharp');
});
test('on Easy and Medium the sharpest rival is never the nearest neighbour', () => {
  for (let seed = 1; seed <= 30; seed++) for (const lvl of ['easy', 'medium']) {
    const g = game(seed, 4); g.realms.get('verdant').human = true; setupRivals(g, 'verdant', lvl);
    const caps = g.map?.caps ?? []; const cap = (id) => [...g.cities.values()].find((c) => c.owner === id && caps.includes(c.id)) ?? [...g.cities.values()].find((c) => c.owner === id);
    const home = cap('verdant'); const rivals = [...g.realms.values()].filter((r) => r.rung);
    const near = rivals.slice().sort((a, b) => Math.hypot(cap(a.id).x - home.x, cap(a.id).y - home.y) - Math.hypot(cap(b.id).x - home.x, cap(b.id).y - home.y))[0];
    const top = Math.max(...rivals.map((r) => RUNGS.indexOf(r.rung)));
    assert.ok(RUNGS.indexOf(near.rung) < top, `seed ${seed} ${lvl}: nearest is ${near.rung}`);
  }
});
