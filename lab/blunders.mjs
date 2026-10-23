// Blunder check for the rival ladder (Matt 22 Oct): does each rung play like its name? Clumsy should make visible mistakes, Sharp almost none.
//   node blunders.mjs <engine src dir> <snapdir> [rounds=8]
// Every snapshot is replayed with every computer realm put on a rung (rotated across snapshots so each rung plays every seat), and the
// action feed is watched. Per rung it counts, per 10 realm-turns unless noted:
//   hopeless   attacks made at under 30% odds (needs the 'odds' field on attack events), per 10 attacks
//   lostAtt    attacks that lost, per 10 attacks
//   emptyCap   turns ended with the capital empty while an enemy army stands within 5 squares
//   idleCity   cities left building nothing at the end of the turn (per 10 city-turns)
//   stillOpen  armies standing in the open that never moved all turn (per 10 field-army-turns)
//   pingPong   armies that went A -> B -> back to A over their last two turns, outside cities (per 10 army-turns)
//   cities     cities gained over the run (the result the rung buys)
import fs from 'node:fs';
const [,, dir, snapdir, roundsS = '8'] = process.argv;
const E = await import(dir + '/index.js');
const R = +roundsS;
const snaps = fs.readdirSync(snapdir).filter((f) => /^c\d+_s\d+_t\d+\.json$/.test(f)).sort();
const RUNGS = E.RUNGS;
const T = Object.fromEntries(RUNGS.map((r) => [r, { turns: 0, attacks: 0, hopeless: 0, oddsKnown: 0, lost: 0, emptyCap: 0, cityTurns: 0, idleCity: 0, fieldTurns: 0, stillOpen: 0, armyTurns: 0, pingPong: 0, cities: 0, runs: 0 }]));
const citiesOf = (g, r) => [...g.cities.values()].filter((c) => c.owner === r && !c.razed);
const near = (g, r, x, y, d) => [...g.armies.values()].some((a) => a.owner && a.owner !== r && a.x != null && Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) <= d);
let events = []; E.setActionHook((e) => events.push(e));

for (const [si, f] of snaps.entries()) {
  const g = E.loadGame(JSON.parse(fs.readFileSync(`${snapdir}/${f}`, 'utf8'))).game; g.rng = E.makeRng(900 + si);
  for (const r of g.realms.values()) r.human = false;
  const live = E.liveRealms(g);
  // put every live realm on a rung, rotating with the snapshot so each rung plays every seat over the run
  live.forEach((id, i) => { const rung = RUNGS[(i + si) % RUNGS.length]; const p = E.RUNG_PLAY[rung]; const r = g.realms.get(id); r.rung = rung; r.difficulty = p.level; r.skill = p.skill; r.habit = 'steady'; });
  const caps = Object.fromEntries(live.map((id) => [id, (citiesOf(g, id).find((c) => (g.map?.caps ?? []).includes(c.id)) ?? citiesOf(g, id)[0])?.id]));
  const c0 = Object.fromEntries(live.map((id) => [id, citiesOf(g, id).length]));
  const trail = new Map();      // army id -> last positions at the end of its realm's turns
  for (let t = 0; t < R; t++) {
    for (const r of E.liveRealms(g)) {
      const realm = g.realms.get(r); const S = T[realm.rung]; if (!S) { E.beginTurn(g, r); E.aiPlay(g, r); continue; }
      E.beginTurn(g, r); const start = new Map([...g.armies.values()].filter((a) => a.owner === r && a.x != null).map((a) => [a.id, `${a.x},${a.y}`]));
      events = []; E.aiPlay(g, r); S.turns++;
      for (const e of events) if (e.t === 'attack' && e.realm === r) { S.attacks++; if (e.winner !== 'attacker') S.lost++; if (typeof e.odds === 'number') { S.oddsKnown++; if (e.odds < 0.3) S.hopeless++; } }
      const cap = caps[r] && g.cities.get(caps[r]); if (cap && cap.owner === r && !E.armiesAt(g, cap.x, cap.y).some((a) => a.owner === r) && near(g, r, cap.x, cap.y, 5)) S.emptyCap++;
      for (const c of citiesOf(g, r)) { S.cityTurns++; if (!c.building) S.idleCity++; }
      for (const a of g.armies.values()) {
        if (a.owner !== r || a.x == null) continue; const here = `${a.x},${a.y}`; const inCity = !!E.cityAt(g, a.x, a.y);
        if (!inCity && !a.afloat && !a.fortified) { S.fieldTurns++; if (start.get(a.id) === here) S.stillOpen++; }
        const tr = trail.get(a.id) ?? []; tr.push(here); if (tr.length > 3) tr.shift(); trail.set(a.id, tr);
        S.armyTurns++; if (tr.length === 3 && tr[0] === tr[2] && tr[1] !== tr[0] && !inCity) S.pingPong++;
      }
    }
    E.endRound(g);
  }
  for (const id of live) { const rung = g.realms.get(id).rung; T[rung].cities += citiesOf(g, id).length - c0[id]; T[rung].runs++; }
}
E.setActionHook(null);
const per = (a, b, k = 10) => (b ? ((a / b) * k).toFixed(2) : '–');
console.log(`${snaps.length} positions x ${R} rounds; every rung plays every seat\n`);
console.log('rung      hopeless/10att  lost/10att  emptyCap/10t  idleCity/10ct  stillOpen/10  pingPong/10  cities/run');
for (const r of RUNGS) { const S = T[r];
  console.log(`${r.padEnd(9)} ${String(S.oddsKnown ? per(S.hopeless, S.oddsKnown) : 'n/a').padStart(14)}  ${per(S.lost, S.attacks).padStart(10)}  ${per(S.emptyCap, S.turns).padStart(12)}  ${per(S.idleCity, S.cityTurns).padStart(13)}  ${per(S.stillOpen, S.fieldTurns).padStart(12)}  ${per(S.pingPong, S.armyTurns).padStart(11)}  ${(S.runs ? S.cities / S.runs : 0).toFixed(2).padStart(10)}`); }
