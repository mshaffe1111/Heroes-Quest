// Magical items (manual ch.13e and 15). The manual says they give heroes strength or command, let a stack fly, speed a stack up,
// or improve tax collection. The numbers and the names are ours (original names; tiers and amounts are PLACEHOLDERS).
//   strength : added to the hero's strength (this also raises his natural command bonus)
//   command  : added straight to the stack bonus (counts every item; the best hero's natural bonus plus all items)
//   fly      : the whole group flies
//   speed    : the stack he stands in at the end of the turn gets double move points next turn; two heroes with one each give triple
//   tax      : gold per turn
//   standard : the realm Standard: +1 command and can be planted as a rally flag
export const ITEMS = {
  standard:    { name: 'Realm Standard',      command: 1, standard: true, tier: 0 },
  keenblade:   { name: 'Keen Blade',          strength: 1, tier: 1 },
  dawnblade:   { name: 'Dawnforged Blade',    strength: 2, tier: 2 },
  sunsplitter: { name: 'Sunsplitter',         strength: 3, tier: 3 },
  pennant:     { name: "Captain's Pennant",   command: 1, tier: 1 },
  hostbanner:  { name: 'Banner of the Host',  command: 2, tier: 2 },
  crown:       { name: 'Crown of Command',    command: 3, tier: 3 },
  wings:       { name: 'Cloak of Wings',      fly: true, tier: 2 },
  boots:       { name: 'Boots of Swiftness',  speed: true, tier: 2 },
  staff:       { name: 'Staff of Marches',    speed: true, tier: 3 },
  purse:       { name: "Merchant's Purse",    tax: 10, tier: 1 },
};
export const ITEM_KEYS = Object.keys(ITEMS);
export const itemsOfTier = (min, max) => ITEM_KEYS.filter((k) => ITEMS[k].tier >= min && ITEMS[k].tier <= max);

export function makeItem(g, key) {
  const d = ITEMS[key]; if (!d) throw new Error(`unknown item: ${key}`);
  g.nextItemId = (g.nextItemId ?? 1) + 1;
  return { id: `i${g.nextItemId}`, key, ...d };
}

// ---- items lying on the ground -----------------------------------------------------------------------------------
const gk = (x, y) => `${x},${y}`;
export const groundItemsAt = (g, x, y) => g.groundItems.get(gk(x, y)) ?? [];
export function dropOnGround(g, x, y, items) {
  if (!items.length) return;
  g.groundItems.set(gk(x, y), [...groundItemsAt(g, x, y), ...items]);
}
function heroOf(g, id) { const h = g.armies.get(id); if (!h || h.type !== 'hero') throw new Error('not a hero'); return h; }
/** A hero picks up an item lying on his square. */
export function takeItem(g, heroId, itemId) {
  const h = heroOf(g, heroId); const list = groundItemsAt(g, h.x, h.y); const i = list.findIndex((it) => it.id === itemId);
  if (i < 0) return { ok: false, reason: 'not-here' };
  const [it] = list.splice(i, 1); if (!list.length) g.groundItems.delete(gk(h.x, h.y)); else g.groundItems.set(gk(h.x, h.y), list);
  h.items.push(it); return { ok: true, item: it };
}
/** A hero drops an item on his square (to hand it to another hero standing here). */
export function dropItem(g, heroId, itemId) {
  const h = heroOf(g, heroId); const i = h.items.findIndex((it) => it.id === itemId);
  if (i < 0) return { ok: false, reason: 'not-carried' };
  const [it] = h.items.splice(i, 1); dropOnGround(g, h.x, h.y, [it]); return { ok: true, item: it };
}
/** Move an item straight from one hero to another on the same square. */
export function giveItem(g, fromId, toId, itemId) {
  const a = heroOf(g, fromId), b = heroOf(g, toId);
  if (a.x !== b.x || a.y !== b.y) return { ok: false, reason: 'not-together' };
  const i = a.items.findIndex((it) => it.id === itemId); if (i < 0) return { ok: false, reason: 'not-carried' };
  b.items.push(...a.items.splice(i, 1)); return { ok: true };
}
/** A hero dies: his items drop on the square, unless he died in or over open water, where they are lost (Rules of Engagement, Navies 7). */
export function dropDeadHeroItems(g, hero, x, y, lostAtSea) {
  if (!hero.items.length) return [];
  const items = hero.items.splice(0); if (lostAtSea) return [];
  dropOnGround(g, x, y, items); return items;
}

// ---- speed items -------------------------------------------------------------------------------------------------
/** Move-point multiplier for a stack at the start of a turn: 1, or 2 with one speed hero, 3 with two (heroes with a speed item each). */
export function speedMultiplier(stack) {
  const n = stack.filter((a) => a.type === 'hero' && a.items.some((i) => i.speed)).length;
  return 1 + Math.min(2, n);
}
export const heroTax = (h) => (h.items ?? []).reduce((s, i) => s + (i.tax || 0), 0);
