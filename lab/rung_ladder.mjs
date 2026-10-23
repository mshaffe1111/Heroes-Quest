// Paired rung ladder: does each rung of the rival ladder really play better than the one below it?
//   node rung_ladder.mjs <engine src> <snapdir> <rounds> <out.jsonl> [foci per snapshot=3] [seeds=2]
// Every row: one snapshot, one focus realm, one dice seed, played once per rung by the focus realm (every other realm Normal),
// so rungs are compared on the same position with the same dice. Then: node analyze_rungs.mjs <out.jsonl>
import fs from 'node:fs';
const [,, dir, snapdir, roundsS = '10', out, fociS = '3', seedsS = '2'] = process.argv;
const E = await import(dir + '/index.js');
const R = +roundsS, FOCI = +fociS, SEEDS = +seedsS;
const RUNGS = E.RUNGS;
const snaps = fs.readdirSync(snapdir).filter((f) => /^c\d+_s\d+_t\d+\.json$/.test(f)).sort();
const citiesOf = (g, r) => [...g.cities.values()].filter((c) => c.owner === r && !c.razed).length;
const strengthOf = (g, r) => [...g.armies.values()].filter((a) => a.owner === r && a.x != null).reduce((s, a) => s + (E.ARMIES[a.type]?.str ?? 3), 0);
function setRung(g, id, rung) { const p = E.RUNG_PLAY[rung]; const r = g.realms.get(id); r.rung = rung; r.difficulty = p.level; r.skill = p.skill; r.habit = 'steady'; }
fs.writeFileSync(out, '');
for (const f of snaps) {
  const probe = E.loadGame(JSON.parse(fs.readFileSync(`${snapdir}/${f}`, 'utf8'))).game; const alive = E.liveRealms(probe).filter((r) => citiesOf(probe, r) > 0);
  const foci = alive.filter((_, i) => i % Math.max(1, Math.floor(alive.length / FOCI)) === 0).slice(0, FOCI);
  for (const focus of foci) for (let sd = 0; sd < SEEDS; sd++) {
    const row = { snap: f, focus, seed: sd };
    for (const rung of RUNGS) {
      const g = E.loadGame(JSON.parse(fs.readFileSync(`${snapdir}/${f}`, 'utf8'))).game; g.rng = E.makeRng(1000 + sd * 97 + snaps.indexOf(f));
      for (const r of g.realms.values()) { r.human = false; setRung(g, r.id, 'normal'); } setRung(g, focus, rung);
      const c0 = citiesOf(g, focus), s0 = strengthOf(g, focus); let attacks = 0, won = 0, attacked = 0;
      E.setActionHook((e) => { if (e.t !== 'attack') return; if (e.realm === focus) { attacks++; if (e.winner === 'attacker') won++; } else if (e.defender === focus) attacked++; });
      for (let t = 0; t < R; t++) { for (const r of E.liveRealms(g)) { E.beginTurn(g, r); E.aiPlay(g, r); } E.endRound(g); }
      E.setActionHook(null);
      row[rung] = { dCities: citiesOf(g, focus) - c0, dStrength: strengthOf(g, focus) - s0, attacks, attacksWon: won, attacked };
    }
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  }
}
console.log('done', out);
