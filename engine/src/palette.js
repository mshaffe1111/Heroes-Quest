// The 24 owner colours of the game (8 realms, 15 spares, beige = neutral) and the transport ship each realm sails.
// A ship token is one neutral beige ring painting; the ring is tinted to the owner's colour at draw time with tintRing().
export const PALETTE = {
  white: '#f0f0f4', gold: '#f5c81e', orange: '#f28c1e', red: '#dc382c', green: '#34a046', blue: '#2e64d6', cyan: '#38c6e2', black: '#46465c',
  yellow: '#f2e84a', silver: '#b8bec9', bronze: '#b9784a', maroon: '#8c2a3c', navy: '#243a7a', lime: '#9ad62a', magenta: '#d02c90',
  lavender: '#ad94d6', indigo: '#4b3a9a', olive: '#7d8238', rose: '#ec8f9c', purple: '#8a2cc0', pink: '#f06ab0', brown: '#7a5232', teal: '#2a8c8c',
  beige: null,      // neutral (the Unsworn): the ring is left as painted
};
/** Transport ship art for each realm (file names in assets/ships/neutral). */
export const REALM_SHIPS = {
  ivory: 'pilgrim', gold: 'carrack', ember: 'longship', crimson: 'galley', verdant: 'hulk', azure: 'cog', tidewatch: 'dhow', ashen: 'fusta',
};

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Tint the ring of a square RGBA medallion (Uint8ClampedArray / Uint8Array, size x size) to `hex`, in place.
 * The ring is the band between 0.416 and 0.498 of the width from the centre (the painted beige ring); the bevel light and dark
 * is kept, only the colour changes. Pixels inside the ring are never touched. Pass null / 'beige' to leave it as painted.
 */
export function tintRing(data, size, hex) {
  if (!hex) return data;
  const T = hexToRgb(hex); const c = (size - 1) / 2; const sc = size / 232;
  const inner = 96.5 * sc, outer = 115 * sc, e = Math.max(1, 1.2 * sc);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - c, y - c); const w = clamp((d - inner) / e, 0, 1) * clamp((outer - d) / e, 0, 1) * 0.93;
    if (w <= 0) continue;
    const i = (y * size + x) * 4; const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; const k = L / 165;
    for (let ch = 0; ch < 3; ch++) {
      const t = clamp(T[ch] * (0.32 + 0.82 * k) + clamp(k - 1, 0, 1) * 80, 0, 255);
      data[i + ch] = data[i + ch] * (1 - w) + t * w;
    }
  }
  return data;
}
