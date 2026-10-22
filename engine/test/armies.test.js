import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMIES, ARMY_KEYS, isBuildableType } from '../src/index.js';

test('28 army types plus the hero, matching Appendix A', () => {
  assert.equal(ARMY_KEYS.length, 29);
  const s = (k) => [ARMIES[k].str, ARMIES[k].move, ARMIES[k].classicCost, ARMIES[k].build];     // the 90s original prices; Heroes Quest re-prices some armies (see priceOf)
  assert.deepEqual(s('scout'), [1, 16, 2, 1]);
  assert.deepEqual(s('hcav'), [4, 16, 8, 3]);
  assert.deepEqual(s('ele'), [8, 16, 15, 4]);
  assert.deepEqual(s('drag'), [9, 22, 20, 4]);
  assert.deepEqual(s('wiz'), [6, 50, 12, 4]);
});
test('no army starts above strength 9 and flyers are exactly bat, pegasi, griffins, dragon', () => {
  for (const a of Object.values(ARMIES)) assert.ok(a.str <= 9, a.key);
  assert.deepEqual(ARMY_KEYS.filter((k) => ARMIES[k].fly).sort(), ['bat', 'drag', 'grif', 'peg']);
});
test('special armies and navies cannot be built in cities', () => {
  for (const k of ['wiz', 'drag', 'devil', 'navy', 'hero']) assert.equal(isBuildableType(k), false, k);
  for (const k of ['scout', 'hcav', 'ele', 'cat']) assert.equal(isBuildableType(k), true, k);
});

test('Heroes Quest prices follow toughness: light armies cost less, big ones more, classic mode keeps the 90s original prices', async () => {
  const { priceOf, makeRules } = await import('../src/index.js');
  const q = makeRules(), c = makeRules({ classic: true });
  assert.ok(priceOf(ARMIES.linf, q) < priceOf(ARMIES.linf, c));
  assert.ok(priceOf(ARMIES.giant, q) > priceOf(ARMIES.giant, c));
  assert.equal(priceOf(ARMIES.hinf, q), priceOf(ARMIES.hinf, c));
  for (const k of ARMY_KEYS) assert.equal(priceOf(ARMIES[k], c), ARMIES[k].classicCost);
});
