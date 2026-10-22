import test from 'node:test';
import assert from 'node:assert/strict';
import { frontStrengths, battleContext, resolveBattle, scriptedRng, makeRng, makeRules, createArmy } from '../src/index.js';
import * as E from '../src/index.js';
import { rules, mk, open, road, woods, hills, city, sea } from './helpers.js';

const str = (att, dfn, tile, opts = {}) => {
  const bc = battleContext(tile, rules, opts);
  return frontStrengths(att, dfn, bc);
};

test('individual terrain bonuses: heavy cavalry +2 in open and on roads, nothing in woods', () => {
  assert.equal(str([mk('hcav')], [mk('linf')], open).a, 6);
  assert.equal(str([mk('hcav')], [mk('linf')], road).a, 6);
  assert.equal(str([mk('hcav')], [mk('linf')], woods).a, 4);
});
test('a road through woods counts as woods, so elves keep their bonus and cavalry loses theirs', () => {
  const roadInWoods = { terrain: 'woods', road: true };
  assert.equal(str([mk('elf')], [mk('linf')], roadInWoods).a, 4);
  assert.equal(str([mk('hcav')], [mk('linf')], roadInWoods).a, 4);
});
test('hero gives the stack its natural command bonus (+1 at strength 5-6, +2 at 7-8, +3 at 9)', () => {
  const hero = mk('hero');
  assert.equal(str([mk('linf'), hero], [mk('hinf')], open).bonusA.total, 1);
  hero.level = 3;   // strength 7
  assert.equal(str([mk('linf'), hero], [mk('hinf')], open).bonusA.total, 2);
  hero.level = 4; hero.items.push({ strength: 1 });   // strength 9
  assert.equal(str([mk('linf'), hero], [mk('hinf')], open).bonusA.total, 3);
});
test('bonus applies to every army in the stack, including the bonus giver', () => {
  const s = str([mk('linf'), mk('peg')], [mk('hinf')], open);
  assert.equal(s.bonusA.total, 1);
  const s2 = str([mk('peg')], [mk('hinf')], open);
  assert.equal(s2.a, 6);
});
test('only the best single non-hero stack bonus counts', () => {
  assert.equal(str([mk('peg'), mk('drag')], [mk('hinf')], open).bonusA.nonHero, 2);
});
test('wolf riders give +1 to the stack only in hills', () => {
  assert.equal(str([mk('wolf'), mk('linf')], [mk('hinf')], hills).bonusA.total, 1);
  assert.equal(str([mk('wolf'), mk('linf')], [mk('hinf')], open).bonusA.total, 0);
});
test('total stack bonus is capped at +5 and a strength never exceeds 14', () => {
  const hero = mk('hero', { level: 4, items: [{ command: 3 }] });   // 2 + 3 = 5 from the hero alone
  const s = str([mk('drag'), hero], [mk('linf')], open);
  assert.equal(s.bonusA.total, 5);
  assert.equal(s.a, 14);                     // dragon: 9 + 5
});
test('base strength with terrain bonus and blessings never exceeds 9 before the stack bonus', () => {
  const hc = mk('hcav', { blessings: 4 });    // 4 + 4 + 2 = 10 -> 9
  assert.equal(str([hc], [mk('linf')], open).a, 9);
});
test('Archon cancels hero bonuses, Devil cancels non-hero bonuses but not city bonus', () => {
  const hero = mk('hero', { owner: 'B' });
  assert.equal(str([mk('arch')], [mk('linf', { owner: 'B' }), hero], open).bonusD.total, 0);
  const s = str([mk('devil')], [mk('peg', { owner: 'B' })], city, { cityBonus: 2 });
  assert.equal(s.bonusD.nonHero, 0);
  assert.equal(s.bonusD.city, 2);
  assert.equal(s.bonusD.total, 2);
});
test('catapult cancels the city bonus and the camp bonus', () => {
  assert.equal(str([mk('cat')], [mk('hinf')], city, { cityBonus: 2 }).bonusD.total, 0);
  assert.equal(str([mk('cat')], [mk('hinf')], open, { camped: true }).bonusD.total, 0);
  assert.equal(str([mk('linf')], [mk('hinf')], open, { camped: true }).bonusD.total, 1);
});
test('city bonus only helps the defender', () => {
  const s = str([mk('hinf')], [mk('hinf', { owner: 'B' })], city, { cityBonus: 2 });
  assert.equal(s.bonusA.total, 0);
  assert.equal(s.bonusD.total, 2);
});
test('Elephants lower every enemy army by 1 after bonuses, never below 1', () => {
  assert.equal(str([mk('ele')], [mk('hinf', { owner: 'B' })], open).d, 2);
  assert.equal(str([mk('ele')], [mk('scout', { owner: 'B' })], open).d, 1);
});
test('minotaurs and spiders fight harder inside cities', () => {
  assert.equal(str([mk('linf')], [mk('mino', { owner: 'B' })], city).d, 6);
  assert.equal(str([mk('linf')], [mk('spid', { owner: 'B' })], city).d, 7);
});
test('sea battle: boat-borne armies fight at 4 with no bonuses; flyers fight normally', () => {
  const s = str([mk('hcav', { afloat: true })], [mk('ele', { owner: 'B', afloat: true })], sea);
  assert.equal(s.a, 4); assert.equal(s.d, 4);
  const f = str([mk('grif')], [mk('hcav', { owner: 'B', afloat: true })], sea);
  assert.equal(f.a, 6);
  assert.equal(f.d, 4);
});

// ---- the dice -----------------------------------------------------------------------
const classic = makeRules({ classic: true });
const play = (att, dfn, dice, tile = open, extra = {}) =>
  resolveBattle({ attackers: att, defenders: dfn, tile, rng: scriptedRng(dice), rules, ...extra });

test('a roll at or below the opponent strength loses the round; two lost rounds kill', () => {
  // linf (2) vs linf (2): attacker rolls 20 (high), defender rolls 1 (low) -> defender is hit
  const r = play([mk('linf')], [mk('linf', { owner: 'B' })], [20, 1, 20, 1]);
  assert.equal(r.winner, 'attacker');
  assert.equal(r.fights[0].rounds, 2);
});
test('both low or both high means roll again', () => {
  const r = play([mk('linf')], [mk('linf', { owner: 'B' })], [1, 1, 20, 20, 1, 20, 1, 20]);
  assert.equal(r.winner, 'defender');
  assert.equal(r.fights[0].rounds, 4);
});
test('winner stays in front and faces the next army; battle ends when one side is gone', () => {
  const att = [mk('linf'), mk('hinf')];
  const dfn = [mk('scout', { owner: 'B' }), mk('scout', { owner: 'B' })];
  const r = play(att, dfn, [20, 1, 20, 1, 20, 1, 20, 1]);
  assert.equal(r.winner, 'attacker');
  assert.equal(r.fights.length, 2);
  assert.equal(r.fights[1].attacker.id, att[0].id);
  assert.equal(r.survivors.attackers.length, 2);
  assert.equal(r.dead.defenders.length, 2);
});
test('bonuses are recalculated when a bonus-giving army dies mid-battle', () => {
  const att = [mk('peg'), mk('linf')];
  const dfn = [mk('drag', { owner: 'B' })];
  const r = play(att, dfn, [1, 20, 1, 20, 1, 20, 1, 20], open, { rules: classic });
  assert.equal(r.fights[0].stackBonus.attacker, 1);
  assert.equal(r.fights[1].stackBonus.attacker, 0);
  assert.equal(r.winner, 'defender');
});
test('battles do not change the armies handed in (the advisor relies on this)', () => {
  const att = [mk('linf'), mk('hinf')];
  const dfn = [mk('hinf', { owner: 'B' })];
  resolveBattle({ attackers: att, defenders: dfn, tile: open, rng: makeRng(7), rules });
  assert.equal(att.length, 2); assert.equal(dfn.length, 1);
});
test('same seed, same battle', () => {
  const run = () => resolveBattle({ attackers: [mk('hinf'), mk('pike')], defenders: [mk('hinf', { owner: 'B' }), mk('pike', { owner: 'B' })],
    tile: open, rng: makeRng(99), rules }).fights.map((f) => f.winner).join();
  assert.equal(run(), run());
});
test('Intense Combat uses the 24-sided die', () => {
  const seen = [];
  const rng = { int: (n) => { seen.push(n); return seen.length % 2 ? 20 : 1; } };
  resolveBattle({ attackers: [mk('linf')], defenders: [mk('linf', { owner: 'B' })], tile: open, rng, rules: makeRules({ intense: true }) });
  assert.ok(seen.length && seen.every((n) => n === 24));
});

// ---- does the maths feel like Warlords? ---------------------------------------------
const winRate = (att, dfn, tile, n = 4000, opts = {}) => {
  const rng = makeRng(2024);
  let w = 0;
  for (let i = 0; i < n; i++) if (resolveBattle({ attackers: att, defenders: dfn, tile, rng, rules, ...opts }).winner === 'attacker') w++;
  return w / n;
};
test('equal single armies are about a coin flip', () => {
  const p = winRate([mk('hinf')], [mk('hinf', { owner: 'B' })], open);
  assert.ok(p > 0.45 && p < 0.55, `got ${p}`);
});
test('quality beats quantity: a dragon usually beats eight scouts, yet a scout can still win a fight', () => {
  const eight = Array.from({ length: 8 }, () => mk('scout', { owner: 'B' }));
  const p = winRate([mk('drag')], eight, open);
  assert.ok(p > 0.5, `dragon vs 8 scouts ${p}`);
  const hopeless = winRate([mk('scout')], [mk('drag', { owner: 'B' })], open, 20000);
  assert.ok(hopeless < 0.001, `scout vs dragon ${hopeless}`);       // 2 pips against 6: toughness matters in Heroes Quest
  const fluke = winRate([mk('scout')], [mk('drag', { owner: 'B' })], open, 20000, { rules: classic });
  assert.ok(fluke > 0 && fluke < 0.02, `classic scout vs dragon ${fluke}`);   // plain Warlords II duels: a lucky scout can still do it
});
test('a catapult makes a walled city much easier to take', () => {
  const dfn = () => [mk('pike', { owner: 'B' }), mk('pike', { owner: 'B' }), mk('hinf', { owner: 'B' })];
  const a = () => [mk('hcav'), mk('hcav'), mk('hinf'), mk('hinf')];
  const without = winRate(a(), dfn(), city, 3000, { cityBonus: 2 });
  const withCat = winRate([...a(), mk('cat')], dfn(), city, 3000, { cityBonus: 2 });
  assert.ok(withCat > without + 0.1, `without ${without}, with ${withCat}`);
});

test('a hero of strength 3 or less gives no command bonus', async () => {
  const { naturalCommand } = await import('../src/index.js');
  assert.equal(naturalCommand(3), 0);
  assert.equal(naturalCommand(4), 1);
});
test('special armies from ruins cost no upkeep', async () => {
  const { armyUpkeep } = await import('../src/index.js');
  assert.equal(armyUpkeep(mk('demon'), rules), 0);
  assert.equal(armyUpkeep(mk('hinf'), rules), 2);
});

// ---- exact odds (the advisor and the computer players use these) ---------------------------------------------------------
test('exact odds agree with playing the battle out, wounds carried, heroes, walls and intense combat included', () => {
  const rulesList = [E.makeRules(), E.makeRules({ intense: true }), E.makeRules({ damageCarriesOver: false })];
  const types = Object.keys(E.ARMIES).filter((t) => E.isBuildableType(t));
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let c = 0; c < 18; c++) {
    const rules = rulesList[c % 3]; const g = E.createGame({ width: 6, height: 6, seed: c, rules });
    const mk = (owner, x, n) => Array.from({ length: n }, () => E.addArmy(g, types[Math.floor(rnd() * types.length)], owner, x, 0));
    const A = mk('A', 0, 1 + Math.floor(rnd() * 8)), D = mk('B', 1, 1 + Math.floor(rnd() * 8));
    if (c % 2) A.push(E.addArmy(g, 'hero', 'A', 0, 0)); if (c % 3 === 0) D.push(E.addArmy(g, 'hero', 'B', 1, 0));
    const args = { attackers: E.defaultOrder(A, rules), defenders: E.defaultOrder(D, rules), tile: { terrain: c % 4 === 0 ? 'woods' : 'open' }, cityBonus: c % 3, rules };
    const ex = E.exactOdds(args), mc = E.estimateOdds({ ...args, trials: 20000, seed: c + 5 });
    assert.ok(Math.abs(ex.winChance - mc.winChance) < 0.02, `case ${c}: exact ${ex.winChance} vs simulated ${mc.winChance}`);
    assert.ok(Math.abs(ex.attackerLosses - mc.attackerLosses) < 0.12, `case ${c}: attacker losses ${ex.attackerLosses} vs ${mc.attackerLosses}`);
    assert.ok(Math.abs(ex.defenderLosses - mc.defenderLosses) < 0.12, `case ${c}: defender losses ${ex.defenderLosses} vs ${mc.defenderLosses}`);
  }
});
test('exact odds: a one-on-one fight matches the closed form, and an empty side is decided at once', () => {
  const rules = E.makeRules(); const g = E.createGame({ width: 4, height: 4, rules });
  const a = E.addArmy(g, 'hinf', 'A', 0, 0), d = E.addArmy(g, 'hinf', 'B', 1, 0);
  const s = E.frontStrengths([a], [d], E.battleContext({ terrain: 'open' }, rules)); const N = rules.dieSize;
  const q = s.a * (N - s.d) / (s.a * (N - s.d) + s.d * (N - s.a));
  const e = E.exactOdds({ attackers: [a], defenders: [d], tile: { terrain: 'open' }, rules });
  assert.ok(Math.abs(e.winChance - q * q * (3 - 2 * q)) < 1e-12);
  assert.equal(E.exactOdds({ attackers: [a], defenders: [], tile: { terrain: 'open' }, rules }).winChance, 1);
  assert.equal(E.exactOdds({ attackers: [], defenders: [d], tile: { terrain: 'open' }, rules }).winChance, 0);
});
