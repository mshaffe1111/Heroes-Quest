import { T } from './terrain.js';
import { createGame, addRealm, addCity, addArmy, setTile, tileAt, isEmbarkPoint, giveStandard } from '../game.js';
import { addSite, guardianTypes } from '../sites.js';
import { ARMIES, isBuildableType, signatureOf } from '../armies.js';
import { makeRng } from '../rng.js';
import { REALM_SHIPS } from '../palette.js';

/** The eight realms, in the order the generator numbers them (realm index i is REALMS[i]). */
export const REALMS = [
  { id: 'ivory', name: 'Ivory Order', color: 'white' }, { id: 'gold', name: 'Gold Dominion', color: 'gold' }, { id: 'ember', name: 'Ember Clans', color: 'orange' },
  { id: 'crimson', name: 'Crimson Horde', color: 'red' }, { id: 'verdant', name: 'Verdant Court', color: 'green' }, { id: 'azure', name: 'Azure League', color: 'blue' },
  { id: 'tidewatch', name: 'Tidewatch Riders', color: 'cyan' }, { id: 'ashen', name: 'Ashen Legion', color: 'black' },
].map((r) => ({ ...r, ship: REALM_SHIPS[r.id], signature: signatureOf(r.id) }));
export const REALM_IDS = REALMS.map((r) => r.id);
export const NEUTRAL_KINDS = ['normal', 'strong', 'active'];

/** Check a realmIds option: 2..8 distinct known realm ids, no more than the map has capitals. Returns an error message or null. */
export function realmIdsError(realmIds, caps = REALMS.length) {
  if (!Array.isArray(realmIds)) return 'realmIds must be an array';
  if (realmIds.length < 2 || realmIds.length > REALMS.length) return `realmIds must list 2 to ${REALMS.length} realms`;
  const bad = realmIds.find((id) => !REALM_IDS.includes(id)); if (bad !== undefined) return `unknown realm: ${bad}`;
  if (new Set(realmIds).size !== realmIds.length) return 'realmIds must not repeat a realm';
  if (realmIds.length > caps) return `the map has only ${caps} capitals for ${realmIds.length} realms`;
  return null;
}
const HERO_NAMES = ['Aldric', 'Brenna', 'Cassian', 'Dara', 'Edric', 'Fenna', 'Gareth', 'Hilde', 'Ivor', 'Jora', 'Kell', 'Lyra'];
const BASICS = ['linf', 'hinf', 'orc', 'scout', 'pike', 'lcav'];
const BUILDABLE = Object.keys(ARMIES).filter(isBuildableType);

const START_SIGNATURE_ARMIES = 2;     // signature armies each capital starts with, beside the hero
/** Make sure a capital builds its realm's signature army: add it if there is a free slot (4 at most), else it replaces the dearest kind. */
function withSignature(c, sig) {
  if (!sig || c.production.includes(sig)) return;
  if (c.production.length < 4) c.production.push(sig);
  else { let k = 0; c.production.forEach((t, j) => { if (ARMIES[t].cost >= ARMIES[c.production[k]].cost) k = j; }); c.production[k] = sig; }
  c.production.sort((a, b) => ARMIES[a].cost - ARMIES[b].cost);
}

const D8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** PLACEHOLDER balance: which army types a city builds. 1-3 types, capitals 4; always one cheap basic type. */
function pickProduction(rng, capital) {
  const n = capital ? 4 : 1 + Math.floor(rng.next() * 3);
  const out = [rng.pick(BASICS)];
  while (out.length < n) {
    const pool = BUILDABLE.filter((t) => !out.includes(t));
    const w = pool.map((t) => 1 / ARMIES[t].cost); const tot = w.reduce((a, b) => a + b, 0);
    let r = rng.next() * tot, k = 0; while (k < pool.length - 1 && (r -= w[k]) > 0) k++;
    out.push(pool[k]);
  }
  return out.sort((a, b) => ARMIES[a].cost - ARMIES[b].cost);
}

/**
 * Turn a generated map into a playable game (a `game.js` world).
 *   opts: { seed, neutrals: 'normal' | 'strong' | 'active' (manual 14a, default 'strong', Matt 2026-10-22), realmIds }
 *   Neutral cities start with ONE defender: normal = the weakest the city can build, strong = any type it builds, active = strong, and if an
 *   attack on it fails it builds extra defenders up to five. Boat-only islet castles are always at least 'strong'.
 *   realmIds (rival count, chosen in the wizard): 2..8 distinct realm ids; element 0 is the player's realm and gets map capital 0, element k
 *   gets map capital k. Realms not listed do not exist: their capitals (and any cities the map gave them) become ordinary Unsworn cities.
 *   Default: one realm per map capital, in REALMS order (all 8 on an 8-realm map).
 *   Each realm starts in its capital with its hero (carrying the Standard) and two of its signature army; the capital always builds that army.
 * Tile mapping: sea and lakes -> water; great-river cells -> water (a bridge deck where a road crosses); sea-causeway cells -> water with
 * a bridge deck; grass/sand -> open; forest -> woods; hills; mountains. Road cells carry `road`. Water touching land has `shore`.
 * Port-flagged castles that do not touch the sea get an anchor square (`port`) on the nearest coast; every landmass with castles is
 * guaranteed an embarkation point. Returns { game, notes }.
 */
export function mapToGame(map, opts = {}) {
  const { W, H } = map; const seed = opts.seed ?? map.seed ?? 1; const rng = makeRng((seed * 2654435761) >>> 0);
  const g = createGame({ width: W, height: H, seed });
  const notes = { portsAdded: [], landingsAdded: [], roadOnMountain: 0 };
  const at = (x, y) => y * W + x;
  const isWaterCell = (i) => map.terr[i] === T.SEA || map.terr[i] === T.LAKE || !!map.block[i];

  // ---- tiles ----
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y); const t = map.terr[i];
    if (map.seaDeck && map.seaDeck[i]) { setTile(g, x, y, { terrain: 'water', bridge: true, road: true }); continue; }
    if (t === T.SEA) { setTile(g, x, y, { terrain: 'water' }); continue; }
    if (t === T.LAKE) { setTile(g, x, y, { terrain: 'water', lake: true }); continue; }
    if (map.block[i]) {                                                    // the great river
      setTile(g, x, y, map.roadMask[i] ? { terrain: 'water', river: true, bridge: true, road: true } : { terrain: 'water', river: true });
      continue;
    }
    let terrain = t === T.FOREST ? 'woods' : t === T.HILLS ? 'hills' : t === T.MOUNTAIN ? 'mountain' : 'open';
    if (terrain === 'mountain' && map.roadMask[i]) { terrain = 'hills'; notes.roadOnMountain++; }   // a road never runs over a peak
    const tile = { terrain }; if (map.roadMask[i]) tile.road = true; if (map.channel[i]) tile.river = true;
    setTile(g, x, y, tile);
  }
  // shallows: water squares that touch land
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tileAt(g, x, y); if (t.terrain !== 'water' || t.bridge || t.lake) continue;
    if (D8.some(([dx, dy]) => { const n = tileAt(g, x + dx, y + dy); return n && n.terrain !== 'water'; })) setTile(g, x, y, { shore: true });
  }

  // ---- realms ----
  const neutrals = opts.neutrals ?? 'strong';
  if (!NEUTRAL_KINDS.includes(neutrals)) throw new Error(`unknown neutrals setting: ${neutrals}`);
  const realmIds = opts.realmIds ?? REALMS.slice(0, map.caps.length).map((r) => r.id);
  if (opts.realmIds != null) { const err = realmIdsError(realmIds, map.caps.length); if (err) throw new Error(err); }
  for (const id of realmIds) { const R = REALMS.find((x) => x.id === id); const realm = addRealm(g, { id: R.id, name: R.name }); realm.color = R.color; realm.ship = R.ship; realm.signature = R.signature; }
  const ownerId = (i) => (map.owner[i] >= 0 && map.owner[i] < realmIds.length ? realmIds[map.owner[i]] : null);

  // ---- cities ----
  const capSet = new Set(map.caps.filter((_, r) => r < realmIds.length));      // capitals of realms that exist; a left-out realm's capital is an ordinary city
  map.cities.forEach(([y, x], i) => {
    const production = pickProduction(rng, capSet.has(i));
    const owner = ownerId(i);
    const c = addCity(g, { id: `c${i}`, name: map.names[i], x, y, income: 13 + Math.floor(rng.next() * 18), production, owner });
    if (capSet.has(i) && owner) withSignature(c, signatureOf(owner));
  });

  // ---- sites ----
  // PLACEHOLDER balance: weaker guardians are commoner; about one ruin in five is a stronghold with a strong guardian
  const guards = guardianTypes();
  for (const [kind, [y, x]] of map.sites) {
    const stronghold = kind === 'ruin' && rng.next() < 0.2;
    const k = stronghold ? guards.length - 1 - Math.floor(rng.next() * 3) : Math.floor(Math.pow(rng.next(), 1.6) * (guards.length - 2));
    addSite(g, { x, y, kind, guardian: kind === 'ruin' ? guards[k] : null, stronghold });
  }

  // ---- anchor squares and guaranteed landings ----
  const coastalLand = (x, y) => {
    const t = tileAt(g, x, y); if (!t || t.terrain === 'water' || t.terrain === 'mountain' || t.cityId || t.site || t.port) return false;
    return D8.some(([dx, dy]) => { const n = tileAt(g, x + dx, y + dy); return n && n.terrain === 'water' && !n.lake; });
  };
  const nearestCoast = (x0, y0, maxR) => {
    let best = null, bd = 1e9;
    for (let y = Math.max(0, y0 - maxR); y <= Math.min(H - 1, y0 + maxR); y++) for (let x = Math.max(0, x0 - maxR); x <= Math.min(W - 1, x0 + maxR); x++) {
      if (!coastalLand(x, y)) continue; const d = Math.hypot(x - x0, y - y0); if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  };
  map.cities.forEach(([y, x], i) => {
    if (!map.ports[i] || isEmbarkPoint(g, x, y)) return;
    const c = nearestCoast(x, y, 6); if (!c) return;
    setTile(g, c[0], c[1], { port: true }); notes.portsAdded.push({ city: `c${i}`, x: c[0], y: c[1] });
  });
  // every walkable landmass that holds a castle needs somewhere to come ashore
  const seen = new Uint8Array(W * H);
  const walk = (x, y) => { const t = tileAt(g, x, y); return t && (t.terrain !== 'water' || t.bridge); };
  map.cities.forEach(([cy, cx], ci) => {
    if (seen[at(cx, cy)]) return;
    const comp = []; const q = [[cx, cy]]; seen[at(cx, cy)] = 1;
    for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; comp.push([x, y]);
      for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[at(nx, ny)] || !walk(nx, ny)) continue; seen[at(nx, ny)] = 1; q.push([nx, ny]); } }
    if (comp.some(([x, y]) => isEmbarkPoint(g, x, y))) return;
    // no coastal castle, no anchor square: put one on the coast of this landmass nearest to a castle
    let best = null, bd = 1e9;
    for (const [x, y] of comp) if (coastalLand(x, y)) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = [x, y]; } }
    if (best) { setTile(g, best[0], best[1], { port: true }); notes.landingsAdded.push({ x: best[0], y: best[1], forCity: `c${ci}` }); }
  });

  // ---- armies ----
  const fill = (c, owner, count) => { for (let k = 0; k < count; k++) addArmy(g, c.production[k % c.production.length], owner, c.x, c.y); };
  map.cities.forEach((_, i) => {
    const c = g.cities.get(`c${i}`);
    if (c.owner) {
      if (capSet.has(i)) {      // hero + two of the realm's signature army (Matt, 2026-10-22; was the three cheapest kinds it builds)
        const sig = signatureOf(c.owner);
        for (let k = 0; k < START_SIGNATURE_ARMIES; k++) addArmy(g, sig, c.owner, c.x, c.y, ARMIES[sig].special ? { cityBuilt: true } : {});
        const hero = addArmy(g, 'hero', c.owner, c.x, c.y, { name: rng.pick(HERO_NAMES) }); giveStandard(g, hero.id);
      }
      else fill(c, c.owner, 1 + Math.floor(rng.next() * 2));
    } else {
      // the Unsworn: one defender (manual 14a). Islet castles are never 'normal': the voyage should be answered by a real fight
      const kind = map.isle[i] && neutrals === 'normal' ? 'strong' : neutrals;
      const type = kind === 'normal' ? c.production.slice().sort((a, b) => ARMIES[a].str - ARMIES[b].str || ARMIES[a].cost - ARMIES[b].cost)[0] : rng.pick(c.production);
      addArmy(g, type, null, c.x, c.y); if (kind === 'active') c.active = true;
    }
  });
  g.map = { shape: map.shape, seed: map.seed, caps: map.caps.filter((_, r) => r < realmIds.length).map((c) => `c${c}`), isle: map.cities.map((_, i) => (map.isle[i] ? `c${i}` : null)).filter(Boolean),
    roads: (map.roads ?? []).map((r) => r.cells.map(([y, x]) => y * W + x)) };     // the road routes as the generator laid them (squares in order), so the painter can draw smooth roads
  return { game: g, notes };
}
