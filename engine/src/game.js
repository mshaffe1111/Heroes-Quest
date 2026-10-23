import { ARMIES, isBuildableType, priceOf } from './armies.js';
import { makeRules } from './rules.js';
import { makeRng } from './rng.js';
import { createArmy, isHero, moveOf, grantXp } from './units.js';
import { defaultOrder, applyCustomOrder, displayArmy, stackBadge } from './stack.js';
import { resolveBattle } from './combat.js';
import { groupMoveCost, canPay, spendMovePoints, groupCanFly, landsAshore } from './movement.js';
import { isRoughGround, isSea, isLandingKind } from './terrain.js';
import { dropDeadHeroItems, speedMultiplier, heroTax, makeItem } from './items.js';
import { questKills, questCapture, checkQuest } from './quests.js';
import { revealAround, refreshFog, sightOf } from './fog.js';
import { emit, isRecording as recordingNow } from './events.js';
import { exactOdds } from './advisor.js';
import { newTurnOrders, statusFrom as statusOf } from './orders.js';
import { hasDoctrine, buildTurns, cityHealOf, heroPriceFor, battleXpFor, taxFor } from './doctrines.js';
import { blankStats, openLedger, stat, earned, spent, logBattle, closeRound } from './stats.js';
import { cityDefenceBonus, siteDefenceBonus, realmIncome, realmUpkeep, establishCost, validateProductionType,
  applyCapture } from './economy.js';

const key = (x, y) => `${x},${y}`;
const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;

export function createGame({ width = 20, height = 20, rules = {}, seed = 1 } = {}) {
  const r = makeRules(rules); r.docs = new Map();      // doctrines owned: realmId -> Set of keys (doctrines.js)
  return { rules: r, rng: makeRng(seed), seed, width, height, turn: 1, tiles: new Map(),
    realms: new Map(), cities: new Map(), armies: new Map(), transit: [], events: [], nextArmyId: 1,
    sites: new Map(), flags: new Map(), groundItems: new Map(), pendingSage: null, nextItemId: 1, stats: blankStats() };
}

// ---- building the world -------------------------------------------------------
export const inBounds = (g, x, y) => x >= 0 && y >= 0 && x < g.width && y < g.height;
// A flat array of the same tile objects (g._ta; the underscore keeps it out of saves), so a lookup needs no string key.
// Anything that replaces a tile object must go through setTile or clear g._ta.
function tileArray(g) {
  const a = new Array(g.width * g.height).fill(undefined);
  for (const [k, v] of g.tiles) { const i = k.indexOf(','); a[+k.slice(i + 1) * g.width + +k.slice(0, i)] = v; }
  a.n = g.tiles.size; a.src = g.tiles; return (g._ta = a);
}
export function tileAt(g, x, y) {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
  const a = g._ta && g._ta.n === g.tiles.size && g._ta.src === g.tiles ? g._ta : tileArray(g);
  return a[y * g.width + x] ?? { terrain: 'open' };
}
export function setTile(g, x, y, props) {
  const t = { ...(g.tiles.get(key(x, y)) ?? { terrain: 'open' }), ...props }; g.tiles.set(key(x, y), t);
  if (g._ta) { if (g._ta.n !== g.tiles.size || g._ta.src !== g.tiles) g._ta = null; else g._ta[y * g.width + x] = t; }
}
export function addRealm(g, { id, name = id, gold = g.rules.startGold, human = false }) {
  const realm = { id, name, gold, human, fightOrder: [], deficit: false, quest: null, questOffer: null, heroOffer: null };
  g.realms.set(id, realm);
  openLedger(g, realm);
  return realm;
}
export function addCity(g, { id, name = id, x, y, income = 20, production = [], owner = null }) {
  for (const t of production) { const err = validateProductionType(t, owner); if (err) throw new Error(`${id}: ${t}: ${err}`); }
  if (production.length > 4) throw new Error('a city holds at most 4 army types');
  const city = { id, name, x, y, income, production: [...production], owner, building: null, vector: null, razed: false };
  g.cities.set(id, city);
  setTile(g, x, y, { cityId: id });
  return city;
}
export function addArmy(g, type, owner, x, y, extra = {}) {
  const army = createArmy(type, owner, { id: `a${g.nextArmyId++}`, ...extra });
  army.mp = moveOf(army, g.rules);
  army.fresh = true;   // first refresh gives full move points, no carry-over bonus
  g.armies.set(army.id, army);
  if (x != null) placeArmy(g, army, x, y);
  return army;
}
function placeArmy(g, army, x, y) { army.x = x; army.y = y; }

// ---- looking things up ----------------------------------------------------------
export const cityAt = (g, x, y) => { const t = tileAt(g, x, y); return t?.cityId ? g.cities.get(t.cityId) : null; };
export const armiesAt = (g, x, y) => [...g.armies.values()].filter((a) => a.x === x && a.y === y);
export const armyLimitAt = (g, x, y) => (cityAt(g, x, y) ? g.rules.cityGarrisonLimit : g.rules.stackLimit);

/** Armies on a tile in fight order for their realm. */
export function orderedArmiesAt(g, x, y, owner) {
  const armies = armiesAt(g, x, y).filter((a) => a.owner === owner);
  const overRough = isRoughGround(tileAt(g, x, y));
  return applyCustomOrder(armies, g.realms.get(owner)?.fightOrder, g.rules, { overRough });
}
/** What the map draws for a square: the top army and a count badge. */
export function stackViewAt(g, x, y) {
  const armies = armiesAt(g, x, y);
  if (!armies.length) return null;
  const owner = armies[0].owner;
  const ordered = orderedArmiesAt(g, x, y, owner);
  return { owner, armies: ordered, top: displayArmy(ordered), badge: stackBadge(ordered) };
}
export function setFightOrder(g, realmId, ids) { g.realms.get(realmId).fightOrder = [...ids]; }

/** What the square gives its defenders. Stone Walls adds 1 for the city's owner; pass `byRealm` (the attacker) and Sapper Corps takes 1 off a city that is not theirs. */
export function tileDefenceBonus(g, x, y, byRealm = null) {
  const t = tileAt(g, x, y);
  const c = cityAt(g, x, y);
  if (!c) return siteDefenceBonus(t.site);
  let b = cityDefenceBonus(c);
  if (c.owner && !c.razed && hasDoctrine(g.rules, c.owner, 'walls')) b += 1;
  if (byRealm && c.owner !== byRealm && hasDoctrine(g.rules, byRealm, 'sappers')) b = Math.max(0, b - 1);
  return b;
}

// ---- moving ---------------------------------------------------------------------
function groupOf(g, ids) {
  const armies = ids.map((id) => g.armies.get(id));
  if (armies.some((a) => !a)) throw new Error('unknown army in group');
  const first = armies[0];
  if (armies.some((a) => a.owner !== first.owner || a.x !== first.x || a.y !== first.y)) throw new Error('group must share owner and square');
  return armies;
}
const clearDefend = (armies) => armies.forEach((a) => { a.defending = false; a.camped = false; a.fortified = false; });

// ---- naval transport (manual ch.8d) -----------------------------------------------------------
const DIRS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/** A square that touches sea, river or bridged water (a lake does not count: boats cannot get onto it). */
export const touchesWater = (g, x, y) => DIRS8.some(([dx, dy]) => { const t = tileAt(g, x + dx, y + dy); return t?.terrain === 'water' && !t.lake; });
/** Groups can take to the boats, or leave them, at a coastal city, a port (anchor square) or a bridge. */
export function isEmbarkPoint(g, x, y) {
  const t = tileAt(g, x, y);
  if (!t || !isLandingKind(t)) return false;
  return t.bridge ? true : touchesWater(g, x, y);
}
const mixedAfloat = (armies) => armies.some((a) => a.afloat) && armies.some((a) => !a.afloat);

/**
 * Take to the boats. Every army "hires its own boat", so the whole group goes afloat together. The group stops
 * (move points go to 0) and sails from the next turn. Flyers simply fly instead, so a group that can fly cannot embark.
 */
export function embark(g, ids) {
  const armies = groupOf(g, ids);
  if (armies.some((a) => a.afloat)) return { ok: false, reason: 'already-afloat' };
  if (groupCanFly(armies)) return { ok: false, reason: 'group-can-fly' };
  if (!isEmbarkPoint(g, armies[0].x, armies[0].y)) return { ok: false, reason: 'not-an-embarkation-point' };
  armies.forEach((a) => { a.afloat = true; a.mp = 0; });
  clearDefend(armies);
  emit(() => ({ t: 'embark', realm: armies[0].owner, ids: ids.slice(), types: armies.map((a) => a.type), at: [armies[0].x, armies[0].y] }));
  return { ok: true };
}
/** Step off the boats without moving (on a city, port or bridge square). The move stops. */
export function disembark(g, ids) {
  const armies = groupOf(g, ids);
  if (!armies.every((a) => a.afloat)) return { ok: false, reason: 'not-afloat' };
  if (!isEmbarkPoint(g, armies[0].x, armies[0].y)) return { ok: false, reason: 'not-a-disembarkation-point' };
  armies.forEach((a) => { a.afloat = false; a.mp = 0; });
  emit(() => ({ t: 'disembark', realm: armies[0].owner, ids: ids.slice(), types: armies.map((a) => a.type), at: [armies[0].x, armies[0].y] }));
  return { ok: true };
}

/** Move a group one square. Returns { ok } or { ok:false, reason, ... }. Enemy squares must be attacked instead. */
export function moveGroup(g, ids, x, y) {
  const armies = groupOf(g, ids);
  if (armies.length > g.rules.stackLimit) return { ok: false, reason: 'group-too-big' };   // 8 move together
  const from = { x: armies[0].x, y: armies[0].y };
  const to = { x, y };
  const tile = tileAt(g, x, y);
  if (!tile) return { ok: false, reason: 'off-map' };
  if (!adjacent(from, to)) return { ok: false, reason: 'not-adjacent' };
  const owner = armies[0].owner;
  const city = cityAt(g, x, y);
  const there = armiesAt(g, x, y);
  if (there.some((a) => a.owner !== owner)) return { ok: false, reason: 'enemy-here' };
  if (city && city.owner !== owner && !city.razed) return { ok: false, reason: 'enemy-city' };     // a razed city is open ground: anyone may walk onto the ruin (and rebuild it)
  if (mixedAfloat(armies)) return { ok: false, reason: 'mixed-group' };      // some in boats, some on foot: split the group first
  const cost = groupMoveCost(armies, tile, g.rules);
  if (!Number.isFinite(cost)) {
    const afloat = armies.every((a) => a.afloat);
    if (!afloat && isSea(tile) && isEmbarkPoint(g, from.x, from.y)) return { ok: false, reason: 'embark-first' };
    return { ok: false, reason: afloat && tile.terrain !== 'water' ? 'not-a-landing-point' : 'forbidden-terrain' };
  }
  if (!canPay(armies, cost)) return { ok: false, reason: 'no-move-points' };
  const incoming = there.filter((a) => !ids.includes(a.id)).length + armies.length;
  if (incoming > armyLimitAt(g, x, y)) return { ok: false, reason: 'stack-limit' };
  const landing = landsAshore(armies, tile);
  spendMovePoints(armies, cost);
  clearDefend(armies);
  armies.forEach((a) => { a.x = x; a.y = y; });
  if (landing) armies.forEach((a) => { a.afloat = false; a.mp = 0; });      // coming ashore ends the move
  else if (groupCanFly(armies)) armies.forEach((a) => { a.afloat = false; });  // flyers never need a boat
  if (g.rules.fog) revealAround(g, owner, x, y, Math.max(...armies.map(sightOf)));
  emit(() => ({ t: 'move', realm: owner, ids: ids.slice(), types: armies.map((a) => a.type), from: [from.x, from.y], to: [x, y], afloat: !!armies[0].afloat, landed: landing }));
  return { ok: true, cost, landed: landing };
}

/** Walk a path (list of {x,y}); stops at the first square that cannot be entered. */
export function moveAlong(g, ids, path) {
  let steps = 0;
  for (const p of path) {
    const r = moveGroup(g, ids, p.x, p.y);
    if (!r.ok) return { steps, stoppedBecause: r.reason };
    steps++;
  }
  return { steps, stoppedBecause: null };
}

// ---- fighting ---------------------------------------------------------------------
function removeArmies(g, list) { list.forEach((a) => g.armies.delete(a.id)); }
/** A dead hero's items drop on the square where he fell; in open water they are lost. */
function heroDeaths(g, dead, x, y, atSea) { for (const a of dead) if (isHero(a)) dropDeadHeroItems(g, a, x, y, atSea); }
function placeQuestAlly(g, realmId, done) {
  if (done.hero) {     // a quest reward hero: on the questing hero's square, else in one of the realm's cities with room; no room or at the hero limit: gold instead
    const spot = done.hero.x != null ? done.hero : null;
    const h = (spot && joinHero(g, realmId, spot.x, spot.y)) || joinHeroInCity(g, realmId);
    if (h) { done.heroJoined = h.id; g.events.push({ type: 'hero-joined', army: h.id, name: h.name, from: 'quest' }); }
    else { g.realms.get(realmId).gold += 300; earned(g, realmId, 300); done.heroPaidAsGold = 300; }     // PLACEHOLDER
    return;
  }
  if (!done.ally) return;
  if (armiesAt(g, done.ally.x, done.ally.y).length < armyLimitAt(g, done.ally.x, done.ally.y)) addArmy(g, done.ally.type, realmId, done.ally.x, done.ally.y);
  else { g.realms.get(realmId).gold += 300; earned(g, realmId, 300); }    // PLACEHOLDER: no room for the ally, so it is paid in gold instead
}

function awardBattleXp(g, winners) {
  for (const a of winners) if (isHero(a)) grantXp(a, battleXpFor(g.rules, a), g.rules);
}

/**
 * Attack an adjacent square with a group. Survivors move in if the square is clear.
 * Taking a city returns { captureNeeded:true, cityId } and the attackers wait outside until resolveCapture().
 */
/**
 * Where defenders on open ground could fall back to: a neighbouring square they can walk onto with no enemy on it and room for them all.
 * Their own city is best, then a square already holding their own armies, then open ground as far from the attackers as it goes. null = nowhere to go.
 */
export function fallBackTile(g, defenders, x, y, from) {
  const owner = defenders[0]?.owner; let best = null;
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx, ny = y + dy; const t = tileAt(g, nx, ny);
    if (!t || (nx === from.x && ny === from.y)) continue;
    if (!Number.isFinite(groupMoveCost(defenders, t, g.rules))) continue;
    const here = armiesAt(g, nx, ny); if (here.some((a) => a.owner !== owner)) continue;
    const c = cityAt(g, nx, ny); if (c && (c.owner !== owner || c.razed)) continue;
    if (here.length + defenders.length > armyLimitAt(g, nx, ny)) continue;
    const score = (c ? 100 : 0) + (here.length ? 50 : 0) + Math.max(Math.abs(nx - from.x), Math.abs(ny - from.y));
    if (!best || score > best.score) best = { x: nx, y: ny, score };
  }
  return best && { x: best.x, y: best.y };
}

// A screen can listen for every fight (the page uses it to replay the computer realms' attacks on the player). It only listens: nothing in the rules reads it.
let battleHook = null;
export function setBattleHook(fn) { battleHook = fn; }

export function attack(g, ids, x, y, opts = {}) {
  const attacker = groupOf(g, ids)[0]?.owner ?? null;
  const defOwner = armiesAt(g, x, y).find((a) => a.owner !== attacker)?.owner ?? cityAt(g, x, y)?.owner ?? null;
  const city = cityAt(g, x, y); const tile = tileAt(g, x, y);
  const seen = recordingNow() ? { from: [groupOf(g, ids)[0].x, groupOf(g, ids)[0].y], attTypes: groupOf(g, ids).map((a) => a.type), defTypes: armiesAt(g, x, y).filter((a) => a.owner !== attacker).map((a) => a.type), defIds: armiesAt(g, x, y).filter((a) => a.owner !== attacker).map((a) => a.id), cityId: city?.id ?? null,
    odds: (() => { try { const dfs = armiesAt(g, x, y).filter((a) => a.owner !== attacker); return dfs.length ? exactOdds({ attackers: groupOf(g, ids), defenders: dfs, tile, cityBonus: tileDefenceBonus(g, x, y), camped: dfs.some((a) => a.defending), rules: g.rules }).winChance : 1; } catch { return null; } })() } : null;      // the odds as they stood (blunder check, playback)
  const res = attackCore(g, ids, x, y, opts);
  if (seen && res.ok) emit(() => ({ t: 'attack', realm: attacker, defender: defOwner, ids: ids.slice(), from: seen.from, at: [x, y], place: city?.name ?? null, cityId: seen.cityId, attTypes: seen.attTypes, defTypes: seen.defTypes, defIds: seen.defIds,
    winner: res.battle?.winner ?? 'attacker', lostA: res.battle?.dead.attackers.length ?? 0, lostD: res.battle?.dead.defenders.length ?? 0, retreated: !!res.retreated, fled: !!res.battle?.fled, fledTo: res.battle?.fledTo ? [res.battle.fledTo.x, res.battle.fledTo.y] : null,
    captureNeeded: !!res.captureNeeded, fought: !!res.battle, battle: res.battle ?? null, tile, odds: seen.odds }));
  if (battleHook && res.ok && res.battle) { try { battleHook({ result: res, attacker, defender: defOwner, x, y, place: city?.name ?? null, tile }); } catch { /* a listener must never change a fight */ } }
  return res;
}
function attackCore(g, ids, x, y, { retreat = null, fallBack = null } = {}) {
  const armies = groupOf(g, ids);
  if (armies.length > g.rules.stackLimit) return { ok: false, reason: 'group-too-big' };   // at most 8 attack at once
  const owner = armies[0].owner;
  const tile = tileAt(g, x, y);
  if (!tile) return { ok: false, reason: 'off-map' };
  if (!adjacent(armies[0], { x, y })) return { ok: false, reason: 'not-adjacent' };
  if (mixedAfloat(armies)) return { ok: false, reason: 'mixed-group' };
  const city = cityAt(g, x, y);
  const defenders = armiesAt(g, x, y).filter((a) => a.owner !== owner);
  const hostileCity = city && city.owner !== owner && !city.razed;
  if (!defenders.length && !hostileCity) return { ok: false, reason: 'nothing-to-attack' };
  const cost = groupMoveCost(armies, tile, g.rules);
  if (!Number.isFinite(cost)) return { ok: false, reason: 'forbidden-terrain' };
  if (!canPay(armies, cost)) return { ok: false, reason: 'no-move-points' };

  spendMovePoints(armies, cost);
  clearDefend(armies);
  const from = { x: armies[0].x, y: armies[0].y };
  const att = applyCustomOrder(armies, g.realms.get(owner)?.fightOrder, g.rules);
  const defOwner = defenders[0]?.owner ?? null;
  const dfn = defenders.length ? applyCustomOrder(defenders, g.realms.get(defOwner)?.fightOrder, g.rules,
    { overRough: isRoughGround(tile) }) : [];

  let battle = null;
  if (dfn.length) {
    const camped = dfn.every((a) => a.camped || (a.defending && hasDoctrine(g.rules, a.owner, 'line'))) && !city;
    battle = resolveBattle({ attackers: att, defenders: dfn, tile, cityBonus: tileDefenceBonus(g, x, y, owner), camped, rng: g.rng, rules: g.rules, retreat,
      fallBack: !city && !isSea(tile) && fallBack && fallBackTile(g, dfn, x, y, from) ? fallBack : null });
    // wounds stay with the survivors after the battle (Heroes Quest); classic mode forgets them
    if (!g.rules.classic) for (const a of [...battle.survivors.attackers, ...battle.survivors.defenders]) a.wounded = battle.wounds.get(a.id) ?? 0;
    if (!g.rules.classic) for (const a of [...battle.survivors.attackers, ...battle.survivors.defenders]) a.duelsWon = (a.duelsWon || 0) + (battle.duelsWon.get(a.id) || 0);
    removeArmies(g, battle.dead.attackers);
    removeArmies(g, battle.dead.defenders);
    heroDeaths(g, battle.dead.defenders, x, y, isSea(tile));
    heroDeaths(g, battle.dead.attackers, from.x, from.y, isSea(tileAt(g, from.x, from.y)));
    logBattle(g, { attacker: owner, defender: defOwner, x, y, place: city?.name ?? null, attackers: att.length, defenders: dfn.length, winner: battle.winner,
      lostAttackers: battle.dead.attackers.length, lostDefenders: battle.dead.defenders.length,
      heroLostA: battle.dead.attackers.filter(isHero).length, heroLostD: battle.dead.defenders.filter(isHero).length, retreated: battle.retreated, fled: battle.fled });
    const qdone = questKills(g, owner, att, battle.dead.defenders); if (qdone) placeQuestAlly(g, owner, qdone);
    if (battle.retreated) {     // the attacker called it off: survivors stay where they started, wounds and all; nobody won, so no battle experience
      return { ok: true, battle, captureNeeded: false, attackersWon: false, retreated: true };
    }
    awardBattleXp(g, battle.winner === 'attacker' ? battle.survivors.attackers : battle.survivors.defenders);
    if (battle.fled) {          // defenders in the open gave ground: they move to the fall-back square, wounds and all, and the attackers hold the field
      const to = fallBackTile(g, battle.survivors.defenders, x, y, from);
      if (to) battle.survivors.defenders.forEach((a) => { placeArmy(g, a, to.x, to.y); a.mp = 0; a.defending = false; a.camped = false; });
      battle.fledTo = to;
    }
    if (battle.winner === 'defender') {
      if (city && !city.owner && city.active) city.provoked = true;      // an active neutral that beat off an attack starts building defenders
      return { ok: true, battle, captureNeeded: false, attackersWon: false };
    }
  }
  // attackers hold the field
  const survivors = battle ? battle.survivors.attackers : att;
  if (hostileCity) {
    g.pendingCapture = { cityId: city.id, ids: survivors.map((a) => a.id), from };
    return { ok: true, battle, captureNeeded: true, cityId: city.id, attackersWon: true };
  }
  const landed = landsAshore(survivors, tile);
  survivors.forEach((a) => { placeArmy(g, a, x, y); if (landed) { a.afloat = false; a.mp = 0; } });
  refreshFog(g, owner);
  return { ok: true, battle, captureNeeded: false, attackersWon: true, fled: !!battle?.fled, fledTo: battle?.fledTo ?? null };
}

/** Finish taking a city: choose occupy, pillage, sack or raze. Survivors move in (unless razed). */
export function resolveCapture(g, choice) {
  const p = g.pendingCapture;
  if (!p) throw new Error('no city is waiting to be captured');
  const city = g.cities.get(p.cityId);
  const survivors = p.ids.map((id) => g.armies.get(id)).filter(Boolean);
  const realmId = survivors[0].owner;
  const prevOwner = city.owner;
  const gold = applyCapture(city, realmId, choice, g.rules);
  g.realms.get(realmId).gold += gold; earned(g, realmId, gold);
  if (choice !== 'raze') stat(g, realmId, 'citiesTaken');
  stat(g, prevOwner, 'citiesLost');
  const qdone = questCapture(g, realmId, survivors, city, choice, gold); if (qdone) placeQuestAlly(g, realmId, qdone);
  const fromBoats = survivors.length && survivors.every((a) => a.afloat);
  survivors.forEach((a) => placeArmy(g, a, city.x, city.y));
  // an assault from the sea ends with the armies ashore (the manual does not say what is left of their move: placeholder)
  if (fromBoats && !groupCanFly(survivors)) survivors.forEach((a) => { a.afloat = false; if (g.rules.captureFromBoatEndsMove) a.mp = 0; });
  for (const a of survivors) if (isHero(a)) grantXp(a, g.rules.xp.city, g.rules);
  g.pendingCapture = null;
  refreshFog(g, realmId);
  emit(() => ({ t: 'capture', realm: realmId, prevOwner, cityId: city.id, name: city.name, at: [city.x, city.y], choice, gold, razed: choice === 'raze' }));
  return { gold, city };
}

/** later-sequel add-on: rebuild a razed city for 800 gp. Needs a group standing on the ruin. */
export function rebuildCity(g, realmId, cityId) {
  const city = g.cities.get(cityId);
  const realm = g.realms.get(realmId);
  if (!city.razed) return { ok: false, reason: 'not-razed' };
  if (realm.gold < g.rules.rebuildRazedCityCost) return { ok: false, reason: 'not-enough-gold' };
  if (!armiesAt(g, city.x, city.y).some((a) => a.owner === realmId)) return { ok: false, reason: 'no-army-on-site' };
  realm.gold -= g.rules.rebuildRazedCityCost; spent(g, realmId, g.rules.rebuildRazedCityCost);
  city.razed = false;
  city.owner = realmId;
  city.production = [];
  return { ok: true };
}

/** Neutral cities act once a round: an active neutral that has been attacked builds one extra defender a turn, up to five (manual 14a). */
export function neutralTurn(g) {
  for (const a of g.armies.values()) if (!a.owner && a.wounded) a.wounded = 0;       // the Unsworn do not carry wounds from round to round
  for (const c of g.cities.values()) {
    if (c.owner || c.razed || !c.active || !c.provoked || !c.production.length) continue;
    if (armiesAt(g, c.x, c.y).length >= g.rules.neutralMaxDefenders) continue;
    addArmy(g, c.production[Math.floor(g.rng.next() * c.production.length)], null, c.x, c.y);
  }
}
/** The realm holding more than half of all cities, if any: the others give up (manual 4k). */
export function victor(g) {
  const live = [...g.cities.values()].filter((c) => !c.razed); const count = new Map();
  for (const c of live) if (c.owner) count.set(c.owner, (count.get(c.owner) ?? 0) + 1);
  for (const [r, n] of count) if (n * 2 > live.length) return r;
  return null;
}
/** Every realm that still has a city or an army. */
export function liveRealms(g) {
  return [...g.realms.keys()].filter((r) => !g.realms.get(r).conceded).filter((r) => [...g.cities.values()].some((c) => c.owner === r) || [...g.armies.values()].some((a) => a.owner === r && a.x != null));
}
/** End of a round, after every realm has played. */
export function endRound(g) { neutralTurn(g); closeRound(g, liveRealms(g)); g.turn++; }

// ---- Defend / camp -----------------------------------------------------------------
/** Defend order: after a full turn without moving, the stack is encamped (+1 defence). */
export function defend(g, ids) { groupOf(g, ids).forEach((a) => { a.defending = true; }); }

// ---- production ---------------------------------------------------------------------
export function setProduction(g, cityId, type) {
  const city = g.cities.get(cityId);
  if (!city.production.includes(type)) return { ok: false, reason: 'city-cannot-build-that' };
  if (city.building?.type !== type) city.building = { type, progress: 0 };
  return { ok: true };
}
/** Pay to add an army type to a city (the "cost to establish"). If all 4 slots are full, say which to replace. */
export function addProductionType(g, realmId, cityId, type, replace = null) {
  const city = g.cities.get(cityId);
  const realm = g.realms.get(realmId);
  const err = validateProductionType(type, realmId);
  if (err) return { ok: false, reason: err };
  if (city.owner !== realmId) return { ok: false, reason: 'not-your-city' };
  if (city.production.includes(type)) return { ok: false, reason: 'already-builds-it' };
  const cost = establishCost(type, g.rules);
  if (realm.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  if (city.production.length >= 4) {
    if (replace == null || !city.production.includes(replace)) return { ok: false, reason: 'slots-full-choose-one-to-replace' };
    city.production[city.production.indexOf(replace)] = type;
    if (city.building?.type === replace) city.building = null;
  } else city.production.push(type);
  realm.gold -= cost; spent(g, realmId, cost);
  return { ok: true, cost };
}
export function setVector(g, cityId, destCityId) { g.cities.get(cityId).vector = destCityId; }

// ---- heroes ----------------------------------------------------------------------------
export function heroLimit(g, realmId) {
  const owned = [...g.cities.values()].filter((c) => c.owner === realmId).length;
  return owned * 2 > g.cities.size ? g.rules.maxHeroesMajority : g.rules.maxHeroes;
}
export function hireHero(g, realmId, cityId, cost, extra = {}) {
  const realm = g.realms.get(realmId);
  const city = g.cities.get(cityId);
  const heroes = [...g.armies.values()].filter((a) => a.owner === realmId && isHero(a)).length;
  if (heroes >= heroLimit(g, realmId)) return { ok: false, reason: 'too-many-heroes' };
  if (realm.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  if (armiesAt(g, city.x, city.y).length >= g.rules.cityGarrisonLimit) return { ok: false, reason: 'no-room' };     // the city already holds 8
  realm.gold -= cost; spent(g, realmId, cost); stat(g, realmId, 'heroesHired');
  const hero = addArmy(g, 'hero', realmId, city.x, city.y, extra);
  emit(() => ({ t: 'hero', realm: realmId, cityId, name: hero.name ?? null, at: [city.x, city.y], cost }));
  return { ok: true, hero };
}

// ---- hero extras: offers, the Standard, items ------------------------------------------------------------------
const HERO_NAMES = ['Aldric', 'Brenna', 'Cassian', 'Dara', 'Edric', 'Fenna', 'Gareth', 'Hilde', 'Ivor', 'Jora', 'Kell', 'Lyra'];
export function heroHireCost(g, realmId) {
  const n = [...g.armies.values()].filter((a) => a.owner === realmId && isHero(a)).length;
  return heroPriceFor(g.rules, realmId, n === 0 ? g.rules.heroHireFirst : g.rules.heroHireBase + g.rules.heroHirePerHero * (n - 1));
}
const heroCount = (g, realmId) => { let n = 0; for (const a of g.armies.values()) if (a.owner === realmId && isHero(a)) n++; return n; };
const citiesWithRoom = (g, realmId) => [...g.cities.values()].filter((c) => c.owner === realmId && !c.razed && armiesAt(g, c.x, c.y).length < g.rules.cityGarrisonLimit);
/**
 * Rare in Heroes Quest (1 in 80 a turn), 1 in 6 a turn under classic rules; a hero offers himself for hire. The offer lasts that turn.
 * The chance is only rolled on a turn the realm could take him: under the hero limit, gold for his price, and a city with room for him.
 * A turn it could not take him does not use up the chance (Matt, 2026-10-22).
 */
function rollHeroOffer(g, realmId) {
  const realm = g.realms.get(realmId); realm.heroOffer = null;
  if (heroCount(g, realmId) >= heroLimit(g, realmId)) return null;
  const cost = heroHireCost(g, realmId); if (realm.gold < cost) return null;
  const cities = citiesWithRoom(g, realmId); if (!cities.length) return null;
  if (g.rng.next() >= (g.rules.classic ? g.rules.heroOfferChanceClassic : g.rules.heroOfferChance)) return null;
  const city = cities[Math.floor(g.rng.next() * cities.length)];
  realm.heroOffer = { cityId: city.id, cost, name: HERO_NAMES[Math.floor(g.rng.next() * HERO_NAMES.length)] };
  return { type: 'hero-offer', ...realm.heroOffer };
}
export function acceptHero(g, realmId) {
  const o = g.realms.get(realmId).heroOffer; if (!o) return { ok: false, reason: 'no-offer' };
  const r = hireHero(g, realmId, o.cityId, o.cost, { name: o.name });
  if (r.ok) g.realms.get(realmId).heroOffer = null; return r;
}
/** A hero joins the realm for nothing (a ruin or quest reward) on this square. Needs the realm under its hero limit and room on the square. Returns the hero or null. */
export function joinHero(g, realmId, x, y) {
  if (!realmId || heroCount(g, realmId) >= heroLimit(g, realmId)) return null;
  if (armiesAt(g, x, y).length >= armyLimitAt(g, x, y)) return null;
  return addArmy(g, 'hero', realmId, x, y, { name: HERO_NAMES[Math.floor(g.rng.next() * HERO_NAMES.length)] });
}
/** As joinHero, in the realm's first city with room. */
function joinHeroInCity(g, realmId) { const c = citiesWithRoom(g, realmId)[0]; return c ? joinHero(g, realmId, c.x, c.y) : null; }
/** Can this realm take one more hero (under its limit)? */
export const underHeroLimit = (g, realmId) => heroCount(g, realmId) < heroLimit(g, realmId);
/** The first hero of a realm arrives with the realm Standard. */
export function giveStandard(g, heroId) { const h = g.armies.get(heroId); const it = makeItem(g, 'standard'); h.items.push(it); return it; }

/** Plant the Standard. Not in water, mountains, cities, ruins or temples; fine in open ground, roads, woods and hills (Rules of Engagement). */
export function plantStandard(g, heroId) {
  const h = g.armies.get(heroId); const i = h.items.findIndex((it) => it.standard);
  if (i < 0) return { ok: false, reason: 'no-standard' };
  const t = tileAt(g, h.x, h.y);
  if (t.terrain === 'water' || t.terrain === 'mountain' || t.cityId || t.site) return { ok: false, reason: 'cannot-plant-here' };
  if (g.flags.has(h.owner)) return { ok: false, reason: 'already-planted' };
  const [it] = h.items.splice(i, 1); g.flags.set(h.owner, { x: h.x, y: h.y, item: it });
  return { ok: true };
}
export function takeStandard(g, heroId) {
  const h = g.armies.get(heroId); const f = g.flags.get(h.owner);
  if (!f || f.x !== h.x || f.y !== h.y) return { ok: false, reason: 'no-flag-here' };
  h.items.push(f.item); g.flags.delete(h.owner); return { ok: true };
}

// ---- the turn ----------------------------------------------------------------------------
export function realmEconomy(g, realmId) {
  const tax = [...g.armies.values()].filter((a) => a.owner === realmId && a.x != null && isHero(a)).reduce((sum, h) => sum + heroTax(h), 0);
  const income = realmIncome([...g.cities.values()], realmId) + tax + taxFor(g.rules, realmId, [...g.cities.values()].filter((c) => c.owner === realmId && !c.razed).length);
  const upkeep = realmUpkeep([...g.armies.values()], realmId, g.rules);   // every army costs its upkeep every turn, armies on the road included
  return { income, upkeep, net: income - upkeep };
}

/** Start of a realm's turn: money, new armies, arrivals, refresh move points, camps. */
export function beginTurn(g, realmId) {
  const realm = g.realms.get(realmId);
  const events = [];
  const eco = realmEconomy(g, realmId);
  realm.gold += eco.net; earned(g, realmId, eco.income); spent(g, realmId, eco.upkeep);
  realm.deficit = realm.gold < 0;
  events.push({ type: 'money', ...eco, gold: realm.gold });

  // vectored armies that have finished travelling
  let flagArrivals = 0;
  for (const t of [...g.transit]) {
    if (t.owner !== realmId || t.arrive > g.turn) continue;
    g.transit.splice(g.transit.indexOf(t), 1);
    const home = g.cities.get(t.from);
    let target = null;
    if (t.to === 'flag') {
      const f = g.flags.get(realmId);
      const here = f ? armiesAt(g, f.x, f.y) : [];
      if (f && flagArrivals < g.rules.flagVectorPerTurn && here.length < g.rules.stackLimit && here.every((a) => a.owner === realmId)) { flagArrivals++; target = { x: f.x, y: f.y, id: 'flag' }; }     // never onto an enemy holding the flag square
    } else { const dest = g.cities.get(t.to); target = dest && dest.owner === realmId && !dest.razed ? dest : null; }
    if (!target && home?.owner === realmId && !home.razed) target = home;
    if (target && target.id !== 'flag' && armiesAt(g, target.x, target.y).length >= g.rules.cityGarrisonLimit) { t.arrive = g.turn + 1; g.transit.push(t); continue; }    // the garrison is full: wait on the road a turn
    if (!target) { g.armies.delete(t.army.id); stat(g, realmId, 'armiesLost'); events.push({ type: 'vector-lost', army: t.army.id }); continue; }
    placeArmy(g, t.army, target.x, target.y);
    events.push({ type: 'vector-arrived', army: t.army.id, city: target.id });
  }

  // production. Out of gold (Matt, 2026-10-22): while the realm's gold is below zero no city starts or finishes an army; the work pauses
  // where it is and carries on once the realm is back above zero. Nothing deserts, and upkeep is still charged.
  const inDebt = realm.gold < 0;
  for (const city of g.cities.values()) {
    if (city.owner !== realmId || city.razed || !city.building) continue;
    const def = ARMIES[city.building.type];
    if (inDebt) { events.push({ type: 'production-stalled', city: city.id, reason: 'debt' }); continue; }
    city.building.progress++;
    if (city.building.progress < buildTurns(g.rules, realmId, def)) continue;
    if (realm.gold < priceOf(def, g.rules)) { events.push({ type: 'production-stalled', city: city.id, reason: 'gold' }); continue; }
    const vectored = city.vector === 'flag' ? g.flags.has(realmId) : city.vector && g.cities.get(city.vector)?.owner === realmId;
    if (!vectored && armiesAt(g, city.x, city.y).length >= g.rules.cityGarrisonLimit) {
      events.push({ type: 'production-stalled', city: city.id, reason: 'garrison-full' }); continue;
    }
    realm.gold -= priceOf(def, g.rules); spent(g, realmId, priceOf(def, g.rules)); stat(g, realmId, 'armiesBuilt');
    city.building.progress = 0;
    const army = addArmy(g, def.key, realmId, vectored ? null : city.x, vectored ? null : city.y, def.special ? { cityBuilt: true } : {});   // a city-built special (a signature army) pays upkeep
    if (vectored) {
      g.transit.push({ army, owner: realmId, from: city.id, to: city.vector, arrive: g.turn + g.rules.vectorTravelTurns });
      events.push({ type: 'vectored', army: army.id, from: city.id, to: city.vector });
    } else events.push({ type: 'built', army: army.id, city: city.id, armyType: def.key });
  }

  // wounds heal only inside one of the realm's own cities (Heroes Quest)
  if (!g.rules.classic) for (const a of g.armies.values()) {
    if (a.owner !== realmId || a.x == null || !a.wounded) continue;
    const c = cityAt(g, a.x, a.y); if (c && c.owner === realmId && !c.razed) a.wounded = Math.max(0, a.wounded - cityHealOf(g.rules, realmId));
  }

  // a Field Medic's stack heals a little each turn wherever it stands
  if (!g.rules.classic) {
    const medic = new Set();
    for (const a of g.armies.values()) if (a.owner === realmId && a.x != null && isHero(a) && a.perks?.includes('field_medic')) medic.add(`${a.x},${a.y}`);
    for (const a of g.armies.values()) if (a.owner === realmId && a.x != null && a.wounded && medic.has(`${a.x},${a.y}`)) a.wounded = Math.max(0, a.wounded - g.rules.fieldMedicHeal);
  }

  // refresh movement (up to 2 unused points carry over) and finish camping.
  // A hero with a speed item doubles the move points of the stack he ended the last turn in (two such heroes: triple).
  const stacks = new Map();
  for (const a of g.armies.values()) if (a.owner === realmId && a.x != null) { const k = `${a.x},${a.y}`; (stacks.get(k) ?? stacks.set(k, []).get(k)).push(a); }
  for (const a of g.armies.values()) {
    if (a.owner !== realmId || a.x == null) continue;
    const mult = speedMultiplier(stacks.get(`${a.x},${a.y}`));
    a.mp = moveOf(a, g.rules) * mult + (a.fresh ? 0 : Math.min(g.rules.carryOverMovePoints, a.mp));
    a.fresh = false;
    if (a.defending) a.camped = true;
  }
  refreshFog(g, realmId);
  const woke = newTurnOrders(g, realmId); if (woke.length) events.push({ type: 'woke', armies: woke });
  const q = checkQuest(g, realmId); if (q) events.push(q);
  const offer = rollHeroOffer(g, realmId); if (offer) events.push(offer);
  g.events.push(...events);
  return events;
}

export { groupCanFly };
/** Is the game over, and why? (victory, conceded or eliminated) */
export const gameStatus = (g) => statusOf(g, victor, liveRealms);
