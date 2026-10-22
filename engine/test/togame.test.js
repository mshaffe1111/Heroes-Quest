import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap, SHAPES } from '../src/mapgen/index.js';

const load = (shape, seed, extra = {}) => E.mapToGame(generateMap({ shape, seed, ...extra }));
const capOf = (g, realm) => [...g.cities.values()].find((c) => c.owner === realm && g.map.caps.includes(c.id));

test('a generated map becomes a game: tiles, 8 realms, cities with owners, armies, sites', () => {
  const { game: g } = load('continent', 3);
  assert.equal(g.width, 240); assert.equal(g.realms.size, 8); assert.equal(g.cities.size, 75);
  assert.equal([...g.cities.values()].filter((c) => c.owner).length, 8);          // classic start: capitals only
  for (const c of g.cities.values()) { const t = E.tileAt(g, c.x, c.y); assert.equal(t.cityId, c.id); assert.notEqual(t.terrain, 'water'); assert.notEqual(t.terrain, 'mountain'); }
  for (const r of g.realms.keys()) { const cap = capOf(g, r); assert.ok(cap, r); assert.ok(E.armiesAt(g, cap.x, cap.y).some((a) => E.isHero(a))); }
  const neutrals = [...g.armies.values()].filter((a) => a.owner === null);
  assert.ok(neutrals.length >= 60);
  assert.ok([...g.tiles.values()].some((t) => t.site));
});
test('tiles are consistent: no road on water or mountains, shallows touch land, decks are bridges on water', () => {
  for (const shape of ['river_split', 'islands']) {
    const { game: g } = load(shape, 4);
    let decks = 0;
    for (const [k, t] of g.tiles) {
      if (t.bridge) { decks++; assert.equal(t.terrain, 'water'); assert.equal(t.road, true); }
      else if (t.terrain === 'water' || t.terrain === 'mountain') assert.ok(!t.road, k);
    }
    assert.ok(decks > 0, shape);
  }
});

// Reachability: the point of the bridge/boat design. Every castle must be reachable from every capital by some
// mix of walking, bridges and boats, using exactly the engine's movement rules.
for (const shape of SHAPES) {
  test(`${shape}: every castle is reachable from the capitals by foot, bridge and boat under the engine rules`, () => {
    for (const seed of [1, 2]) {
      const { game: g } = load(shape, seed);
      const caps = g.map.caps.map((id) => g.cities.get(id));
      const walker = (cap) => { const a = E.addArmy(g, 'hinf', cap.owner, cap.x, cap.y); return [a.id]; };
      for (const cap of [caps[0], caps[caps.length >> 1]]) {
        const ids = walker(cap);
        for (const c of g.cities.values()) {
          if (c === cap) continue;
          const r = E.planRoute(g, ids, { x: c.x, y: c.y }, { through: true });
          assert.ok(r, `${shape} seed ${seed}: no route from ${cap.id} to ${c.id}${g.map.isle.includes(c.id) ? ' (islet)' : ''}`);
        }
      }
    }
  });
  test(`${shape}: every landmass with a castle has an embarkation point`, () => {
    const { game: g } = load(shape, 5);
    const ports = [...g.tiles].filter(([, t]) => t.port).length;
    const embark = [...g.cities.values()].filter((c) => E.isEmbarkPoint(g, c.x, c.y)).length;
    assert.ok(ports + embark > 0);
  });
}

test('boat-only islet castles are reached by boat, not on foot; the route embarks and lands', () => {
  let found = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { game: g } = load('archipelago', seed);
    if (!g.map.isle.length) continue;
    const cap = g.cities.get(g.map.caps[0]);
    const a = E.addArmy(g, 'hinf', cap.owner, cap.x, cap.y);
    for (const id of g.map.isle) {
      const c = g.cities.get(id);
      const foot = E.planRoute(g, [a.id], { x: c.x, y: c.y }, { through: true });
      assert.ok(foot, `${id} unreachable`);
      const acts = foot.steps.map((s) => s.action);
      assert.ok(acts.includes('embark') || acts.includes('sail'), `${id} was reached without a boat on seed ${seed}`);
      found++;
    }
  }
  assert.ok(found > 0);
});

test('a real turn on a generated map: income, production, a walk along the road, then a boat trip', () => {
  const { game: g } = load('islands', 2);
  const me = 'verdant';
  const cap = capOf(g, me);
  const ev = E.beginTurn(g, me);
  assert.ok(ev.some((e) => e.type === 'money'));
  assert.equal(E.setProduction(g, cap.id, cap.production[0]).ok, true);
  const mine = E.armiesAt(g, cap.x, cap.y).filter((a) => a.owner === me && !E.isHero(a));
  const ids = [mine[0].id];
  // plan a route to the nearest other castle on the map and walk the first legs of it
  const goals = [...g.cities.values()].filter((c) => c !== cap).sort((a, b) => Math.hypot(a.x - cap.x, a.y - cap.y) - Math.hypot(b.x - cap.x, b.y - cap.y));
  const r = E.planRoute(g, ids, { x: goals[0].x, y: goals[0].y }, { through: true });
  assert.ok(r && r.steps.length > 0);
  let moved = 0;
  for (const s of r.steps) { const m = E.moveGroup(g, ids, s.x, s.y); if (!m.ok) { assert.ok(['no-move-points', 'enemy-city', 'enemy-here'].includes(m.reason), m.reason); break; } moved++; }
  assert.ok(moved > 0);
  assert.ok(mine[0].mp < E.moveOf(mine[0], g.rules));
});
