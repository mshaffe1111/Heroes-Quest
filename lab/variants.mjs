// Paired variant test for tuning the rival ladder.
//   node variants.mjs <engine src> <snapdir> <rounds> <variants.json> <out.jsonl> [foci=3] [part=0/1]
// variants.json: [{ "name": "good", "rung": "good" }, { "name": "sharp+temples", "rung": "sharp", "extra": { "blessDetour": 6 } }, ...]
// Every row: one snapshot, one focus realm, one dice seed; the focus realm plays the next <rounds> rounds once per variant while every other realm is
// Normal. Same position, same dice: only the variant differs. Then: node variants.mjs report <out.jsonl> <baseline name>
import fs from 'node:fs';
const score = (r) => r.dCities * 10 + r.dStrength / 5 + r.attacksWon * 2;
if (process.argv[2] === 'report') {
  const rows = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map((l) => JSON.parse(l)); const base = process.argv[4];
  const names = Object.keys(rows[0]).filter((k) => !['snap', 'focus', 'seed'].includes(k));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length; const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  console.log(`${rows.length} paired positions\n\nvariant               cities  attacks  won   attacked  score`);
  for (const n of names) { const v = rows.map((r) => r[n]); console.log(`${n.padEnd(20)} ${mean(v.map((x) => x.dCities)).toFixed(2).padStart(7)} ${mean(v.map((x) => x.attacks)).toFixed(2).padStart(8)} ${mean(v.map((x) => x.attacksWon)).toFixed(2).padStart(5)} ${mean(v.map((x) => x.attacked)).toFixed(2).padStart(9)} ${mean(v.map(score)).toFixed(1).padStart(6)}${v[0].extra ? '  ' + JSON.stringify(v[0].extra) : ''}`); }
  console.log(`\nagainst ${base} (same position, same dice):`);
  for (const n of names) { if (n === base) continue; const d = rows.map((r) => score(r[n]) - score(r[base])); const m = mean(d), se = sd(d) / Math.sqrt(d.length);
    const b = d.filter((x) => x > 0).length, w = d.filter((x) => x < 0).length;
    console.log(`${n.padEnd(20)} better ${String(b).padStart(3)}, worse ${String(w).padStart(3)}; ${m >= 0 ? '+' : ''}${m.toFixed(1)} ± ${(2 * se).toFixed(1)} -> ${Math.abs(m) < 2 * se ? 'not yet clear' : m > 0 ? 'BETTER' : 'WORSE'}`); }
  process.exit(0);
}
const [,, dir, snapdir, roundsS, vfile, out, fociS = '3', partS = '0/1'] = process.argv;
const E = await import(dir + '/index.js');
const R = +roundsS, FOCI = +fociS; const [part, parts] = partS.split('/').map(Number);
const variants = JSON.parse(fs.readFileSync(vfile, 'utf8'));
const snaps = fs.readdirSync(snapdir).filter((f) => /^c\d+_s\d+_t\d+\.json$/.test(f)).sort().filter((_, i) => i % parts === part);
const citiesOf = (g, r) => [...g.cities.values()].filter((c) => c.owner === r && !c.razed).length;
const strengthOf = (g, r) => [...g.armies.values()].filter((a) => a.owner === r && a.x != null).reduce((s, a) => s + (E.ARMIES[a.type]?.str ?? 3) + (a.blessings ?? 0), 0);
function setRung(g, id, rung, extra = null, over = {}) { const p = { ...E.RUNG_PLAY[rung], ...over }; const r = g.realms.get(id); r.rung = rung; r.difficulty = p.level; r.skill = p.skill; r.habit = 'steady'; r.aiExtra = { ...(p.extra ?? {}), ...(extra ?? {}) }; }
const load = (f) => E.loadGame(JSON.parse(fs.readFileSync(`${snapdir}/${f}`, 'utf8'))).game;
fs.writeFileSync(out, '');
for (const f of snaps) {
  const probe = load(f); const alive = E.liveRealms(probe).filter((r) => citiesOf(probe, r) > 0);
  const step = Math.max(1, Math.floor(alive.length / FOCI)); const foci = alive.filter((_, i) => i % step === 0).slice(0, FOCI);
  for (const focus of foci) {
    const row = { snap: f, focus, seed: 0 };
    for (const v of variants) {
      const g = load(f); g.rng = E.makeRng(4000 + snaps.indexOf(f) * 31 + alive.indexOf(focus));
      for (const r of g.realms.values()) { r.human = false; setRung(g, r.id, 'normal'); } setRung(g, focus, v.rung, v.extra, { ...(v.level ? { level: v.level } : {}), ...(v.skill != null ? { skill: v.skill } : {}) });
      const c0 = citiesOf(g, focus), s0 = strengthOf(g, focus); let attacks = 0, won = 0, attacked = 0, errors = 0;
      E.setActionHook((e) => { if (e.t !== 'attack') return; if (e.realm === focus) { attacks++; if (e.winner === 'attacker') won++; } else if (e.defender === focus) attacked++; });
      for (let t = 0; t < R; t++) { for (const r of E.liveRealms(g)) { try { E.beginTurn(g, r); E.aiPlay(g, r); } catch { errors++; } } E.endRound(g); }
      E.setActionHook(null);
      row[v.name] = { dCities: citiesOf(g, focus) - c0, dStrength: strengthOf(g, focus) - s0, attacks, attacksWon: won, attacked, errors, ...(v.extra ? { extra: v.extra } : {}),
        blessings: g.ai?.[focus]?.stats?.blessings ?? 0, towers: g.ai?.[focus]?.stats?.towers ?? 0 };
    }
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  }
}
console.log('done', out);
