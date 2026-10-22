import { ARMIES, priceOf } from './armies.js';
import { armiesAt, cityAt, tileAt, moveGroup, attack, resolveCapture, embark, disembark, setProduction, acceptHero, tileDefenceBonus,
  orderedArmiesAt, realmEconomy, defend } from './game.js';
import { exactOdds } from './advisor.js';
import { defaultOrder } from './stack.js';
import { routeSearch, routeTo } from './pathfind.js';
import { exploreRuin, visitTemple, studyLibrary, siteAt, ruinWinChance, resolveSage } from './sites.js';
import { acceptQuest, declineQuest } from './quests.js';
import { isHero, def, moveOf, maxPips } from './units.js';
import { aiChoosePerk } from './perks.js';
import { buyDoctrine, doctrinePrice, hasDoctrine } from './doctrines.js';
import { fogOn, visibleSet, knownCity, tileIndex, isExplored as isExp } from './fog.js';
import { createArmy } from './units.js';

// A computer warlord. It gets no bonuses (manual 3e): same income, same armies, same rules as a human.
// What it does each turn, in order: answers hero offers and quests; chooses production; lets every group carry on toward its goal
// (attacking when the odds are good, boarding boats when the route needs them); sends heroes with escorts to temples and ruins;
// forms new attack groups from the armies a city can spare. All numbers are in AI below; none of them are the 90s original rules.
export const AI = {
  minGroup: 1,            // spare soldiers needed to set out (the odds decide, not the count)
  oddsToAttack: 0.62,     // advisor win chance needed to attack a city
  oddsToChoose: 0.55,     // a target must look at least this good to be chosen
  garrison: 2,            // armies a quiet city keeps
  docReserve: 600,        // gold a realm keeps back after buying a doctrine (lower = buys sooner)
  maxGarrison: 5,
  threatRange: 7,         // enemy armies this close raise the garrison
  exploreRange: 90,       // move points of travel for a hero errand
  scoutTurns: 20,         // turns a scout keeps exploring before it comes home (fog of war only)
  maxTargets: 10,         // candidate cities examined per group
  patience: 4,            // turns a group waits outside a city it cannot yet beat
  oddsNoise: 0,           // how far a commander's reading of the odds can be off (0 = exact; the odds themselves are exact, see advisor.exactOdds)
  travelTurns: 7,         // how many turns of travel a target may be away when it is chosen
  crewMax: 7,             // soldiers (besides a hero) in one attack group
  idle: 0,                // chance a city with spare soldiers sits still this turn instead of sending a group
  productionMistake: 0.25,// chance a city builds its second-best army instead of its best
  targetNoise: 0,         // chance a group picks any acceptable target instead of the best-scoring one
  focusHuman: 0,          // extra pull of a human player's cities as targets (0.5 = 50% more attractive)
  hateLeader: 0,          // extra pull of the realm holding the most cities, once it is not us
  aggression: 0.5,        // 0..1: how little a lost army counts against a prize (Wesnoth's rule: value = P(win) x prize - (1 - aggression) x expected losses)
  grudge: 0.15,           // extra pull of a realm that has taken our cities (per recent loss, up to three)
  ruinOdds: 0.7,          // a hero only explores a ruin when the search is at least this likely to succeed
  fitMax: 0,              // share of its pips an army may have lost and still set out on an attack (0 = it waits until it has healed fully)
  fallBackBelow: 0.2,     // defenders in the open give ground when their chance of holding (worked out afresh after every duel) drops below this
  retreatMargin: 0,       // a commander calls off an assault when the value of pressing on (see rating) falls below this; negative = stubborn, positive = skittish
};

// Four levels. They change judgement and temperament only, never income, armies or the rules (manual 3e): each realm plays with the same
// gold and the same armies at every level. Medium is the AI exactly as it was before levels existed.
//   Easy    timid and hesitant: wants near-certain odds, sends small groups, often stays home, misjudges odds, wanders after poor targets.
//   Medium  the baseline.
//   Hard    sharper odds, bigger reach, rarely wastes a build, leans on the human player and on the runaway leader.
//   Expert  the same sharpness, pressing on thinner odds, and it hunts the human player first.
export const LEVELS = ['easy', 'medium', 'hard', 'expert'];
export const DIFFICULTY = {
  easy: { fallBackBelow: 0.35, retreatMargin: 0.15, aggression: 0.3, grudge: 0, oddsToAttack: 0.75, oddsToChoose: 0.65, garrison: 3, patience: 2, docReserve: 900, oddsNoise: 0.12, travelTurns: 5, maxTargets: 4, crewMax: 4,
    idle: 0.45, productionMistake: 0.5, targetNoise: 0.4, focusHuman: 0, hateLeader: 0, ruinOdds: 0.55 },
  medium: {},
  hard: { fallBackBelow: 0.15, fitMax: 0.25, docReserve: 450, aggression: 0.65, grudge: 0.3, oddsToAttack: 0.55, oddsToChoose: 0.5, patience: 5, travelTurns: 8, maxTargets: 14,
    productionMistake: 0.1, focusHuman: 0.35, hateLeader: 0.25 },
  expert: { fallBackBelow: 0.12, fitMax: 0.25, docReserve: 350, retreatMargin: -0.1, aggression: 0.8, grudge: 0.5, oddsToAttack: 0.48, oddsToChoose: 0.42, patience: 6, travelTurns: 9, maxTargets: 20,
    productionMistake: 0, focusHuman: 0.9, hateLeader: 0.5, ruinOdds: 0.75 },
};
/**
 * The question "do we give ground?" for computer defenders on open ground: hand the result to attack() as `fallBack`. Looks at the battle as it now stands.
 * Returns null for a human or neutral defender (their player decides, or they never flee).
 */
export function aiFallBack(g, defOwnerId, x, y) {
  const realm = g.realms.get(defOwnerId); if (!realm || realm.human) return null;
  const k = { ...AI, ...(DIFFICULTY[realm.difficulty ?? 'medium'] ?? {}) };
  const tile = tileAt(g, x, y); const cb = tileDefenceBonus(g, x, y);
  return ({ attackers, defenders }) => 1 - exactOdds({ attackers, defenders, tile, cityBonus: cb, rules: g.rules }).winChance < k.fallBackBelow;
}
/**
 * Hidden skill rolls (Heroes Quest). Every computer realm gets a skill between -1 and +1 drawn from a fixed pool: the rolls are centred so the realms'
 * skills always add up to zero, and the best and worst of them sit at the ends. Skill moves only the judgement dials (see applySkill); it never touches
 * gold or armies. Call once when a game is set up; the player never sees the numbers (skillRanking is for the end-of-game summary).
 */
export function assignSkills(g, { spread = 1 } = {}) {
  const ids = [...g.realms.keys()].filter((id) => !g.realms.get(id).human);
  if (!ids.length) return {};
  const raw = ids.map(() => g.rng.next());
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const top = Math.max(1e-9, ...raw.map((r) => Math.abs(r - mean)));
  ids.forEach((id, i) => { g.realms.get(id).skill = Math.max(-1, Math.min(1, ((raw[i] - mean) / top) * spread)); });
  return Object.fromEntries(ids.map((id) => [id, g.realms.get(id).skill]));
}
/** Computer realms from the sharpest to the loosest, for telling the player at the end of the game. */
export const skillRanking = (g) => [...g.realms.values()].filter((r) => r.skill != null).sort((a, b) => b.skill - a.skill).map((r) => ({ id: r.id, skill: r.skill }));
/** Nudge a realm's level settings by its skill (-1..+1): sharper realms read odds truly, reach further and waste less; loose ones the opposite. */
export function applySkill(cfg, skill = 0) {
  if (!skill) return cfg;
  const c = { ...cfg }; const lose = Math.max(0, -skill), win = Math.max(0, skill);
  c.oddsNoise = cfg.oddsNoise + lose * 0.12;
  c.idle = Math.min(0.7, cfg.idle + lose * 0.25);
  c.targetNoise = Math.min(0.8, cfg.targetNoise + lose * 0.3);
  c.productionMistake = Math.min(0.8, Math.max(0, cfg.productionMistake + lose * 0.3 - win * 0.1));
  c.maxTargets = Math.max(3, Math.round(cfg.maxTargets + win * 6 - lose * 4));
  c.travelTurns = Math.max(3, Math.round(cfg.travelTurns + win * 2 - lose * 2));
  c.crewMax = Math.max(3, Math.round(cfg.crewMax - lose * 2));
  c.aggression = Math.min(0.95, Math.max(0.1, cfg.aggression + skill * 0.12));
  c.patience = Math.max(1, Math.round(cfg.patience + win * 1 - lose * 2));
  return c;
}
/** Set a computer realm's level ('easy' | 'medium' | 'hard' | 'expert'). A realm with no level plays Medium. */
export function setDifficulty(g, realmId, level) {
  if (!DIFFICULTY[level]) throw new Error(`unknown difficulty: ${level}`);
  g.realms.get(realmId).difficulty = level;
}
const cfgOf = (g, realmId) => state(g, realmId).cfg ?? AI;
const turnOf = (g, ids) => Math.max(8, Math.min(...ids.map((id) => moveOf(g.armies.get(id), g.rules))));
const key = (x, y) => `${x},${y}`;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const strOf = (a) => (isHero(a) ? 6 : def(a).str);
/** Healthy enough to set out: has lost no more than fitMax of its pips. */
const fit = (g, k, a) => (a.wounded || 0) <= Math.floor(maxPips(a, g.rules) * k.fitMax + 1e-9);

function state(g, realmId) { g.ai ??= {}; return (g.ai[realmId] ??= { groups: [], nextId: 1, stats: { moves: 0, attacks: 0, captures: 0, rejected: 0, reasons: {}, formed: 0, embarks: 0, explored: 0, noTarget: 0, retreats: 0, waits: 0, noRoute: 0 } }); }
const aliveIds = (g, realmId, ids) => ids.filter((id) => { const a = g.armies.get(id); return a && a.owner === realmId && a.x != null; });
const inAnyGroup = (st) => new Set(st.groups.flatMap((gr) => gr.ids));

// ---- fog of war: the computer plays fair, knowing only what it has explored and what it can see right now ----------------------------------------
const visOf = (g, realmId) => (fogOn(g) ? (state(g, realmId).vis ??= visibleSet(g, realmId)) : null);
const seesTile = (g, realmId, x, y) => { const v = visOf(g, realmId); return !v || v.has(tileIndex(g, x, y)); };
/** What this realm believes about a city: { owner, razed, live, garrison } (null = never seen). With fog off, the plain truth. */
const believe = (g, realmId, c) => knownCity(g, realmId, c, visOf(g, realmId));
function enemyNear(g, realmId, city) {
  const k = cfgOf(g, realmId); let n = 0;
  for (const a of g.armies.values()) if (a.owner && a.owner !== realmId && a.x != null && cheb(a, city) <= k.threatRange && seesTile(g, realmId, a.x, a.y)) n++;
  return n;
}
const garrisonNeed = (g, realmId, city) => { const k = cfgOf(g, realmId); return Math.min(k.maxGarrison, k.garrison + Math.ceil(enemyNear(g, realmId, city) / 3)); };

// ---- odds ---------------------------------------------------------------------------------------------------------
function battleInfo(g, armies, tx, ty, noise = 0) {
  const city = cityAt(g, tx, ty); const me = armies[0].owner; const blind = !seesTile(g, me, tx, ty);
  let defenders;
  if (blind) {      // out of sight: judge by the garrison last seen there, or by a guess
    const k = cfgOf(g, me); const kc = city ? believe(g, me, city) : null; const owner = kc?.owner ?? null;
    const types = kc?.garrison?.length ? kc.garrison : Array(k.garrison + 1).fill('hinf');
    defenders = defaultOrder(types.map((t) => createArmy(t, owner)), g.rules);
  } else {
    const defOwner = armiesAt(g, tx, ty)[0]?.owner ?? city?.owner ?? null;
    defenders = orderedArmiesAt(g, tx, ty, defOwner);
  }
  if (!defenders.length) return { win: 1, lossA: 0 };
  const e = exactOdds({ attackers: defaultOrder(armies, g.rules), defenders, tile: tileAt(g, tx, ty), cityBonus: tileDefenceBonus(g, tx, ty, me), rules: g.rules });
  const win = noise ? Math.min(1, Math.max(0, e.winChance + (g.rng.next() * 2 - 1) * noise)) : e.winChance;     // a careless commander misjudges the odds by up to +/- noise
  return { win, lossA: e.attackerLosses };
}
const oddsAgainst = (g, armies, tx, ty, noise = 0) => battleInfo(g, armies, tx, ty, noise).win;

/** What taking a city is worth, in armies: its income, a bonus for a big production list, a pull toward the human, the realm that hurt us, and the runaway leader. */
function cityWorth(g, realmId, city) {
  const k = cfgOf(g, realmId); const st = state(g, realmId);
  const owner = fogOn(g) ? (believe(g, realmId, city)?.owner ?? null) : city.owner;
  let v = (city.income + (owner ? 14 : 6)) / 12 + (city.production.length >= 3 ? 0.5 : 0);
  if (owner) {
    if (g.realms.get(owner)?.human) v *= 1 + k.focusHuman;
    if (owner === st.leader) v *= 1 + k.hateLeader;
    v *= 1 + k.grudge * Math.min(3, st.grudge?.[owner] ?? 0);
  }
  return v;
}

// ---- production ---------------------------------------------------------------------------------------------------
function chooseProduction(g, realmId) {
  const realm = g.realms.get(realmId); const eco = realmEconomy(g, realmId); const k = cfgOf(g, realmId);
  const broke = eco.net < 0 && realm.gold < 250;
  for (const c of g.cities.values()) {
    if (c.owner !== realmId || c.razed || !c.production.length) continue;
    if (broke) { c.building = null; continue; }
    if (c.building && c.building.progress > 0) continue;
    const scored = c.production.map((t) => { const d = ARMIES[t]; return { t, s: Math.pow(d.str + (d.fly ? 0.7 : 0) + (d.move >= 16 ? 0.3 : 0), 1.4) * Math.pow(d.pips / 3, 0.6) / priceOf(d, g.rules) }; }).sort((a, b) => b.s - a.s);
    const pick = scored.length > 1 && g.rng.next() < k.productionMistake ? scored[1].t : scored[0].t;
    if (c.building?.type !== pick) setProduction(g, c.id, pick);
  }
}

// ---- movement -------------------------------------------------------------------------------------------------------
/** Walk a group along its route as far as its move points and the rules allow. Returns what happened. */
function walk(g, realmId, grp, route) {
  const st = state(g, realmId);
  for (const step of route.steps) {
    const ids = aliveIds(g, realmId, grp.ids); if (!ids.length) return { what: 'dead' };
    if (step.action === 'embark') { const r = embark(g, ids); st.stats.moves++; if (r.ok) st.stats.embarks++; return { what: r.ok ? 'embarked' : 'blocked', reason: r.reason }; }
    if (step.action === 'disembark') { const r = disembark(g, ids); return { what: r.ok ? 'landed' : 'blocked', reason: r.reason }; }
    if (step.action === 'attack') return { what: 'at-target', step };
    const r = moveGroup(g, ids, step.x, step.y);
    if (!r.ok) { if (r.reason !== 'no-move-points' && r.reason !== 'stack-limit') { st.stats.rejected++; st.stats.reasons[r.reason] = (st.stats.reasons[r.reason] ?? 0) + 1; } return { what: r.reason === 'no-move-points' ? 'tired' : 'blocked', reason: r.reason }; }
    grp.stuck = 0;
    st.stats.moves++;
    if (r.landed) return { what: 'landed' };
  }
  return { what: 'arrived' };
}
function captureChoice(g, realmId) { return g.realms.get(realmId).gold < 150 ? 'pillage' : 'occupy'; }

function runAttack(g, realmId, grp) {
  const st = state(g, realmId); const city = g.cities.get(grp.cityId);
  if (!city || city.owner === realmId || city.razed) return 'retarget';
  const ids = aliveIds(g, realmId, grp.ids); if (!ids.length) return 'dead';
  const k = cfgOf(g, realmId); const search = routeSearch(g, ids, { maxCost: k.travelTurns * 2 * turnOf(g, ids) });
  const route = routeTo(search, city); if (!route) { st.stats.noRoute++; return 'retarget'; }
  const res = walk(g, realmId, grp, route);
  if (res.what === 'blocked') { grp.stuck = (grp.stuck ?? 0) + 1; if (grp.stuck > 3) return 'retarget'; }
  if (res.what === 'at-target') {
    const live = aliveIds(g, realmId, grp.ids).map((id) => g.armies.get(id));
    const info = battleInfo(g, live, city.x, city.y, k.oddsNoise); const odds = info.win;
    const rating = odds * cityWorth(g, realmId, city) - (1 - k.aggression) * info.lossA;     // prize won, less the armies it is likely to cost
    if ((odds >= k.oddsToAttack && rating > 0) || (live.length >= 8 && odds >= k.oddsToChoose - 0.1)) {
      st.stats.attacks++; if (city.owner) { st.stats.vs ??= {}; st.stats.vs[city.owner] = (st.stats.vs[city.owner] ?? 0) + 1; }
      // after every duel the commander looks at the battle as it now stands, and calls the assault off if pressing on no longer pays
      const allIn = !(odds >= k.oddsToAttack && rating > 0);       // sent in by the "eight armies, near enough" rule: it does not turn back
      const worth = cityWorth(g, realmId, city); const tile = tileAt(g, city.x, city.y); const cb = tileDefenceBonus(g, city.x, city.y);
      const retreat = ({ attackers, defenders }) => {
        const e = exactOdds({ attackers, defenders, tile, cityBonus: cb, rules: g.rules });
        return e.winChance * worth - (1 - k.aggression) * e.attackerLosses < k.retreatMargin && !allIn;
      };
      const r = attack(g, live.map((a) => a.id), city.x, city.y, { retreat });
      if (!r.ok) { st.stats.rejected++; return 'wait'; }
      if (r.retreated) { st.stats.calledOff = (st.stats.calledOff ?? 0) + 1; return 'retreat'; }
      if (r.captureNeeded) { resolveCapture(g, captureChoice(g, realmId)); st.stats.captures++; return 'done'; }
      return aliveIds(g, realmId, grp.ids).length ? 'wait' : 'dead';
    }
    grp.wait = (grp.wait ?? 0) + 1; st.stats.waits++;
    if (grp.wait > k.patience) { st.stats.retreats++; return 'retreat'; } return 'wait';
  }
  return 'moving';
}

function nearestOwnCity(g, realmId, from) {
  let best = null, bd = 1e9;
  for (const c of g.cities.values()) if (c.owner === realmId && !c.razed) { const d = cheb(from, c); if (d < bd) { bd = d; best = c; } }
  return best;
}
function runReturn(g, realmId, grp) {
  const ids = aliveIds(g, realmId, grp.ids); if (!ids.length) return 'dead';
  const a = g.armies.get(ids[0]); const home = g.cities.get(grp.cityId)?.owner === realmId ? g.cities.get(grp.cityId) : nearestOwnCity(g, realmId, a);
  if (!home) return 'dead'; grp.cityId = home.id;
  if (a.x === home.x && a.y === home.y) return 'done';
  const route = routeTo(routeSearch(g, ids, { maxCost: 600 }), home); if (!route) return 'dead';
  walk(g, realmId, grp, route);
  const b = g.armies.get(ids[0]); return b && b.x === home.x && b.y === home.y ? 'done' : 'moving';
}
function runExplore(g, realmId, grp) {
  const ids = aliveIds(g, realmId, grp.ids); if (!ids.length) return 'dead';
  const site = siteAt(g, grp.x, grp.y); if (!site || (site.kind === 'ruin' && site.explored)) return 'return';
  const a = g.armies.get(ids[0]);
  if (a.x !== grp.x || a.y !== grp.y) {
    const route = routeTo(routeSearch(g, ids, { maxCost: 600 }), grp); if (!route) return 'return';
    const res = walk(g, realmId, grp, route); if (res.what === 'dead') return 'dead';
    const b = g.armies.get(ids[0]); if (!b || b.x !== grp.x || b.y !== grp.y) return 'moving';
  }
  const live = aliveIds(g, realmId, grp.ids);
  if (site.kind === 'temple') visitTemple(g, live);
  else if (site.kind === 'library') studyLibrary(g, live);
  else if (site.kind === 'ruin') {
    const r = exploreRuin(g, live);
    if (r.outcome === 'sage') resolveSage(g, 0);
  }
  return 'return';
}

function sendHome(g, realmId, ids) {
  const st = state(g, realmId); const live = aliveIds(g, realmId, ids); if (!live.length) return;
  const a = g.armies.get(live[0]); if (cityAt(g, a.x, a.y)?.owner === realmId) return;
  const home = nearestOwnCity(g, realmId, a); if (home) st.groups.push({ id: st.nextId++, kind: 'return', ids: live, cityId: home.id });
}

function runGroups(g, realmId) {
  const st = state(g, realmId);
  for (const grp of [...st.groups]) {
    grp.ids = aliveIds(g, realmId, grp.ids);
    let res = grp.ids.length ? null : 'dead';
    if (!res) res = grp.kind === 'attack' ? runAttack(g, realmId, grp) : grp.kind === 'explore' ? runExplore(g, realmId, grp) : grp.kind === 'scout' ? runScout(g, realmId, grp) : runReturn(g, realmId, grp);
    if (res === 'moving' || res === 'wait') continue;
    st.groups.splice(st.groups.indexOf(grp), 1);
    if (res === 'dead' || res === 'done') continue;       // arrived (they now count as free armies in their city) or lost
    if (res === 'retreat' || res === 'return' || res === 'retarget') sendHome(g, realmId, grp.ids);
  }
}

// ---- forming new groups -------------------------------------------------------------------------------------------------
function candidateTargets(g, realmId) {
  const all = [...g.cities.values()].filter((c) => c.owner !== realmId && !c.razed);
  if (!fogOn(g)) return all;
  return all.filter((c) => { const b = believe(g, realmId, c); return b && !b.razed && b.owner !== realmId; });      // only cities it has found
}
function chooseTarget(g, realmId, ids, from) {
  const k = cfgOf(g, realmId); const st = state(g, realmId);
  const search = routeSearch(g, ids, { maxCost: k.travelTurns * turnOf(g, ids) });
  const armies = ids.map((id) => g.armies.get(id));
  const cands = candidateTargets(g, realmId).map((c) => ({ c, r: routeTo(search, c) })).filter((x) => x.r)
    .sort((a, b) => a.r.cost - b.r.cost).slice(0, k.maxTargets);
  let best = null; const ok = [];
  for (const { c, r } of cands) {
    const odds = oddsAgainst(g, armies, c.x, c.y, k.oddsNoise); if (odds < k.oddsToChoose) continue;
    const value = cityWorth(g, realmId, c);
    const score = value * odds / (1 + r.cost / (search.turn * 3));
    const cand = { score, c, odds, route: r };
    if (k.targetNoise) ok.push(cand);
    if (!best || score > best.score) best = cand;
  }
  if (k.targetNoise && ok.length > 1 && g.rng.next() < k.targetNoise) return ok[Math.floor(g.rng.next() * ok.length)];
  return best;
}
function formAttackGroups(g, realmId) {
  const st = state(g, realmId); const busy = inAnyGroup(st); const k = cfgOf(g, realmId);
  for (const city of g.cities.values()) {
    if (city.owner !== realmId || city.razed) continue;
    const here = armiesAt(g, city.x, city.y).filter((a) => a.owner === realmId && !busy.has(a.id) && !a.afloat);
    const need = garrisonNeed(g, realmId, city);
    const soldiers = here.filter((a) => !isHero(a)).sort((a, b) => strOf(b) - strOf(a));
    const surplus = soldiers.length - need; if (surplus < k.minGroup) continue;
    if (k.idle && g.rng.next() < k.idle) { st.stats.idled = (st.stats.idled ?? 0) + 1; continue; }
    const crew = soldiers.filter((a) => fit(g, k, a)).slice(0, Math.min(k.crewMax, surplus));       // the strongest healthy ones go; the weakest and the wounded stay as garrison
    const hero = here.find((a) => isHero(a) && fit(g, k, a)); if (hero) crew.unshift(hero);
    if (!crew.length) continue;
    const ids = crew.slice(0, 8).map((a) => a.id);
    const pick = chooseTarget(g, realmId, ids, city);
    if (!pick) { st.stats.noTarget++; continue; }
    st.stats.formed++;
    st.groups.push({ id: st.nextId++, kind: 'attack', ids, cityId: pick.c.id }); ids.forEach((id) => busy.add(id));
  }
}
function formExplorers(g, realmId) {
  const st = state(g, realmId); const busy = inAnyGroup(st); const k = cfgOf(g, realmId);
  const taken = new Set(st.groups.filter((x) => x.kind === 'explore').map((x) => key(x.x, x.y)));
  for (const city of g.cities.values()) {
    if (city.owner !== realmId || city.razed) continue;
    const hero = armiesAt(g, city.x, city.y).find((a) => a.owner === realmId && isHero(a) && !busy.has(a.id) && fit(g, k, a)); if (!hero) continue;
    const escorts = armiesAt(g, city.x, city.y).filter((a) => a.owner === realmId && !isHero(a) && !busy.has(a.id) && fit(g, k, a)).sort((a, b) => strOf(b) - strOf(a));
    const spare = Math.max(0, escorts.length - garrisonNeed(g, realmId, city)); const crew = [hero, ...escorts.slice(0, Math.min(3, spare))];
    const ids = crew.map((a) => a.id); const search = routeSearch(g, ids, { maxCost: k.exploreRange });
    let best = null;
    for (const s of g.sites.values()) {
      if (taken.has(key(s.x, s.y))) continue;
      if (fogOn(g) && !isExp(g, realmId, s.x, s.y)) continue;      // a site it has not found yet
      if (s.kind === 'ruin' && s.explored) continue; if (s.kind === 'tower') continue;
      if (s.kind === 'temple' && s.blessed.includes(hero.id)) continue; if (s.kind === 'library' && s.studied.includes(hero.id)) continue;
      const r = routeTo(search, s); if (!r) continue;
      if (s.kind === 'ruin' && ruinWinChance(hero, s.guardian ?? 'wiz', crew.length - 1, g.rules) < k.ruinOdds) continue;
      const w = (s.kind === 'temple' ? 1.4 : s.kind === 'ruin' ? 1.0 : 0.6) / (1 + r.cost / 30);
      if (!best || w > best.w) best = { w, s };
    }
    if (best) { st.stats.explored++; st.groups.push({ id: st.nextId++, kind: 'explore', ids, x: best.s.x, y: best.s.y }); ids.forEach((id) => busy.add(id)); taken.add(key(best.s.x, best.s.y)); }
  }
}

/**
 * Fog of war: scouts. With nothing known to attack, a realm sends its fastest spare army out to the edge of the explored ground, and on to the next edge,
 * for `scoutTurns` turns. One scout while the realm is small, two once it holds four cities.
 */
function formScouts(g, realmId) {
  if (!fogOn(g)) return;
  const st = state(g, realmId); const busy = inAnyGroup(st);
  const mine = [...g.cities.values()].filter((c) => c.owner === realmId && !c.razed);
  const want = mine.length >= 4 ? 2 : 1;
  if (st.groups.filter((x) => x.kind === 'scout').length >= want) return;
  for (const city of mine) {
    const free = armiesAt(g, city.x, city.y).filter((a) => a.owner === realmId && !busy.has(a.id) && !a.afloat && !isHero(a) && a.mp > 0);
    if (free.length < 2) continue;                          // never strip a city of its last defender
    const s = free.sort((a, b) => moveOf(b, g.rules) - moveOf(a, g.rules))[0];
    st.groups.push({ id: st.nextId++, kind: 'scout', ids: [s.id], age: 0 }); st.stats.scouts = (st.stats.scouts ?? 0) + 1;
    return;
  }
}
function runScout(g, realmId, grp) {
  const ids = aliveIds(g, realmId, grp.ids); if (!ids.length) return 'dead';
  const k = cfgOf(g, realmId); grp.age = (grp.age ?? 0) + 1;
  if (grp.age > k.scoutTurns) return 'return';
  const W = g.width, H = g.height; const a = g.armies.get(ids[0]);
  const search = routeSearch(g, ids, { maxCost: 14 * turnOf(g, ids) });
  let best = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isExp(g, realmId, x, y) || (x === a.x && y === a.y)) continue;
    const i = y * W + x; const cost = Math.min(search.dist[2 * i], search.dist[2 * i + 1]); if (!Number.isFinite(cost)) continue;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !isExp(g, realmId, nx, ny)) { edge = true; break; } }
    if (!edge) continue;
    const score = cost + g.rng.next() * 4;
    if (!best || score < best.score) best = { score, x, y };
  }
  if (!best) return 'return';                              // nothing left to find that it can reach
  const route = routeTo(search, best); if (!route) return 'return';
  const res = walk(g, realmId, grp, route); if (res.what === 'dead') return 'dead';
  return 'moving';
}

/** A realm that takes one of our cities earns a grudge, which fades a tenth each turn. */
function trackGrudges(g, realmId, st) {
  const now = new Map([...g.cities.values()].filter((c) => c.owner === realmId).map((c) => [c.id, true]));
  st.grudge ??= {};
  for (const o of Object.keys(st.grudge)) { st.grudge[o] *= 0.9; if (st.grudge[o] < 0.05) delete st.grudge[o]; }
  for (const id of st.prevCities ?? []) if (!now.has(id)) { const c = g.cities.get(id); if (c?.owner && c.owner !== realmId) st.grudge[c.owner] = (st.grudge[c.owner] ?? 0) + 1; }
  st.prevCities = [...now.keys()];
}

/** The realm holding the most cities, unless that is this realm (or nobody leads by at least one city). */
function leaderOf(g, realmId) {
  const n = new Map();
  for (const c of g.cities.values()) {
    const b = fogOn(g) ? (c.owner === realmId ? { owner: realmId, razed: !!c.razed } : believe(g, realmId, c)) : { owner: c.owner, razed: !!c.razed };
    if (b?.owner && !b.razed) n.set(b.owner, (n.get(b.owner) ?? 0) + 1);
  }
  let best = null, bn = 0, second = 0;
  for (const [id, v] of n) { if (v > bn) { second = bn; bn = v; best = id; } else if (v > second) second = v; }
  return best && best !== realmId && bn > second ? best : null;
}

// ---- a whole turn ---------------------------------------------------------------------------------------------------------
/** Play one realm's turn. Call beginTurn(g, realmId) first. Returns the realm's running statistics. */
/**
 * Doctrines: a computer realm buys at most one a turn, and only if it keeps `docReserve` gold afterwards and is not running at a loss.
 * Money first (Tax Reform), then the fighting ones; sea, hero and siege doctrines wait until the realm has a use for them.
 */
const DOC_ORDER = ['tax', 'drilled', 'walls', 'hospitals', 'quarter', 'muster', 'march', 'line', 'heraldry', 'sappers', 'call', 'sea'];
export function chooseDoctrine(g, realmId, k = AI) {
  const realm = g.realms.get(realmId); if (realm.gold < 0) return null;
  const mine = [...g.armies.values()].filter((a) => a.owner === realmId);
  const wants = (key) => {
    if (hasDoctrine(g.rules, realmId, key)) return false;
    if (key === 'sea') return mine.some((a) => a.afloat || def(a).naval);
    if (key === 'heraldry') return mine.some(isHero);
    if (key === 'call') return !mine.some(isHero) || mine.filter(isHero).length < 2;
    if (key === 'sappers') return k.aggression >= 0.5;
    return true;
  };
  const key = DOC_ORDER.find(wants); if (!key) return null;
  const price = doctrinePrice(g, realmId, key);
  if (realm.gold - price < k.docReserve || realmEconomy(g, realmId).net < 0) return null;
  const r = buyDoctrine(g, realmId, key); return r.ok ? key : null;
}
export function aiPlay(g, realmId) {
  const realm = g.realms.get(realmId); const st = state(g, realmId);
  st.cfg = applySkill({ ...AI, ...(DIFFICULTY[realm.difficulty ?? 'medium'] ?? {}) }, realm.skill ?? 0);
  st.leader = leaderOf(g, realmId);
  trackGrudges(g, realmId, st);
  for (const a of g.armies.values()) if (a.owner === realmId && isHero(a) && a.perkPoints > 0) aiChoosePerk(g, a.id);
  if (realm.heroOffer && realm.gold - realm.heroOffer.cost >= 150) acceptHero(g, realmId);
  if (realm.questOffer) { const k = realm.questOffer.kind; if (k === 'take-city' || k === 'kill') acceptQuest(g, realmId); else declineQuest(g, realmId); }
  st.vis = null;
  chooseProduction(g, realmId);
  chooseDoctrine(g, realmId, st.cfg);
  runGroups(g, realmId);
  st.vis = null;
  formAttackGroups(g, realmId);
  formExplorers(g, realmId);
  formScouts(g, realmId);
  // anything left standing in the open with no orders goes home
  const busy = inAnyGroup(st); const strays = [];
  for (const a of g.armies.values()) if (a.owner === realmId && a.x != null && !busy.has(a.id) && cityAt(g, a.x, a.y)?.owner !== realmId) strays.push(a.id);
  if (strays.length) {
    const byTile = new Map(); for (const id of strays) { const a = g.armies.get(id); (byTile.get(key(a.x, a.y)) ?? byTile.set(key(a.x, a.y), []).get(key(a.x, a.y))).push(id); }
    for (const ids of byTile.values()) sendHome(g, realmId, ids);
    runGroups(g, realmId);
  }
  // cities that hold armies stand guard
  for (const c of g.cities.values()) if (c.owner === realmId) { const ids = armiesAt(g, c.x, c.y).filter((a) => a.owner === realmId && !busy.has(a.id) && !a.afloat).map((a) => a.id); if (ids.length) defend(g, ids); }
  return st.stats;
}
export { AI as AI_SETTINGS };
