import { hasPerk, isHero } from './units.js';

/**
 * Hero perks (Heroes Quest). Each level a hero gains earns one perk point. Spending it, the player is offered a shortlist of three perks
 * drawn from the pool below, leaning toward the hero's temperament, and keeps one. Names and effects are our own.
 * Every number here is a PLACEHOLDER (see rules.js for the tunable ones).
 * Heroes reach level 9, so a hero earns up to 8 perk points: exactly the 8 perks offerable today. The shortlist is drawn only from perks he
 * does not have yet, so late picks may offer fewer than three; once none are left, any further point is dropped (offerPerks says 'no-perks-left').
 */
export const PERKS = {
  rally:      { name: 'Rally',         text: 'In the first two duels of any battle, the stack gets +1 stack bonus.' },
  charge:     { name: 'Charge',        text: 'In the first three duels of an attack, the stack gets +1 stack bonus.' },
  fortifier:  { name: 'Fortifier',     text: 'In the first three duels when defending, the stack gets +1 stack bonus.' },
  tactician:  { name: 'Tactician',     text: 'Enemy counters cannot be used against this hero\'s stack.' },
  banner:     { name: 'Banner-bearer', text: 'The hero himself fights one strength higher.' },
  tough:      { name: 'Hardened',      text: 'The hero has +1 pip.' },
  pathfinder: { name: 'Pathfinder',    text: 'The hero moves further each turn, so a stack he leads travels faster.' },
  field_medic:{ name: 'Field Medic',   text: 'Wounded armies in his stack heal a pip every turn, even outside a city.' },
  scout:      { name: 'Scout',         text: 'Sees further across the map when fog of war is on.', needs: 'fog' },
};
/** Perks the engine can honour today (Scout waits for fog of war). */
export const OFFERABLE = Object.keys(PERKS).filter((k) => !PERKS[k].needs);

/** A hero's temperament leans his shortlist toward a style of play. */
export const TEMPERAMENTS = {
  warlord:  { name: 'Warlord',  favours: ['charge', 'banner', 'tough'] },
  marshal:  { name: 'Marshal',  favours: ['rally', 'tactician', 'fortifier'] },
  wayfarer: { name: 'Wayfarer', favours: ['pathfinder', 'field_medic', 'scout'] },
  warden:   { name: 'Warden',   favours: ['fortifier', 'tough', 'field_medic'] },
};
const TEMPER_KEYS = Object.keys(TEMPERAMENTS);

/** Perks this hero could still be offered (offerable ones he does not have). */
export const perksLeft = (h) => OFFERABLE.filter((k) => !hasPerk(h, k));

/** The three perks on offer for this hero's next pick. The offer is remembered, so asking again shows the same three. */
export function offerPerks(g, heroId, count = 3) {
  const h = g.armies.get(heroId);
  if (!h || !isHero(h)) return { ok: false, reason: 'not-a-hero' };
  if (!(h.perkPoints > 0)) return { ok: false, reason: 'no-perk-point' };
  if (h.perkOffer?.length) return { ok: true, offer: h.perkOffer };
  h.temperament ??= TEMPER_KEYS[Math.floor(g.rng.next() * TEMPER_KEYS.length)];
  const favours = TEMPERAMENTS[h.temperament].favours;
  const pool = perksLeft(h);
  if (!pool.length) { h.perkPoints = 0; h.perkOffer = null; return { ok: false, reason: 'no-perks-left' }; }     // he has every perk there is: nothing to choose
  const offer = [];
  while (offer.length < count && pool.length) {
    const weights = pool.map((k) => (favours.includes(k) ? 3 : 1));
    let r = g.rng.next() * weights.reduce((a, b) => a + b, 0), i = 0;
    while (i < pool.length - 1 && (r -= weights[i]) > 0) i++;
    offer.push(pool.splice(i, 1)[0]);
  }
  h.perkOffer = offer;
  return { ok: true, offer };
}

/** Spend a perk point on one of the offered perks. */
export function choosePerk(g, heroId, key) {
  const r = offerPerks(g, heroId); if (!r.ok) return r;
  if (!r.offer.includes(key)) return { ok: false, reason: 'not-on-offer' };
  const h = g.armies.get(heroId);
  h.perks.push(key); h.perkPoints--; h.perkOffer = null;
  return { ok: true, perk: key };
}

/** The computer's pick: the offered perk that suits the hero's temperament best (first listed wins a tie). */
export function aiChoosePerk(g, heroId) {
  const r = offerPerks(g, heroId); if (!r.ok) return r;
  const h = g.armies.get(heroId); const favours = TEMPERAMENTS[h.temperament].favours;
  const score = (k) => (favours.includes(k) ? 10 - favours.indexOf(k) : 0);
  const best = [...r.offer].sort((x, y) => score(y) - score(x))[0];
  return choosePerk(g, heroId, best);
}
