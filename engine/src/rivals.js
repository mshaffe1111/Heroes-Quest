// The rival ladder (Heroes Quest, Matt 22 Oct). Every computer realm stands on one of five rungs: Clumsy, Weak, Normal, Good, Sharp.
// The difficulty the player picks decides which stretch of the ladder the rivals come from, spread evenly across it, so a game is never
// all pushovers or all walls (Warlords II "computer personalities", LordsAWar per-player Easy/Hard, Dawn of War mixed AI levels).
//   Easy    Clumsy .. Normal      3 rivals: clumsy, weak, normal
//   Medium  Weak .. Good          3 rivals: weak, normal, good
//   Hard    Normal .. Sharp       3 rivals: normal, good, sharp
//   Expert  Good .. Sharp         a third Good, the rest Sharp (3 rivals: good, sharp, sharp)
// Who stands where is shuffled each game and hidden until the end. On Easy and Medium the sharpest rival never starts as the player's nearest
// neighbour. Each rival also keeps one habit, so its mistakes look like a person's rather than noise. Rungs change judgement only, never gold,
// armies or rules: every realm plays by the same rules at every rung.
export const RUNGS = ['clumsy', 'weak', 'normal', 'good', 'sharp'];
export const RUNG_NAMES = { clumsy: 'Clumsy', weak: 'Weak', normal: 'Normal', good: 'Good', sharp: 'Sharp' };
/** How each rung plays: an AI level plus a skill nudge (see ai.js applySkill). */
export const RUNG_PLAY = {
  clumsy: { level: 'easy', skill: -0.4 },
  weak: { level: 'medium', skill: -0.7 },
  normal: { level: 'medium', skill: 0 },
  good: { level: 'hard', skill: 0 },
  sharp: { level: 'expert', skill: 0.4 },
};
const BAND = { easy: [0, 2], medium: [1, 3], hard: [2, 4], expert: [3, 4] };

/** Rungs (indices into RUNGS, weakest first) for `n` rivals at a difficulty. */
export function rungsFor(level, n) {
  const [lo, hi] = BAND[level] ?? BAND.medium; if (n <= 0) return [];
  if (level === 'expert') { const good = Math.floor(n / 3); return Array.from({ length: n }, (_, i) => (i < good ? 3 : 4)); }
  if (n === 1) return [Math.round((lo + hi) / 2)];
  return Array.from({ length: n }, (_, i) => Math.round(lo + ((hi - lo) * i) / (n - 1)));
}

// ----- habits: one per rival, so it plays like a person with a style --------------------------------------------------------------
export const HABITS = {
  steady: { name: 'Steady', note: 'plays it straight' },
  cautious: { name: 'Cautious', note: 'keeps big garrisons and gives ground early' },
  raider: { name: 'Raider', note: 'strikes fast with small groups and takes chances' },
  gatherer: { name: 'Slow to gather', note: 'waits to mass its armies before it marches' },
};
const HABIT_KEYS = Object.keys(HABITS);
/** Tilt a rival's AI settings by its habit. Small tilts: a habit gives style, the rung gives strength. */
export function applyHabit(cfg, habit) {
  if (!habit || habit === 'steady') return cfg; const c = { ...cfg }; const n = (k, d) => (typeof cfg[k] === 'number' ? cfg[k] : d);
  if (habit === 'cautious') { c.aggression = Math.max(0.1, n('aggression', 0.5) - 0.15); c.fallBackBelow = n('fallBackBelow', 0.25) + 0.08; c.garrison = n('garrison', 2) + 1; }
  if (habit === 'raider') { c.aggression = Math.min(0.95, n('aggression', 0.5) + 0.15); c.crewMax = Math.max(2, n('crewMax', 6) - 2); c.patience = Math.max(1, n('patience', 2) - 1); }
  if (habit === 'gatherer') { c.patience = n('patience', 2) + 2; c.poolCities = Math.max(1, n('poolCities', 2) + 1); c.travelTurns = Math.max(3, n('travelTurns', 6) - 1); }
  return c;
}

// ----- setting up a game -------------------------------------------------------------------------------------------------------------
const capitalOf = (g, realmId) => { const caps = g.map?.caps ?? []; const owned = [...g.cities.values()].filter((c) => c.owner === realmId); return owned.find((c) => caps.includes(c.id)) ?? owned[0] ?? null; };
const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);

/**
 * Give every computer realm a rung and a habit for `level`, shuffled with the game's dice. Sets realm.difficulty, realm.skill, realm.rung and
 * realm.habit (ai.js reads all four). Returns [{ id, rung, habit }] weakest first.
 */
export function setupRivals(g, humanId, level = 'medium') {
  const ids = [...g.realms.keys()].filter((id) => id !== humanId && !g.realms.get(id).human);
  const rungs = rungsFor(level, ids.length);
  const order = ids.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(g.rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const pick = new Map(order.map((id, i) => [id, rungs[i]]));
  // Easy and Medium: the sharpest rival is never the player's nearest neighbour (a new player should not meet the best commander on turn 5)
  if ((level === 'easy' || level === 'medium') && ids.length > 1) {
    const home = capitalOf(g, humanId); const near = ids.slice().sort((a, b) => dist(capitalOf(g, a), home) - dist(capitalOf(g, b), home))[0];
    const top = Math.max(...pick.values());
    if (pick.get(near) === top) { const other = order.find((id) => id !== near && pick.get(id) < top); if (other) { pick.set(near, pick.get(other)); pick.set(other, top); } }
  }
  const out = [];
  for (const id of ids) {
    const rung = RUNGS[pick.get(id)]; const play = RUNG_PLAY[rung]; const r = g.realms.get(id);
    r.rung = rung; r.difficulty = play.level; r.skill = play.skill; r.habit = HABIT_KEYS[Math.floor(g.rng.next() * HABIT_KEYS.length)];
    out.push({ id, rung, habit: r.habit });
  }
  return out.sort((a, b) => RUNGS.indexOf(a.rung) - RUNGS.indexOf(b.rung));
}
/** For the end screen: every rival with its rung and habit, sharpest first. */
export const rivalReveal = (g) => [...g.realms.values()].filter((r) => r.rung).sort((a, b) => RUNGS.indexOf(b.rung) - RUNGS.indexOf(a.rung))
  .map((r) => ({ id: r.id, rung: r.rung, name: RUNG_NAMES[r.rung], habit: HABITS[r.habit]?.name ?? '', note: HABITS[r.habit]?.note ?? '' }));
