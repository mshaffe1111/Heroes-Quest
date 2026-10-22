// Small grid helpers shared by the map generator. Grids are flat typed arrays, index = y * W + x.
export const D8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export const D4 = [[-1, 0], [0, -1], [0, 1], [1, 0]];

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Label connected components of cells where mask[i] is true. Returns { lab (Int32, 0 = none), sizes[] (index = label) }. */
export function components(mask, W, H, eight = false) {
  const lab = new Int32Array(W * H); const sizes = [0]; let n = 0;
  const dirs = eight ? D8 : D4; const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    n++; let size = 0; stack.push(s); lab[s] = n;
    while (stack.length) {
      const c = stack.pop(); size++; const cx = c % W, cy = (c / W) | 0;
      for (const [dy, dx] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (mask[ni] && !lab[ni]) { lab[ni] = n; stack.push(ni); }
      }
    }
    sizes.push(size);
  }
  return { lab, sizes, count: n };
}

/** Distance (in cells, 8-neighbour chamfer) from every cell to the nearest cell where src[i] is true. */
export function distanceTo(src, W, H) {
  const INF = 1e9, d = new Float32Array(W * H).fill(INF);
  for (let i = 0; i < W * H; i++) if (src[i]) d[i] = 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) { v = Math.min(v, d[i - W] + a); if (x > 0) v = Math.min(v, d[i - W - 1] + b); if (x < W - 1) v = Math.min(v, d[i - W + 1] + b); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + a);
    if (y < H - 1) { v = Math.min(v, d[i + W] + a); if (x < W - 1) v = Math.min(v, d[i + W + 1] + b); if (x > 0) v = Math.min(v, d[i + W - 1] + b); }
    d[i] = v;
  }
  return d;
}

/** Box-blur style smoothing, n passes (cheap stand-in for a Gaussian). */
export function blur(src, W, H, r, passes = 2) {
  let a = Float32Array.from(src), b = new Float32Array(W * H);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) { let s = 0, c = 0; const row = y * W;
      for (let x = -r; x < W; x++) {
        const add = x + r, rem = x - r - 1;
        if (add < W) { s += a[row + add]; c++; }
        if (rem >= 0) { s -= a[row + rem]; c--; }
        if (x >= 0) b[row + x] = s / c;
      } }
    for (let x = 0; x < W; x++) { let s = 0, c = 0;
      for (let y = -r; y < H; y++) {
        const add = y + r, rem = y - r - 1;
        if (add < H) { s += b[add * W + x]; c++; }
        if (rem >= 0) { s -= b[rem * W + x]; c--; }
        if (y >= 0) a[y * W + x] = s / c;
      } }
  }
  return a;
}

/** Binary min-heap keyed by number. */
export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v; const rk = k[0], rv = v[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
        if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; }
    }
    return [rk, rv];
  }
}
