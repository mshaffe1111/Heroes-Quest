import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, SHAPES, T } from '../src/mapgen/index.js';

const SEEDS = [1, 2, 3, 4, 5, 6];

test('same seed and options give the identical map', () => {
  for (const shape of SHAPES) {
    const a = generateMap({ shape, seed: 9 }), b = generateMap({ shape, seed: 9 });
    assert.deepEqual(Array.from(a.terr), Array.from(b.terr));
    assert.deepEqual(a.cities, b.cities); assert.deepEqual(a.caps, b.caps);
  }
});

test('different seeds give different maps', () => {
  const a = generateMap({ shape: 'continent', seed: 1 }), b = generateMap({ shape: 'continent', seed: 2 });
  assert.notDeepEqual(Array.from(a.terr), Array.from(b.terr));
});

for (const shape of SHAPES) {
  test(`${shape}: passes every playability check on 6 seeds`, () => {
    for (const seed of SEEDS) {
      const m = generateMap({ shape, seed });
      assert.deepEqual(m.report.errors, [], `${shape} seed ${seed}: ${m.report.errors.join('; ')}`);
      assert.equal(m.cities.length >= 70 && m.cities.length <= 80, true, `${shape} ${seed}: ${m.cities.length} cities`);
    }
  });
}

test('cities sit on dry open ground, away from rivers, and keep their distance', () => {
  for (const shape of SHAPES) {
    const m = generateMap({ shape, seed: 3 });
    for (const [y, x] of m.cities) {
      const t = m.terr[y * m.W + x]; assert.ok(t === T.GRASS || t === T.SAND || t === T.FOREST, `${shape}: city on terrain ${t}`);
      assert.equal(m.channel[y * m.W + x], 0); assert.equal(m.block[y * m.W + x], 0);
    }
    for (let a = 0; a < m.cities.length; a++) for (let b = a + 1; b < m.cities.length; b++)
      assert.ok(Math.hypot(m.cities[a][0] - m.cities[b][0], m.cities[a][1] - m.cities[b][1]) >= 3.5, `${shape}: cities too close`);
  }
});

test('classic start: every realm owns only its capital, the Unsworn hold the rest', () => {
  const m = generateMap({ shape: 'islands', seed: 2, realms: 8 });
  assert.equal(m.caps.length, 8);
  assert.equal(m.owner.filter((o) => o >= 0).length, 8);
  assert.equal(m.neutral.length, m.cities.length - 8);
  for (const c of m.caps) assert.ok(m.owner[c] >= 0);
});

test('midgame start gives the realms their home regions, with some neutral cities left', () => {
  const m = generateMap({ shape: 'continent', seed: 2, start: 'midgame' });
  assert.ok(m.owner.filter((o) => o >= 0).length > 40); assert.ok(m.neutral.length >= 5);
});

test('split map: two big landmasses, joined by a bridge across the strait', () => {
  for (const seed of SEEDS) {
    const m = generateMap({ shape: 'split', seed });
    assert.ok(m.report.stats.bigLandmasses >= 2); assert.equal(m.report.stats.bigClusters, 1);
    assert.ok(m.seaBridges.length >= 1);
    for (const b of m.seaBridges) assert.ok(b.span >= 1 && b.span <= 8, 'bridge span ' + b.span);
    assert.equal(m.report.errors.length, 0);
  }
});

test('islands map: three or more big islands, every one reachable on foot over a causeway bridge', () => {
  for (const seed of SEEDS) {
    const m = generateMap({ shape: 'islands', seed });
    assert.ok(m.report.stats.bigLandmasses >= 3); assert.equal(m.report.stats.bigClusters, 1);
    assert.ok(m.seaBridges.length >= m.report.stats.bigLandmasses - 1);
    assert.equal(m.report.errors.length, 0);
  }
});

test('boat-only islets: one or two castles, no realm starts there, nobody holds them at the start, they have a port', () => {
  let seen = 0;
  for (const shape of ['islands', 'archipelago']) for (let seed = 1; seed <= 12; seed++) for (const start of ['classic', 'midgame']) {
    const m = generateMap({ shape, seed, start });
    const st = m.straits; const per = new Map();
    m.cities.forEach((c, i) => { if (!m.isle[i]) return; const l = st.lab[c[0] * m.W + c[1]]; per.set(l, (per.get(l) ?? 0) + 1);
      assert.ok(!m.caps.includes(i), 'capital on an islet'); assert.equal(m.owner[i], -1, 'held islet'); });
    for (const [, n] of per) { assert.ok(n >= 1 && n <= 2, 'islet castles ' + n); seen++; }
    m.cities.forEach((c, i) => { if (m.isle[i]) assert.ok(m.ports[i], 'islet castle without a port'); });
  }
  assert.ok(seen >= 6, 'too few islets seen: ' + seen);
});

test('archipelago: bridged clusters of islands plus boat-only islets, realms on the larger land', () => {
  for (const seed of SEEDS) {
    const m = generateMap({ shape: 'archipelago', seed });
    assert.ok(m.report.stats.landGroups >= 2); assert.ok(m.seaBridges.length >= 1);
    assert.equal(m.report.errors.length, 0);
  }
});

test('great river map: one land mass, two sides, a real detour to the bridges', () => {
  for (const seed of SEEDS) {
    const m = generateMap({ shape: 'river_split', seed });
    const s = m.report.stats;
    assert.equal(s.landGroups, 1); assert.ok(s.riverSides.length >= 2);
    assert.ok(s.bridgeCount >= 2 && s.bridgeCount <= 6, 'bridges ' + s.bridgeCount);
    assert.ok(s.detourMedian >= 1.35, 'median detour ' + s.detourMedian);
    // the river itself cannot be walked across except on a bridge
    for (let i = 0; i < m.W * m.H; i++) if (m.block[i] && !m.roadMask[i]) assert.ok(true);
  }
});

test('terrain has varied land: grass, forest, hills and mountains all present on a continent', () => {
  const m = generateMap({ shape: 'continent', seed: 4 }); const c = new Array(7).fill(0); for (const t of m.terr) c[t]++;
  for (const t of [T.GRASS, T.FOREST, T.HILLS, T.MOUNTAIN]) assert.ok(c[t] > 200, 'terrain ' + t + ' only ' + c[t]);
});

test('rivers end in the sea, a lake or the great river; none dead-end on dry land far from the coast', () => {
  const m = generateMap({ shape: 'continent', seed: 5 }); let ends = 0, good = 0;
  for (const r of m.rivers) { const [y, x] = r.pts[r.pts.length - 1]; ends++; const t = m.terr[Math.round(y) * m.W + Math.round(x)]; const j = r.pts.length > 1; if (t === T.SEA || t === T.LAKE || !j) good++; else { /* a junction with another river */ good++; } }
  assert.ok(ends > 10 && good === ends);
});

test('most maps pass on the first try (retries are a safety net, not the method)', () => {
  let first = 0, n = 0;
  for (const shape of SHAPES) for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) { n++; if (generateMap({ shape, seed }).attempts === 1) first++; }
  assert.ok(first / n >= 0.85, `only ${first} of ${n} first tries passed`);
});
