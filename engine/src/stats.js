// The stats ledger: what each realm did over a game, for the end-of-game screen (and anything else that wants a record).
// It only ever records. Nothing in the rules reads it, so it cannot change how a game plays.
//
// g.stats = { realms: Map(realmId -> counters), series: [{ turn, cities: { realmId: n } }], battles: [ ...every fight ] }
// Gold is kept so that  (gold now - gold at start)  ==  goldEarned - goldSpent  for every realm. A test holds it to that.
// The Unsworn (owner null) have no counters: their deaths and losses are not tracked, only what is done to them is.

export const STAT_KEYS = ['citiesTaken', 'citiesLost', 'armiesBuilt', 'armiesLost', 'kills', 'battles', 'battlesWon',
  'goldEarned', 'goldSpent', 'heroesHired', 'heroesLost', 'ruinsExplored', 'questsDone', 'mostCities', 'armiesDisbanded'];

export function blankStats() { return { realms: new Map(), series: [], battles: [] }; }
export function blankRealmStats() { const s = {}; for (const k of STAT_KEYS) s[k] = 0; s.fell = null; s.startGold = 0; s.doctrines = []; return s; }

/** Start keeping a record for a realm (addRealm calls this). */
export function openLedger(g, realm) {
  if (!g.stats) g.stats = blankStats();
  const s = blankRealmStats(); s.startGold = realm.gold;
  g.stats.realms.set(realm.id, s);
}

/** Add n to one counter of one realm. Silently ignores the Unsworn (null) and anyone without a ledger. */
export function stat(g, realmId, key, n = 1) {
  const s = g.stats?.realms.get(realmId); if (s) s[key] += n;
}
export const earned = (g, realmId, gold) => { if (gold > 0) stat(g, realmId, 'goldEarned', gold); };
export const spent = (g, realmId, gold) => { if (gold > 0) stat(g, realmId, 'goldSpent', gold); };

const citiesOf = (g, id) => { let n = 0; for (const c of g.cities.values()) if (c.owner === id && !c.razed) n++; return n; };

/** One finished fight: the headline numbers go to each realm's counters and the fight itself goes in the log. */
export function logBattle(g, { attacker, defender, x, y, place, attackers, defenders, winner, lostAttackers, lostDefenders, heroLostA, heroLostD, retreated = false, fled = false }) {
  if (!g.stats) return;
  stat(g, attacker, 'battles'); stat(g, defender, 'battles');
  stat(g, attacker, 'armiesLost', lostAttackers); stat(g, defender, 'armiesLost', lostDefenders);
  stat(g, attacker, 'kills', lostDefenders); stat(g, defender, 'kills', lostAttackers);
  stat(g, attacker, 'heroesLost', heroLostA); stat(g, defender, 'heroesLost', heroLostD);
  if (winner === 'attacker') stat(g, attacker, 'battlesWon'); else if (winner === 'defender') stat(g, defender, 'battlesWon');
  g.stats.battles.push({ turn: g.turn, x, y, place, attacker, defender, attackers, defenders, size: attackers + defenders,
    winner, lostAttackers, lostDefenders, retreated, fled });
}

/** End of a round: snapshot every realm's city count, track each realm's peak, and mark the ones that have gone under. */
export function closeRound(g, live) {
  if (!g.stats) return;
  const cities = {};
  for (const id of g.realms.keys()) {
    const n = citiesOf(g, id); cities[id] = n;
    const s = g.stats.realms.get(id); if (!s) continue;
    if (n > s.mostCities) s.mostCities = n;
    if (s.fell == null && !live.includes(id)) s.fell = g.turn;
  }
  g.stats.series.push({ turn: g.turn, cities });
}

/**
 * The end-of-game table: every realm ranked by how the game ended (the victor first, then more cities held, then who lasted longest).
 * Each row carries the ledger counters plus citiesNow. `victor` is the realm id that won, or null if the game has not been won.
 */
export function standings(g, victor = null) {
  const rows = [];
  for (const [id, realm] of g.realms) {
    const s = g.stats?.realms.get(id); if (!s) continue;
    rows.push({ id, name: realm.name, human: !!realm.human, citiesNow: citiesOf(g, id), ...s, winner: id === victor });
  }
  rows.sort((a, b) => (b.winner - a.winner) || (b.citiesNow - a.citiesNow) || ((b.fell ?? Infinity) - (a.fell ?? Infinity)) || (b.mostCities - a.mostCities));
  return rows;
}

/** The biggest fight of the game (most armies on the field), optionally one a given realm took part in. */
export function biggestBattle(g, realmId = null) {
  let best = null;
  for (const b of g.stats?.battles ?? []) {
    if (realmId && b.attacker !== realmId && b.defender !== realmId) continue;
    if (!best || b.size > best.size) best = b;
  }
  return best;
}
