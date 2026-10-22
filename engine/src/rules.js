// Every number the engine uses lives here so it can be changed without touching code.
// Items marked PLACEHOLDER are not in the 90s original manual text we have; they are
// reasonable guesses and are listed for Matt to confirm.
export const DEFAULT_RULES = {
  // --- verified against the 90s original manual / encyclopedia ---
  stackLimit: 8,              // armies per square
  cityGarrisonLimit: 8,       // Heroes Quest (Matt, 2026-10-22): a city holds at most 8 armies, the same as a stack (the 90s original allowed 32)
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
  heroMaxLevel: 9,            // Heroes Quest (Matt, 2026-10-22): heroes level up to 9 (was 4), one perk choice per level
  heroXpThresholds: [0, 15, 30, 60, 100, 150, 210, 280, 360],   // PLACEHOLDER: xp to reach levels 1..9; levels 2-4 unchanged, then the steps grow 40, 50, 60, 70, 80
  heroBaseStrength: 5,
  heroBaseMove: 14,
  heroStrengthPerLevel: 1,    // used only when heroStrengthByLevel is missing (older rule sets)
  heroMovePerLevel: 2,        // used only when heroMoveByLevel is missing
  // PLACEHOLDER (tune with the combat lab, which finds heroes already very strong): strength by level 1..9. Levels 1-4 are today's curve
  // (+1 a level); after that only one more point, at level 7. Items and blessings still add on top, capped at maxBaseStrength 9.
  heroStrengthByLevel: [5, 6, 7, 8, 8, 8, 9, 9, 9],
  heroMoveByLevel: [14, 16, 18, 20, 21, 21, 22, 22, 23],   // PLACEHOLDER: +2 a level to level 4 (today's curve), then +1 at levels 5, 7 and 9
  xp: { battle: 1, city: 2, ruin: 3, blessing: 1, quest: 10 },
  towerCost: 200,             // PLACEHOLDER (Matt, 22 Oct: towers teach for gold): gold a Mage Tower asks to teach a hero one ability
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
  ruinRewardWeights: { gold: 30, item: 30, ally: 25, sage: 15, hero: 9 },   // PLACEHOLDER mix of gold / artefact / ally / sage / a hero joins (9 of 109 = about 1 in 12; hero only while under the hero limit)
  libraryXp: 2,               // PLACEHOLDER (the later sequel library)
  heroOfferChance: 1 / 80,    // Heroes Quest: a hero offering himself is rare, about once or twice in a very long game
  heroOfferChanceClassic: 1 / 6, // classic rules keep the original 1 in 6 each turn, if you can afford one
                              // the roll is only made on a turn the realm can pay for a hero and has room for him (under the hero limit, a city with space)
  questHeroChance: 1 / 12,    // PLACEHOLDER: share of quest rewards that are a hero joining the realm (only while under the hero limit)
  heroHireFirst: 100,         // PLACEHOLDER: price of a hero when you have none
  heroHireBase: 300, heroHirePerHero: 150,   // PLACEHOLDER: later heroes cost more
  flagVectorPerTurn: 4,       // VERIFIED (manual 15b): at most four armies per turn reach a planted standard
  // --- later-sequel add-ons you picked ---
  rebuildRazedCityCost: 800,
  // --- PLACEHOLDERS (not in the text we have) ---
  damageCarriesOver: true,    // VERIFIED (Heeter rules page): a wound carries into the next fight of the same battle
  terrainCost: { road: 1, open: 2, woods: 3, hills: 4, swamp: 4, city: 1, shore: 2, sea: 1 },
  flyCost: 1,
  specialUpkeep: false,       // VERIFIED (manual ch.15): allies from ruins are free, no maintenance
  payProductionOn: 'complete',
  establishCostPerCostBuild: 10,   // cost to add an army type to a city = cost * build * this
  // Capture (approved Capture screen, 2026-10-22). PLACEHOLDER multipliers; the screen's example is a 14-gold city with 3 kinds: +0 / +120 / +260 / +60.
  pillageGoldPerIncome: 8,    // Pillage: income x 8, the city keeps every army kind
  sackGoldPerIncome: 8,       // Sack: the same coffers as Pillage (income x 8) ...
  sackShareOfLostKind: 0.5,   // ... plus half the teaching cost (price x build x 10) of the kind it loses (its dearest); a city that builds nothing pays no more than Pillage
  razeGoldPerIncome: 4,       // Raze: what you can carry, income x 4; the city is gone until rebuilt for rebuildRazedCityCost
  startGold: 1000,
  // --- Heroes Quest combat (our own layer; every number is a PLACEHOLDER until the simulations tune it) ---
  classic: false,             // true = classic two-hit duels: two hits kill everyone, no lasting wounds, no counters
  fog: false,                 // fog of war (fog.js): the map starts covered for each realm and clears as it explores
  cityHeal: 1,                // Heroes Quest (Matt, 2026-10-22): pips an army heals at the start of its realm's turn in one of that realm's cities (was 2); Field Hospitals adds 1
  counterBonus: 1,            // strength an army gains in a duel against a type it counters
  heroPips: 4, heroExtraPipLevel: 3,   // a hero has 4 pips, and one more from level 3 (heroExtraPipLevel is kept for older rule sets)
  heroExtraPipLevels: [3, 6],          // PLACEHOLDER: one more pip at level 3 and another at level 6 (COMBAT_DESIGN_DRAFT: "4 pips, +1 at levels 3 and 6"); 6 pips at most from levels
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
