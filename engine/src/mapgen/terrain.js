import { smoothstep, distanceTo } from './grid.js';

export const T = { SEA: 0, GRASS: 1, FOREST: 2, HILLS: 3, MOUNTAIN: 4, SAND: 5, LAKE: 6 };

function quantile(values, q) { const a = Float32Array.from(values).sort(); return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * q)))]; }

/** Elevation and the terrain classes from a land mask. A great river (optional) cuts a valley and a water barrier. */
export function buildTerrain(land, W, H, noise, river) {
  const sea = new Uint8Array(W * H); for (let i = 0; i < sea.length; i++) sea[i] = land[i] ? 0 : 1;
  const dSea = distanceTo(sea, W, H);
  const elev = new Float32Array(W * H); const terr = new Uint8Array(W * H);
  const riverBlock = new Uint8Array(W * H);
  const landIdx = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!land[i]) continue;
    const d = dSea[i]; const inland = smoothstep(0, 16, d);
    const R = Math.pow(noise.ridged(x, y, 1 / 42, 4), 2.0);
    let e = 0.06 + 0.30 * inland + 0.62 * R * smoothstep(2.5, 15, d) + 0.05 * (noise.fbm(x, y, 1 / 9, 3) - 0.5);
    if (river) { // a river valley: lower ground along the great river so tributaries flow into it
      let dd = 1e9; const p = river.pts;
      for (let k = 0; k < p.length - 1; k++) {
        const [ax, ay] = p[k], [bx, by] = p[k + 1]; const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        dd = Math.min(dd, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
      }
      e -= 0.22 * smoothstep(9, 0, dd);
      const wob = (noise.fbm(x, y, 1 / 7, 2) - 0.5) * 0.7;
      if (dd <= river.width / 2 + wob) riverBlock[i] = 1;
    }
    elev[i] = Math.max(0.02, e); landIdx.push(i);
  }
  const eVals = landIdx.map((i) => elev[i]);
  const mt = quantile(eVals, 0.925), ht = quantile(eVals, 0.78);
  const dry = []; const wet = [];
  for (const i of landIdx) { const x = i % W, y = (i / W) | 0; dry.push(noise.fbm(x + 311, y + 97, 1 / 40, 3)); wet.push(noise.fbm(x + 73, y + 419, 1 / 24, 3)); }
  const dryT = quantile(dry, 0.955), wetT = quantile(wet, 0.74);
  landIdx.forEach((i, k) => {
    const e = elev[i];
    if (e >= mt) terr[i] = T.MOUNTAIN;
    else if (e >= ht) terr[i] = T.HILLS;
    else if (wet[k] >= wetT) terr[i] = T.FOREST;
    else if (dry[k] >= dryT && dSea[i] > 3) terr[i] = T.SAND;
    else terr[i] = T.GRASS;
  });
  return { terr, elev, dSea, riverBlock };
}
