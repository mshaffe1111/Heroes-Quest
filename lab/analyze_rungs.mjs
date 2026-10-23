// Turn ladder.jsonl into difficulty ratings.  node analyze.mjs <ladder.jsonl>
// Each row is one snapshot + one dice seed played once per level by the same realm, so levels are compared pair by pair (paired test).
import fs from 'node:fs';
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const levels = ['clumsy', 'weak', 'normal', 'good', 'sharp'].filter((L) => rows[0]?.[L]);
const score = (r) => r.dCities * 10 + r.dStrength / 5 + r.attacksWon * 2;   // cities matter most, then armies kept, then battles won
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
console.log(`${rows.length} positions, each played at ${levels.length} levels (${rows.length * levels.length} branches)\n`);
console.log('level     cities gained  attacks  attacks won  times attacked  score');
for (const L of levels) {
  const v = rows.map((r) => r[L]);
  console.log(`${L.padEnd(9)} ${mean(v.map((x) => x.dCities)).toFixed(2).padStart(13)} ${mean(v.map((x) => x.attacks)).toFixed(2).padStart(8)} ${mean(v.map((x) => x.attacksWon)).toFixed(2).padStart(12)} ${mean(v.map((x) => x.attacked)).toFixed(2).padStart(15)} ${mean(v.map(score)).toFixed(1).padStart(6)}`);
}
console.log('\npairwise (same position, same dice): how often the higher level did better, and the average difference in score');
for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) {
  const A = levels[i], B = levels[j]; const d = rows.map((r) => score(r[B]) - score(r[A]));
  const better = d.filter((x) => x > 0).length, worse = d.filter((x) => x < 0).length;
  const m = mean(d), se = sd(d) / Math.sqrt(d.length);
  const verdict = Math.abs(m) < 2 * se ? 'not yet clear' : m > 0 ? `${B} is better` : `${A} is better`;
  console.log(`${B} vs ${A}: better ${better}, worse ${worse}, tied ${d.length - better - worse}; difference ${m.toFixed(1)} ± ${(2 * se).toFixed(1)} -> ${verdict}`);
}
// a simple rating: Elo from every pairwise comparison
const elo = Object.fromEntries(levels.map((L) => [L, 1500]));
for (let pass = 0; pass < 30; pass++) for (const r of rows) for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) {
  const A = levels[i], B = levels[j]; const sA = score(r[A]), sB = score(r[B]); const res = sA > sB ? 1 : sA < sB ? 0 : 0.5;
  const exp = 1 / (1 + 10 ** ((elo[B] - elo[A]) / 400)); const k = 4; elo[A] += k * (res - exp); elo[B] -= k * (res - exp);
}
console.log('\nrating (like chess; 100 points = about 64% to do better in the same spot):', levels.map((L) => `${L} ${Math.round(elo[L])}`).join(', '));
