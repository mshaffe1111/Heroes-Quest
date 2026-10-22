import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultOrder, applyCustomOrder, displayArmy, stackBadge, groupCanFly, groupMoveCost, limitingMovePoints } from '../src/index.js';
import { rules, mk, open, road, woods, hills, city, mountain, sea } from './helpers.js';

const types = (arr) => arr.map((a) => a.type);

test('default fight order is weakest first, strongest last, hero always last', () => {
  const o = defaultOrder([mk('drag'), mk('linf'), mk('hero'), mk('hinf')], rules);
  assert.deepEqual(types(o), ['linf', 'hinf', 'drag', 'hero']);
});
test('the map shows the last army in the fight order with a count', () => {
  const o = defaultOrder([mk('scout'), mk('hcav'), mk('pike')], rules);
  assert.equal(displayArmy(o).type, 'hcav');
  assert.deepEqual(stackBadge(o), { type: 'hcav', name: 'Knights', count: 3 });      // Heavy Cavalry, renamed 22 Oct
});
test('over mountains or sea a flyer is placed after the hero so he is never stranded', () => {
  const o = defaultOrder([mk('linf'), mk('peg'), mk('hero')], rules, { overRough: true });
  assert.deepEqual(types(o), ['linf', 'hero', 'peg']);
});
test('a saved Fight Order can disguise a stack: a weak army shown on top', () => {
  const dr = mk('drag'); const sc = mk('scout');
  const o = applyCustomOrder([dr, sc], [dr.id, sc.id], rules);
  assert.equal(displayArmy(o).type, 'scout');
});

test('flying: only if every non-hero army flies; a hero may ride along; a flight item lifts everyone', () => {
  assert.equal(groupCanFly([mk('peg'), mk('bat')]), true);
  assert.equal(groupCanFly([mk('peg'), mk('linf')]), false);
  assert.equal(groupCanFly([mk('peg'), mk('hero')]), true);
  assert.equal(groupCanFly([mk('hero')]), false);
  assert.equal(groupCanFly([mk('linf'), mk('hero', { items: [{ fly: true }] })]), true);
});
test('a flying group crosses mountains and sea; a ground group cannot', () => {
  assert.ok(Number.isFinite(groupMoveCost([mk('peg'), mk('hero')], mountain, rules)));
  assert.ok(Number.isFinite(groupMoveCost([mk('grif')], sea, rules)));
  assert.equal(groupMoveCost([mk('peg'), mk('linf')], mountain, rules), Infinity);
  assert.equal(groupMoveCost([mk('hinf')], sea, rules), Infinity);
});
test('roads cost 1 whatever lies underneath', () => {
  assert.equal(groupMoveCost([mk('hinf')], { terrain: 'hills', road: true }, rules), 1);
});
test('one scout, orc, elf or dwarf lets the whole group pay the open-ground cost in its terrain', () => {
  assert.equal(groupMoveCost([mk('hinf')], hills, rules), rules.terrainCost.hills);
  assert.equal(groupMoveCost([mk('hinf'), mk('dwarf')], hills, rules), rules.terrainCost.open);
  assert.equal(groupMoveCost([mk('hinf'), mk('dwarf')], woods, rules), rules.terrainCost.woods);   // dwarves only help in hills
  assert.equal(groupMoveCost([mk('hinf'), mk('scout')], woods, rules), rules.terrainCost.open);
  assert.equal(groupMoveCost([mk('hinf'), mk('scout')], hills, rules), rules.terrainCost.open);
  assert.equal(groupMoveCost([mk('hcav'), mk('elf')], woods, rules), rules.terrainCost.open);
});
test('the slowest army sets the pace, hero included: a spent hero holds the group back', () => {
  const h = mk('hero'); h.mp = 1;
  const i = mk('hinf'); i.mp = 8;
  assert.equal(limitingMovePoints([i, h]), 1);
  h.mp = 14; assert.equal(limitingMovePoints([i, h]), 8);
  assert.equal(limitingMovePoints([h]), 14);
});
