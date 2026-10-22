// The 28 army types + hero from the 90s original Appendix A (verified from the manual scans).
// Terrain letters: C city (incl. ruins, camps, sacred sites), O open, R road, W woods, H hills.
//   indiv       : +amount strength to this army only, in the listed terrain
//   stack       : +amount to the whole stack (the best single one counts), in the listed terrain (or everywhere)
//   moveBonus   : pays the open-ground cost in these terrains, and passes that to the whole stack
//   enemySubtract / cancelCity / cancelNonHero / cancelHero: enemy-detrimental abilities
const a = (key, name, str, move, cost, build, extra = {}) => ({ key, name, str, move, cost, build, ...extra });

export const ARMIES = {
  scout:  a('scout',  'Scout',          1, 16,  2, 1, { moveBonus: ['W', 'H'] }),
  bat:    a('bat',    'Giant Bat',      1, 16,  5, 1, { fly: true }),
  linf:   a('linf',   'Light Infantry', 2, 12,  3, 1),
  orc:    a('orc',    'Orc Mob',        2, 12,  4, 2, { moveBonus: ['W', 'H'] }),
  lcav:   a('lcav',   'Light Cavalry',  2, 20,  6, 2, { indiv: { amount: 1, on: ['O', 'R'] } }),
  cat:    a('cat',    'Catapult',       2, 16, 16, 4, { cancelCity: true }),
  hinf:   a('hinf',   'Heavy Infantry', 3,  8,  5, 2),
  elf:    a('elf',    'Elven Archers',  3, 12,  7, 2, { moveBonus: ['W'], indiv: { amount: 1, on: ['W'] } }),
  dwarf:  a('dwarf',  'Dwarves',        3,  8,  7, 2, { moveBonus: ['H'], indiv: { amount: 1, on: ['H'] } }),
  pike:   a('pike',   'Pikemen',        4,  8,  5, 3, { indiv: { amount: 1, on: ['O', 'R'] } }),
  hcav:   a('hcav',   'Heavy Cavalry',  4, 16,  8, 3, { indiv: { amount: 2, on: ['O', 'R'] } }),
  wolf:   a('wolf',   'Wolf Riders',    4, 16,  8, 2, { stack: { amount: 1, on: ['H'] } }),
  giant:  a('giant',  'Giants',         5, 16, 10, 2, { moveBonus: ['H'] }),
  mino:   a('mino',   'Minotaurs',      5, 12, 10, 2, { indiv: { amount: 1, on: ['C'] } }),
  spid:   a('spid',   'Giant Spiders',  5, 12, 12, 2, { indiv: { amount: 2, on: ['C'] } }),
  peg:    a('peg',    'Pegasi',         5, 20, 12, 3, { fly: true, stack: { amount: 1 } }),
  grif:   a('grif',   'Griffins',       6, 20, 15, 3, { fly: true, indiv: { amount: 2, on: ['C'] } }),
  uni:    a('uni',    'Unicorns',       7, 16, 15, 4, { stack: { amount: 1 } }),
  ele:    a('ele',    'Elephants',      8, 16, 15, 4, { enemySubtract: 1 }),
  navy:   a('navy',   'Navy',           4, 20,  0, 0, { naval: true, buildable: false }),
  // Special armies: come from ruins, temples and quests, not from city production.
  wiz:    a('wiz',    'Wizard',         6, 50, 12, 4, { special: true, stack: { amount: 1 } }),
  wyrm:   a('wyrm',   'The Worm',       7, 12, 12, 4, { special: true, stack: { amount: 1 } }),
  undead: a('undead', 'Undead',         7, 16, 12, 4, { special: true, stack: { amount: 1 } }),
  demon:  a('demon',  'Demon',          7, 20, 15, 4, { special: true, stack: { amount: 1 } }),
  elem:   a('elem',   'Elemental',      8, 12, 15, 4, { special: true, stack: { amount: 1 } }),
  devil:  a('devil',  'Devil',          8, 16, 15, 4, { special: true, stack: { amount: 1 }, cancelNonHero: true }),
  arch:   a('arch',   'Archon',         8, 16, 20, 4, { special: true, stack: { amount: 1 }, cancelHero: true }),
  drag:   a('drag',   'Dragon',         9, 22, 20, 4, { special: true, fly: true, stack: { amount: 2 } }),
  hero:   a('hero',   'Hero',           5, 14,  0, 0, { hero: true, buildable: false }),
};

// ---- Heroes Quest additions (our own layer on top of the 90s original numbers) -----------------------------------
// Pips: how many hits an army can take before it falls. PLACEHOLDER numbers, tuned by simulation (see COMBAT_DESIGN_DRAFT.md).
//   Light troops and scouts 2, medium foot and horse 3, big and winged beasts and every special army 4, the Dragon 6, boats 4. A hero has 4, plus one at level 3.
const PIPS = { scout: 2, bat: 2, linf: 2, orc: 2, lcav: 2, cat: 2,
  hinf: 3, elf: 3, dwarf: 3, pike: 3, hcav: 3, wolf: 3,
  giant: 4, mino: 4, spid: 4, peg: 4, grif: 4, uni: 4, ele: 4, navy: 4,
  wiz: 4, wyrm: 4, undead: 4, demon: 4, elem: 4, devil: 4, arch: 4, drag: 6, hero: 4 };
// Counters: this army fights one strength better against the listed types (that duel only, shown in the advisor).
const BEATS = { pike: ['lcav', 'hcav', 'wolf'], elf: ['bat', 'peg', 'grif', 'drag'], lcav: ['elf', 'cat'], hcav: ['elf', 'cat'], giant: ['pike'] };
// Prices: with toughness varying by class, the plain 90s original prices would make big armies far better value and cheap ones poor (a pip is worth ~15 points of
// standing). These prices keep every buildable army's equal-gold standing where it is in the 90s original (balance.mjs / reprice.mjs). Classic mode uses classicCost.
const PRICE = { linf: 2, orc: 3, lcav: 4, cat: 15, giant: 13, mino: 13, spid: 16, peg: 14, grif: 21, uni: 19, ele: 20 };
for (const k of Object.keys(ARMIES)) { ARMIES[k].classicCost = ARMIES[k].cost; if (PRICE[k]) ARMIES[k].cost = PRICE[k]; ARMIES[k].pips = PIPS[k] ?? 3; if (BEATS[k]) ARMIES[k].beats = BEATS[k]; }

export const ARMY_KEYS = Object.keys(ARMIES);
export const isSpecialType = (k) => !!ARMIES[k].special;
export const isBuildableType = (k) => !ARMIES[k].special && ARMIES[k].buildable !== false && k !== 'hero';

/** What an army costs to build under these rules (classic mode keeps the 90s original prices). */
export const priceOf = (d, rules) => (rules.classic ? d.classicCost : d.cost);

// ---- signature armies (Matt, 2026-10-22) -------------------------------------------------------------------------------------
// Each realm has one signature army. A realm starts with its hero and two of them in its capital, and its capital always builds it.
// A signature army may be a type cities do not normally build (the Ashen Legion's Undead): the owning realm may still build it.
export const SIGNATURE_ARMIES = {
  ivory: 'pike', gold: 'hcav', ember: 'dwarf', crimson: 'orc', verdant: 'elf', azure: 'grif', tidewatch: 'lcav', ashen: 'undead',
};
export const signatureOf = (realmId) => SIGNATURE_ARMIES[realmId] ?? null;
/** Can this realm build this type in a city? Ordinary buildable types, plus the realm's own signature army. */
export const canRealmBuild = (realmId, k) => !!ARMIES[k] && (isBuildableType(k) || (realmId != null && signatureOf(realmId) === k));
// HOOK (signature perk, to be designed with the combat lab): the HeroIntro mock-up shows e.g. "+1 in forest, and built a turn faster in your
// cities". No perk is applied yet. When it is designed, put it here and read it from the rules that need it:
//   build time -> doctrines.js buildTurns (calls signatureBuildTurnsBonus below, which returns 0 today);
//   strength   -> units.js individualStrength / baseStrength.
export const signatureBuildTurnsBonus = (realmId, type) => 0;   // HOOK: turns taken off building a realm's own signature army (none yet)
