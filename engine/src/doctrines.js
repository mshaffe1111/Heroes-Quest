// Doctrines (approved screen 16o): twelve permanent upgrades a realm buys with gold. No research, no tree.
// Each doctrine a realm already owns makes its next purchase 25% dearer (base × 1.25^owned, to the nearest 5 gold). The computer realms buy under the same rules.
// Owned doctrines live in rules.docs (Map realmId -> Set of keys), so the pure rule functions, which only receive `rules`, can ask about an army's owner.
// Prices and the "foot" list are PLACEHOLDERS to tune with play.
import { ARMIES, priceOf, signatureBuildTurnsBonus } from './armies.js';
import { stat, spent } from './stats.js';
import { emit } from './events.js';

export const DOCTRINES = {
  drilled:   { name: 'Drilled Ranks',  group: 'Army',          base: 400, text: 'Armies become Seasoned after 3 duels won instead of 4.' },
  hospitals: { name: 'Field Hospitals', group: 'Army',         base: 350, text: 'Armies in your cities heal 2 pips a turn instead of 1.' },
  march:     { name: 'Long March',     group: 'Army',          base: 450, text: 'Foot armies get 2 more move points.' },
  line:      { name: 'Hold the Line',  group: 'Army',          base: 500, text: 'A stack defending in the open gets its camp bonus at once, not after a full turn.' },
  call:      { name: "Hero's Call",    group: 'Heroes',        base: 400, text: 'Hiring a hero costs 40% less.' },
  heraldry:  { name: 'Heraldry',       group: 'Heroes',        base: 450, text: 'Heroes earn double experience from battles.' },
  walls:     { name: 'Stone Walls',    group: 'Cities',        base: 600, text: 'Every city of yours gives its defenders 1 more.' },
  muster:    { name: 'Quick Muster',   group: 'Cities',        base: 450, text: 'Armies priced 5g or less take 1 turn less to build.' },
  quarter:   { name: 'Quartermasters', group: 'Cities',        base: 700, text: 'Upkeep is 40% of an army’s price instead of 50%.' },
  tax:       { name: 'Tax Reform',     group: 'Cities',        base: 500, text: 'Each city pays 4 more gold every turn.' },
  sea:       { name: 'Sea Lords',      group: 'Sea and siege', base: 500, text: 'Armies afloat pay no extra upkeep and fight at strength 5 at sea.' },
  sappers:   { name: 'Sapper Corps',   group: 'Sea and siege', base: 600, text: 'Enemy cities defend 1 weaker against your attacks.' },
};
export const DOCTRINE_KEYS = Object.keys(DOCTRINES);
/** Foot armies, for Long March: the infantry and archers. Cavalry, monsters and flyers already move well. */
export const FOOT = new Set(['scout', 'linf', 'orc', 'hinf', 'elf', 'dwarf', 'pike']);
export const DOCTRINE_NUMBERS = { priceStep: 1.25, heal: 1, march: 2, handsOff: 0.6, heraldryXp: 2, walls: 1, sappers: 1, taxPerCity: 4, quarterFraction: 0.4, seaStrength: 5, musterMaxPrice: 5 };

export const hasDoctrine = (rules, realmId, key) => !!rules.docs?.get(realmId)?.has(key);
export const doctrinesOf = (g, realmId) => [...(g.rules.docs?.get(realmId) ?? [])];
export const doctrineCount = (g, realmId) => g.rules.docs?.get(realmId)?.size ?? 0;
/** What the next doctrine costs this realm: the base price, 25% dearer for each one already owned, to the nearest 5. */
export function doctrinePrice(g, realmId, key) {
  return Math.round(DOCTRINES[key].base * DOCTRINE_NUMBERS.priceStep ** doctrineCount(g, realmId) / 5) * 5;
}
export function buyDoctrine(g, realmId, key) {
  const d = DOCTRINES[key]; if (!d) return { ok: false, reason: 'no-such-doctrine' };
  const realm = g.realms.get(realmId); if (!realm) return { ok: false, reason: 'no-such-realm' };
  if (hasDoctrine(g.rules, realmId, key)) return { ok: false, reason: 'already-owned' };
  const price = doctrinePrice(g, realmId, key);
  if (realm.gold < price) return { ok: false, reason: 'not-enough-gold', price };
  realm.gold -= price; spent(g, realmId, price);
  if (!g.rules.docs.has(realmId)) g.rules.docs.set(realmId, new Set());
  g.rules.docs.get(realmId).add(key);
  const log = g.stats?.realms.get(realmId)?.doctrines; if (log) log.push({ key, turn: g.turn, price });
  emit(() => ({ t: 'doctrine', realm: realmId, key, name: d.name, price }));
  return { ok: true, price, key };
}
export const canBuyDoctrine = (g, realmId, key) => !hasDoctrine(g.rules, realmId, key) && g.realms.get(realmId).gold >= doctrinePrice(g, realmId, key);

// ---- the effects, as small questions the rules ask ----------------------------------------------------------------
/** Turns a city needs to finish this army type for this realm (Quick Muster takes a turn off cheap armies; never below one). */
export function buildTurns(rules, realmId, def) {
  const cheap = hasDoctrine(rules, realmId, 'muster') && priceOf(def, rules) <= DOCTRINE_NUMBERS.musterMaxPrice;
  return Math.max(1, def.build - (cheap ? 1 : 0) - signatureBuildTurnsBonus(realmId, def.key));     // signature hook: 0 until the perk is designed
}
export const footBonus = (rules, a) => (hasDoctrine(rules, a.owner, 'march') && FOOT.has(a.type) ? DOCTRINE_NUMBERS.march : 0);
export const cityHealOf = (rules, realmId) => rules.cityHeal + (hasDoctrine(rules, realmId, 'hospitals') ? DOCTRINE_NUMBERS.heal : 0);
export const heroPriceFor = (rules, realmId, price) => (hasDoctrine(rules, realmId, 'call') ? Math.round(price * DOCTRINE_NUMBERS.handsOff) : price);
export const battleXpFor = (rules, a) => rules.xp.battle * (hasDoctrine(rules, a.owner, 'heraldry') ? DOCTRINE_NUMBERS.heraldryXp : 1);
export const upkeepFractionFor = (rules, realmId) => (hasDoctrine(rules, realmId, 'quarter') ? DOCTRINE_NUMBERS.quarterFraction : rules.upkeepFraction);
export const taxFor = (rules, realmId, cities) => (hasDoctrine(rules, realmId, 'tax') ? DOCTRINE_NUMBERS.taxPerCity * cities : 0);
