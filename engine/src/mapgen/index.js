import { makeNoise } from './noise.js';
import { landField, landMask, greatRiver, SHAPES, SHAPE_INFO } from './shapes.js';
import { buildTerrain, T } from './terrain.js';
import { buildRivers } from './rivers.js';
import { placeCities, placeRealms } from './settle.js';
import { buildRoads, greatRiverCrossings } from './roads.js';
import { validateMap } from './validate.js';
import { planCauseways, growSpits } from './straits.js';
import { makeNames } from './names.js';
import { placeSites } from './sites.js';

export { SHAPES, SHAPE_INFO, T, validateMap };

/**
 * Random map. opts: { seed, shape, width=240, height=150, cities=75, realms=8, start='classic'|'midgame' }.
 * 'classic' start: each realm owns only its capital, every other city belongs to the Unsworn (neutral).
 * Returns grids (flat typed arrays, index y*W+x), rivers, cities, realms, roads, bridges and a validation report.
 */
export function generateMap(opts = {}) {
  // a map that fails its own playability checks is thrown away and rebuilt from a derived seed (same input always gives the same result)
  let last = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    last = buildOnce({ ...opts, seed: (opts.seed ?? 1) + attempt * 1000 }); last.attempts = attempt + 1; last.seedRequested = opts.seed ?? 1;
    if (last.report.ok) return last;
  }
  return last;
}

function buildOnce(opts = {}) {
  const W = opts.width ?? 240, H = opts.height ?? 150; const shape = opts.shape ?? 'continent'; const seed = opts.seed ?? 1;
  const noise = makeNoise(seed * 7919 + 13); const rng = noise.rng;
  const { field } = landField(shape, W, H, noise, rng);
  const { land } = landMask(field, W, H, shape);
  if (shape === 'islands') growSpits(land, W, H, rng, { maxGap: 32 }); else if (shape === 'archipelago') growSpits(land, W, H, rng, { maxGap: 26 });
  const great = shape === 'river_split' ? greatRiver(land, W, H, noise, rng) : null;
  const tr = buildTerrain(land, W, H, noise, great);
  const gr = great ? { block: tr.riverBlock, pts: great.pts, width: great.width } : null;
  const rv = buildRivers(tr.terr, tr.elev, W, H, noise, { great: gr });
  const straits = planCauseways(rv.terr, W, H, rng);
  const ctx = { terr: rv.terr, W, H, channel: rv.channel, block: tr.riverBlock, straits };
  const pl = placeCities(ctx, opts.cities ?? 75, rng);
  Object.assign(ctx, { landLabel: pl.landLabel, landSizes: pl.landSizes, isle: pl.isle });
  const re = placeRealms(ctx, pl.cities, opts.realms ?? 8, rng);
  const bridgeSites = great ? greatRiverCrossings(great, rv.terr, W, H, rng) : [];
  const rd = buildRoads(ctx, pl.cities, rng, { bridgeSites, great });
  // mid-game start (for screenshots/testing): realms hold their home regions except about a fifth of cities
  let owner = re.owner;
  if (opts.start === 'midgame') owner = re.home.map((h, i) => (re.caps.includes(i) || rng.next() > 0.19 ? h : -1));
  owner = owner.map((o, i) => (pl.isle[i] ? -1 : o));        // boat-only islets are never held by an army at the start
  const map = {
    shape, seed, W, H, terr: rv.terr, elev: tr.elev, riverBlock: tr.riverBlock, block: tr.riverBlock, channel: rv.channel,
    rivers: rv.rivers, cities: pl.cities, ports: pl.ports, caps: re.caps, home: re.home, owner,
    neutral: owner.map((o, i) => (o < 0 ? i : -1)).filter((i) => i >= 0),
    roads: rd.roads, roadMask: rd.roadMask, bridges: dedupe(rd.bridges), bridgeSites, great, territory: re.territory,
    isle: pl.isle, straits, seaBridges: straits.bridges.map((b) => ({ a: b.a, b: b.b, cells: b.deck, span: b.deck.length })), seaDeck: straits.deck,
  };
  map.names = makeNames(map.cities.length, rng);
  map.sites = placeSites(map, rng);
  map.report = validateMap(map);
  return map;
}
function dedupe(bs) { const out = []; for (const b of bs) if (!out.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < 2.5)) out.push(b); return out; }
