// Shared game state and a few lookups every screen needs.
import * as E from '../../engine/src/index.js';
import { medalURL, realmHex } from './view.js';
export const S = { g: null, me: null, view: null, assets: null, sel: null, meta: {}, busy: false, opts: { odds: true, autoNext: true, sound: true } };
export const hooks = {};            // functions set by the controller (refresh, openCity, ...) so screens can call back without importing it
export const realmOf = (id) => (id ? S.g.realms.get(id) : null);
export const colorOf = (id) => realmOf(id)?.color ?? 'beige';
export const medalImg = (type, ownerId, size = 128) => medalURL(S.assets, type, realmHex(realmOf(ownerId)), size);
export const unitName = (a) => (E.isHero(a) ? (a.name ?? 'Hero') : E.ARMIES[a.type].name);
export const theRealm = (id) => (id ? `the ${realmOf(id)?.name ?? '—'}` : 'the Unsworn');
export const realmName = (id) => (id ? realmOf(id)?.name ?? '—' : 'the Unsworn');
export const myCities = () => [...S.g.cities.values()].filter((c) => c.owner === S.me && !c.razed);
export const economy = () => E.realmEconomy(S.g, S.me);
export function unitLine(a) {
  const d = E.ARMIES[a.type]; const g = S.g;
  if (E.isHero(a)) return `Hero · level ${a.level} · S ${E.heroStrength(a, g.rules)}`;
  return `S ${d.str} · M ${d.move}`;
}
