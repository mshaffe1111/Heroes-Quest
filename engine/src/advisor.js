import { resolveBattle, battleContext, frontStrengths } from './combat.js';
import { dieSizeFor } from './rules.js';
import { pipsOf } from './units.js';
import { makeRng } from './rng.js';

/**
 * Combat advisor (Warlords III add-on) and battle simulator:
 * plays the battle many times and reports the attacker's chance of winning and expected losses.
 */
export function estimateOdds({ attackers, defenders, tile, cityBonus = 0, camped = false, rules, trials = 2000, seed = 12345 }) {
  const rng = makeRng(seed);
  let wins = 0, lossA = 0, lossD = 0, left = 0;
  for (let i = 0; i < trials; i++) {
    const r = resolveBattle({ attackers, defenders, tile, cityBonus, camped, rng, rules });
    if (r.winner === 'attacker') { wins++; left += r.survivors.attackers.length; }
    lossA += r.dead.attackers.length;
    lossD += r.dead.defenders.length;
  }
  return {
    trials,
    winChance: wins / trials,
    attackerLosses: lossA / trials,
    defenderLosses: lossD / trials,
    attackersLeftWhenWinning: wins ? left / wins : 0,
  };
}

/**
 * Exact odds, no dice: the same battle as resolveBattle, worked out by dynamic programming instead of being played many times.
 * A duel is a race: the attacker needs as many hits as the defender has pips, the defender as many as the attacker has. Each decisive round (the
 * roll-again cases removed) goes to the attacker with probability q = sA(N-sD) / (sA(N-sD) + sD(N-sA)), where N is the die size. Strengths depend only
 * on who is still standing, which is fixed by how far down each fight order the battle has got, so the whole battle is a small grid of states
 * (attackers beaten, defenders beaten, and the pips left on the one front army that is carrying a wound). Armies come in with the wounds they carry
 * (army.wounded), so a battered stack is priced honestly. Wounds carry into the next duel of the same battle when rules.damageCarriesOver is on.
 * Same answer every call, thousands of times faster than playing the battle out, and exact where estimateOdds only converges.
 * estimateOdds stays as the independent check. The result also reports how many pips the attackers expect to lose and whether a retreat would
 * ever be needed is left to the caller: call this again on the armies as they stand after any duel.
 */
export function exactOdds({ attackers, defenders, tile, cityBonus = 0, camped = false, rules }) {
  const bc = battleContext(tile, rules, { cityBonus, camped });
  const N = dieSizeFor(rules); const carry = !!rules.damageCarriesOver;
  const nA = attackers.length, nD = defenders.length;
  if (!nD) return { exact: true, winChance: 1, attackerLosses: 0, defenderLosses: 0, attackersLeftWhenWinning: nA, pipsLost: 0 };
  if (!nA) return { exact: true, winChance: 0, attackerLosses: 0, defenderLosses: 0, attackersLeftWhenWinning: 0, pipsLost: 0 };
  const hpA0 = attackers.map((a) => pipsOf(a, rules)), hpD0 = defenders.map((a) => pipsOf(a, rules));
  const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  // attWin[k]: the attacker wins having taken k hits (pips left hpA - k); defWin[k]: the defender wins having taken k hits
  function fight(sA, sD, hpA, hpD) {
    const a = sA * (N - sD), b = sD * (N - sA); const q = a / (a + b);     // q: the next decisive round hits the defender
    const attWin = [];
    for (let k = 0; k < hpA; k++) attWin.push(binom(hpD - 1 + k, k) * Math.pow(q, hpD) * Math.pow(1 - q, k));
    const defWin = [];
    for (let k = 0; k < hpD; k++) defWin.push(binom(hpA - 1 + k, k) * Math.pow(1 - q, hpA) * Math.pow(q, k));
    return { attWin, defWin };
  }
  const strengths = new Map();
  const front = (i, j) => { const key = i * 1000 + j; let s = strengths.get(key); if (!s) { s = frontStrengths(attackers.slice(i), defenders.slice(j), bc, { duel: i + j }); strengths.set(key, s); } return s; };
  // mass[i][j]: map from "a<pips left>" (the attacker front is carrying a wound), "d<pips left>" (the defender front is) or "0" (both fresh) -> probability
  const mass = Array.from({ length: nA + 1 }, () => Array.from({ length: nD + 1 }, () => new Map()));
  const addMass = (i, j, side, left, p) => { if (p <= 0) return; const key = left ? side + left : '0'; const m = mass[i][j]; m.set(key, (m.get(key) ?? 0) + p); };
  addMass(0, 0, 'a', 0, 1);
  let win = 0, lossA = 0, lossD = 0, left = 0, pips = 0;
  for (let i = 0; i < nA; i++) for (let j = 0; j < nD; j++) {
    for (const [key, p] of mass[i][j]) {
      const hA = key[0] === 'a' ? +key.slice(1) : hpA0[i], hD = key[0] === 'd' ? +key.slice(1) : hpD0[j];
      const s = front(i, j); const { attWin, defWin } = fight(s.a, s.d, hA, hD);
      for (let k = 0; k < attWin.length; k++) {     // the attacker wins: the defender dies, the attacker carries its wounds on
        const pr = p * attWin[k]; lossD += pr; pips += pr * k;
        if (j + 1 === nD) { win += pr; left += pr * (nA - i); } else addMass(i, j + 1, 'a', carry ? hA - k : 0, pr);
      }
      for (let k = 0; k < defWin.length; k++) {     // the defender wins: the attacker dies, the defender carries its wounds on
        const pr = p * defWin[k]; lossA += pr; pips += pr * hA;
        if (i + 1 < nA) addMass(i + 1, j, 'd', carry ? hD - k : 0, pr);
      }
    }
  }
  return { exact: true, winChance: win, attackerLosses: lossA, defenderLosses: lossD, attackersLeftWhenWinning: win ? left / win : 0, pipsLost: pips };
}
