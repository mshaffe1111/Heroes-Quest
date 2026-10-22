// Every number the engine uses lives here so it can be changed without touching code.
// Items marked PLACEHOLDER are not in the Warlords II manual text we have; they are
// reasonable guesses and are listed for Matt to confirm.
export const DEFAULT_RULES = {
  // --- verified against the Warlords II manual / encyclopedia ---
  stackLimit: 8,              // armies per square
  cityGarrisonLimit: 32,      // a city defends with everything inside it, up to 32
  dieSize: 20,                // normal combat
  intenseDieSize: 24,         // Intense Combat option
  intense: false,
  hitsToKill: 2,              // two hits destroy an army
  maxBaseStrength: 9,         // before stack bonuses
  maxStackBonus: 5,           // total stack bonus
  maxModifiedStrength: 14,
  navyStrength: 4,            // every boat-borne army fights at 4, no bonuses
  upkeepFraction: 0.5,        // upkeep = half the build price each turn
  navalUpkeepExtra: 1,        // +1 gp per army afloat
  vectorTravelTurns: 2,       // vectoring takes build time plus 2 turns
  carryOverMovePoints: 2,     // at most 2 unused move points carry to next turn
  maxHeroes: 5,
  maxHeroesMajority: 6,       // if you hold more than half the cities
  heroMaxLevel: 4,
  heroXpThresholds: [0, 15, 30, 60],
  heroBaseStrength: 5,
  heroBaseMove: 14,
  heroStrengthPerLevel: 1,
  heroMovePerLevel: 2,
  xp: { battle: 1, city: 2, ruin: 3, blessing: 1, quest: 10 },
  campBonus: 1,               // a stack that defends for a full turn gets +1
  // --- naval transport (manual ch.8d) ---
  // Embarking and disembarking each END the group's move (verified). Everything else here is a placeholder.
  landingCost: 1,             // PLACEHOLDER: move points a boat group needs to step ashore (the move then stops anyway)
  captureFromBoatEndsMove: true,   // PLACEHOLDER: survivors of an assault from the sea land in the city with 0 move points
  neutralMaxDefenders: 5,     // VERIFIED (manual 14a): an active neutral builds up to five defenders after an attack
  // --- searching, temples, quests, heroes: the manual states the mechanism, the numbers here are PLACEHOLDERS ---
  quests: true,               // game option (manual ch.14i)
  questChance: 0.5,           // PLACEHOLDER: chance a blessed hero is offered a quest
  questGold: [200, 500], questPlunder: [300, 900], questKill: [10, 25],   // kill count 10-25 is from Rules of Engagement; the rest are guesses
  ruinBaseWin: 0.88, ruinPerStrength: 0.03, ruinPerArmy: 0.02, ruinWinMin: 0.35, ruinWinMax: 0.98,   // PLACEHOLDER: a hero's one-roll chance against a ruin guardian
  ruinGold: [150, 600],       // PLACEHOLDER
  ruinRewardWeights: { gold: 30, item: 30, ally: 25, sage: 15 },   // PLACEHOLDER mix of gold / artefact / ally / sage
  libraryXp: 2,               // PLACEHOLDER (Warlords III library)
  heroOfferChance: 1 / 6,     // VERIFIED (Heeter): a 1 in 6 chance each turn, if you can afford one
  heroHireFirst: 100,         // PLACEHOLDER: price of a hero when you have none
  heroHireBase: 300, heroHirePerHero: 150,   // PLACEHOLDER: later heroes cost more
  flagVectorPerTurn: 4,       // VERIFIED (manual 15b): at most four armies per turn reach a planted standard
  // --- Warlords III add-ons you picked ---
  rebuildRazedCityCost: 800,
  // --- PLACEHOLDERS (not in the text we have) ---
  damageCarriesOver: true,    // VERIFIED (Heeter rules page): a wound carries into the next fight of the same battle
  terrainCost: { road: 1, open: 2, woods: 3, hills: 4, swamp: 4, city: 1, shore: 2, sea: 1 },
  flyCost: 1,
  specialUpkeep: false,       // VERIFIED (manual ch.15): allies from ruins are free, no maintenance
  payProductionOn: 'complete',
  establishCostPerCostBuild: 10,   // cost to add an army type to a city = cost * build * this
  pillageGoldPerIncome: 8,
  sackGoldPerIncome: 12,
  startGold: 1000,
  // --- Heroes Quest combat (our own layer; every number is a PLACEHOLDER until the simulations tune it) ---
  classic: false,             // true = plain Warlords II duels: two hits kill everyone, no lasting wounds, no counters
  cityHeal: 2,                // pips an army heals at the start of its realm's turn while standing in one of that realm's cities
  counterBonus: 1,            // strength an army gains in a duel against a type it counters
  heroPips: 4, heroExtraPipLevel: 3,   // a hero has 4 pips, and one more from level 3
  perkDuels: { rally: 2, charge: 3, fortifier: 3 },   // how many duels a stack-bonus perk lasts, counting from the first of the battle (a +1 stack bonus is worth ~25 points all battle long, so these are short)
  tacticianCounter: 1,        // extra strength a Tactician's own stack gets from its counters
  veteranDuels: [4, 10],      // duels an ordinary army must have won to become Seasoned (+1 pip) and then Veteran (+1 strength); heroes level up instead. PLACEHOLDER numbers
  pathfinderMove: 6,          // move points the Pathfinder perk adds to a hero
  fieldMedicHeal: 1,          // pips a stack with a Field Medic hero heals each turn wherever it stands
};

export function makeRules(overrides = {}) {
  return { ...DEFAULT_RULES, ...overrides, xp: { ...DEFAULT_RULES.xp, ...(overrides.xp || {}) },
    terrainCost: { ...DEFAULT_RULES.terrainCost, ...(overrides.terrainCost || {}) } };
}

export const dieSizeFor = (rules) => (rules.intense ? rules.intenseDieSize : rules.dieSize);
