import { D8, components } from './grid.js';
import { T } from './terrain.js';
import { ISLET_MAX } from './straits.js';

function landGroups(map, withBridges) {
  const { W, H, terr, block, roadMask } = map; const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = ((terr[i] !== T.SEA && terr[i] !== T.LAKE && (!block[i] || (withBridges && roadMask[i]))) || (withBridges && map.seaDeck && map.seaDeck[i] && roadMask[i])) ? 1 : 0;
  return components(m, W, H, true);
}

function roadBfs(map, from) { // length along roads (cells) from one city to all road cells
  const { W, H, roadMask } = map; const d = new Int32Array(W * H).fill(-1); const q = [from]; d[from] = 0;
  for (let h = 0; h < q.length; h++) { const i = q[h]; const x = i % W, y = (i / W) | 0;
    for (const [dy, dx] of D8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx; if (roadMask[ni] && d[ni] < 0) { d[ni] = d[i] + 1; q.push(ni); } } }
  return d;
}

/** Checks that make a generated map playable. Returns { ok, errors, warnings, stats }. */
export function validateMap(map) {
  const { W, H, cities, ports, caps, home } = map; const errors = [], warnings = [], stats = {};
  const cell = ([y, x]) => y * W + x;
  const g = landGroups(map, true), g0 = landGroups(map, false);
  const grp = cities.map((c) => g.lab[cell(c)]);
  const groups = [...new Set(grp)]; stats.landGroups = groups.length;
  stats.citiesPerGroup = groups.map((k) => grp.filter((x) => x === k).length);
  // every group with cities and more than one group exists => each needs a port or the others cannot reach it
  if (groups.length > 1) for (const k of groups) {
    const members = cities.map((_, i) => i).filter((i) => grp[i] === k);
    if (!members.some((i) => ports[i])) errors.push(`land group ${k} (${members.length} cities) has no port: ships cannot reach it`);
  }
  // roads connect every city to the others in its group
  const roadCity = cities.map((c) => { const d = roadBfs(map, cell(c)); return d; });
  let unlinked = 0; groups.forEach((k) => { const mem = cities.map((_, i) => i).filter((i) => grp[i] === k); for (const i of mem) if (roadCity[mem[0]][cell(cities[i])] < 0) unlinked++; });
  if (unlinked) errors.push(`${unlinked} cities are not joined by road to the rest of their land`);
  // realms
  const per = Array(caps.length).fill(0); home.forEach((h) => { if (h >= 0) per[h]++; }); stats.homeCitiesPerRealm = per;
  if (per.some((n) => n < 3)) warnings.push('a realm has fewer than 3 cities in its home region: ' + per.join(','));
  stats.capsAlone = caps.filter((c, a) => !caps.some((o, b) => b !== a && grp[o] === grp[c])).length;
  // causeways and boat-only islets
  const st = map.straits; stats.seaBridges = map.seaBridges.length; stats.islets = [...st.islets].length;
  const bigLabs = st.labels.filter((l) => st.sizes[l] >= ISLET_MAX); stats.bigLandmasses = bigLabs.length;
  const bigClusters = new Set(bigLabs.map((l) => st.cluster.get(l))); stats.bigClusters = bigClusters.size;
  if (bigClusters.size > 1 || (bigClusters.size === 1 && !bigClusters.has(st.mainRoot))) errors.push(`${bigClusters.size} big landmasses are not joined by a bridge: every island with a realm or many castles must be reachable on foot`);
  const isleCount = new Map(); cities.forEach((c, i) => { if (map.isle[i]) { const l = st.lab[cell(c)]; isleCount.set(l, (isleCount.get(l) ?? 0) + 1); } });
  stats.isletCastles = [...isleCount.values()];
  if ([...isleCount.values()].some((n) => n > 2)) errors.push('a boat-only islet has more than two castles');
  if (caps.some((c) => map.isle[c])) errors.push('a realm starts on a boat-only islet');
  if (map.owner.some((o, i) => map.isle[i] && o >= 0)) errors.push('an army holds a boat-only islet at the start');
  for (const l of st.islets) if (![...cities.keys()].some((i) => st.lab[cell(cities[i])] === l)) warnings.push('an islet has no castle');
  if (map.shape !== 'archipelago' && stats.islets > 3) warnings.push('more than three boat-only islets');
  if (map.shape === 'islands' && bigLabs.length < 3) errors.push(`islands: expected at least 3 big islands, got ${bigLabs.length}`);
  // shape promises
  const info = map.shape;
  if (info === 'archipelago' && groups.length < 2) errors.push(`${info}: expected separate landmasses with cities, got ${groups.length}`);
  if (info === 'split' || info === 'islands') {
    if (bigLabs.length < 2) errors.push(`${info}: expected at least two big landmasses, got ${bigLabs.length}`);
    if (map.seaBridges.length < 1) errors.push(`${info}: the landmasses have no bridge between them`);
    const sz = bigLabs.map((l) => st.sizes[l]).sort((a, b) => b - a); stats.bigSizes = sz;
  }
  if (info === 'river_split') {
    const sides = cities.map((c) => g0.lab[cell(c)]); const big = [...new Set(sides)].map((k) => sides.filter((x) => x === k).length).filter((n) => n >= cities.length * 0.2);
    stats.riverSides = big; stats.bridgeCount = map.bridges.filter((b) => b.great).length;
    if (big.length < 2) errors.push('great river does not divide the cities into two sizeable sides');
    if (groups.length !== 1) errors.push('great river map should be one landmass joined by bridges, got ' + groups.length);
    // detour: road distance between city pairs on opposite sides vs straight line
    const ratios = []; for (let a = 0; a < cities.length; a++) for (let b = a + 1; b < cities.length; b++) {
      if (sides[a] === sides[b]) continue; const st = Math.hypot(cities[a][0] - cities[b][0], cities[a][1] - cities[b][1]); if (st > 28) continue;
      const d = roadCity[a][cell(cities[b])]; if (d > 0) ratios.push(d / st);
    }
    ratios.sort((p, q) => p - q); stats.detourMedian = ratios.length ? +ratios[ratios.length >> 1].toFixed(2) : null; stats.detourMax = ratios.length ? +ratios[ratios.length - 1].toFixed(2) : null;
    if (stats.detourMedian !== null && stats.detourMedian < 1.35) warnings.push('crossing the great river is too easy (median detour ' + stats.detourMedian + ')');
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}
