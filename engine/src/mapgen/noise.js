import { createNoise2D } from 'simplex-noise';
import { makeRng } from '../rng.js';

/** Seeded fractal noise sampler: fbm(x, y, scale, octaves) in roughly 0..1. */
export function makeNoise(seed) {
  const rng = makeRng(seed);
  const n2 = createNoise2D(rng.next);
  const fbm = (x, y, scale = 1 / 40, oct = 4, gain = 0.5) => {
    let amp = 1, f = scale, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * n2(x * f, y * f); norm += amp; amp *= gain; f *= 2; }
    return 0.5 + 0.5 * (sum / norm);
  };
  const ridged = (x, y, scale = 1 / 30, oct = 4) => {
    let amp = 1, f = scale, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * (1 - Math.abs(n2(x * f, y * f))); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
  return { fbm, ridged, raw: n2, rng };
}
