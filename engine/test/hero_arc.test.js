// The hero arc (Matt, 2026-10-22): four new abilities (no magic) and Mage Towers that teach one ability for gold.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';

function world() {
  const g = E.createGame({ width: 12, height: 8, seed: 5 });
  E.addRealm(g, { id: 'A', name: 'Verdant Court', gold: 1000 }); E.addRealm(g, { id: 'B', name: 'Crimson Horde', gold: 1000 });
  E.addCity(g, { id: 'ca', x: 0, y: 0, owner: 'A', income: 20, production: ['linf'] });
  E.addCity(g, { id: 'cb', x: 11, y: 7, owner: 'B', income: 20, production: ['linf'] });
  return g;
}

test('twelve abilities can be offered, the four new ones among them', () => {
  for (const k of ['siege', 'treasure', 'quartermaster', 'ranger']) assert.ok(E.OFFERABLE.includes(k), k);
  assert.equal(E.OFFERABLE.length, 12);
});
test('Siege Master: the city gives its defenders no bonus against his group', () => {
  const g = world(); const hero = E.addArmy(g, 'hero', 'A', 5, 5); const foe = E.addArmy(g, 'linf', 'B', 6, 5);
  const ctx = { rules: g.rules, letters: ['C'], defending: true, cityBonus: 2 };
  const before = E.sideBonus([foe], [hero], ctx); hero.perks.push('siege'); const after = E.sideBonus([foe], [hero], ctx);
  assert.ok(JSON.stringify(before) !== JSON.stringify(after), 'the defenders lose something');
});
test('Treasure Hunter: +15% in ruins', () => {
  const g = world(); const hero = E.addArmy(g, 'hero', 'A', 5, 5); const p0 = E.ruinWinChance(hero, 'giant', 0, g.rules); hero.perks.push('treasure');
  const p1 = E.ruinWinChance(hero, 'giant', 0, g.rules); assert.ok(p1 > p0 || p1 === g.rules.ruinWinMax);
});
test('Quartermaster: armies on his square pay half upkeep', () => {
  const g = world(); const hero = E.addArmy(g, 'hero', 'A', 5, 5); for (let i = 0; i < 3; i++) E.addArmy(g, 'hinf', 'A', 5, 5);
  const u0 = E.realmUpkeep([...g.armies.values()], 'A', g.rules); hero.perks.push('quartermaster'); const u1 = E.realmUpkeep([...g.armies.values()], 'A', g.rules);
  assert.ok(u1 < u0 && u1 >= Math.floor(u0 / 2) - 3, `${u0} -> ${u1}`);
});
test('Ranger: woods cost the open-ground price for his group', () => {
  const g = world(); E.setTile(g, 6, 5, { terrain: 'woods' }); const hero = E.addArmy(g, 'hero', 'A', 5, 5); const inf = E.addArmy(g, 'hinf', 'A', 5, 5);
  const t = E.tileAt(g, 6, 5); const c0 = E.groupMoveCost([hero, inf], t, g.rules); hero.perks.push('ranger'); const c1 = E.groupMoveCost([hero, inf], t, g.rules);
  assert.equal(c0, g.rules.terrainCost.woods); assert.equal(c1, g.rules.terrainCost.open);
});
test('Mage Tower: three abilities on offer, one learned for gold, once per hero per tower', () => {
  const g = world(); E.addSite(g, { x: 4, y: 4, kind: 'tower' }); const hero = E.addArmy(g, 'hero', 'A', 4, 4);
  const o = E.towerOffer(g, [hero.id]); assert.ok(o.ok); assert.equal(o.offer.length, 3); assert.equal(o.cost, g.rules.towerCost);
  assert.deepEqual(E.towerOffer(g, [hero.id]).offer, o.offer, 'the same three when asked again');
  const gold = g.realms.get('A').gold; const r = E.learnAtTower(g, [hero.id], o.offer[1]); assert.ok(r.ok);
  assert.ok(hero.perks.includes(o.offer[1])); assert.equal(g.realms.get('A').gold, gold - g.rules.towerCost);
  assert.equal(E.towerOffer(g, [hero.id]).reason, 'already-taught');
});
test('Mage Tower: not without the gold, and not without a hero', () => {
  const g = world(); E.addSite(g, { x: 4, y: 4, kind: 'tower' }); const hero = E.addArmy(g, 'hero', 'A', 4, 4); const inf = E.addArmy(g, 'linf', 'A', 4, 4);
  g.realms.get('A').gold = 10; const o = E.towerOffer(g, [hero.id]); assert.equal(E.learnAtTower(g, [hero.id], o.offer[0]).reason, 'not-enough-gold'); assert.equal(hero.perks.length, 0);
  assert.equal(E.towerOffer(g, [inf.id]).reason, 'needs-a-hero');
});
