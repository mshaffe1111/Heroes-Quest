// A map tile: { terrain: 'open'|'woods'|'hills'|'swamp'|'mountain'|'water', road?: bool, shore?: bool,
//               site?: 'ruin'|'temple'|'tower', port?: bool, bridge?: bool }.
// Cities are kept by the game and mark the tile with cityId.
//   port   : a coastal LAND square marked with an anchor - armies may embark and disembark here (Warlords II).
//   bridge : a WATER square that carries a bridge deck (river bridge or sea causeway). Walkers cross it at road cost,
//            boats sail under it, and it is an embark / disembark point.
export const TERRAINS = ['open', 'woods', 'hills', 'swamp', 'mountain', 'water'];

/** Terrain letters that decide battle bonuses. Roads count as the terrain they run through. */
export function combatLetters(tile) {
  if (tile.cityId || tile.site) return ['C'];
  if (tile.bridge) return ['R'];
  switch (tile.terrain) {
    case 'open': return tile.road ? ['O', 'R'] : ['O'];
    case 'woods': return ['W'];
    case 'hills': return ['H'];
    default: return [];
  }
}
/** Letter used for movement bonuses (a bonus army pays the open-ground cost there). */
export function moveLetter(tile) {
  if (tile.road || tile.cityId) return null;
  return tile.terrain === 'woods' ? 'W' : tile.terrain === 'hills' ? 'H' : null;
}

/** Open water that only boats and flyers can use: water with no city, no bridge deck. */
export const isSea = (tile) => !!tile && tile.terrain === 'water' && !tile.cityId && !tile.bridge;
/** Ground that slows the stack order in combat display: mountains and open sea. */
export const isRoughGround = (tile) => !!tile && (tile.terrain === 'mountain' || isSea(tile));
/** A square where a group may come ashore from, or take to, the boats (the square must also touch water, see game.isEmbarkPoint). */
export const isLandingKind = (tile) => !!tile && (!!tile.cityId || !!tile.port || !!tile.bridge);
