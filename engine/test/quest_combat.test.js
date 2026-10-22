import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';

const rules = E.makeRules();
const open = { terrain: 'open' };
const mk = (type, owner = 'A', extra = {}) => E.createArmy(type, owner, extra);

function world(extra = {}) {
  const g = E.createGame({ width: 10, height: 10, seed: 5, ...extra });
  E.addRealm(g, { id: 'A', name: 'Verdant Court', gold: 100 });
  E.addRealm(g, { id: 'B', name: 'Crimson Horde', gold: 100 });
  return g;
}

test('every army type has pips; heroes gain one at level 3; classic mode makes everyone two', () => {
  for (const k of E.ARMY_KEYS) assert.ok(E.ARMIES[k].pips >= 2, k);
  assert.equal(E.maxPips(mk('drag'), rules), 6);
  assert.equal(E.maxPips(mk('hero'), rules), 4);
  assert.equal(E.maxPips(mk('hero', 'A', { level: 3 }), rules), 5);
  const classic = E.makeRules({ classic: true });
  assert.equal(E.maxPips(mk('drag'), classic), 2);
  assert.equal(E.pipsOf(mk('giant', 'A', { wounded: 3 }), rules), 1);
});

test('toughness matters: a tougher army beats a slightly stronger, frailer one more often than not', () => {
  // same strength roughly: light cavalry (2 pips, str 2 +1 open) against heavy infantry (3 pips, str 3)
  const a = [mk('lcav')], d = [mk('hinf', 'B')];
  const e = E.exactOdds({ attackers: a, defenders: d, tile: open, rules });
  const cl = E.exactOdds({ attackers: a, defenders: d, tile: open, rules: E.makeRules({ classic: true }) });
  assert.ok(e.winChance < cl.winChance, `${e.winChance} should be below the classic ${cl.winChance}`);
});

test('a counter adds one strength in that duel only, and never in classic mode or at sea', () => {
  const bc = E.battleContext(open, rules);
  const withCounter = E.frontStrengths([mk('pike')], [mk('hcav', 'B')], bc);
  const without = E.frontStrengths([mk('pike')], [mk('hinf', 'B')], bc);
  assert.equal(withCounter.a, without.a + 1);
  assert.equal(withCounter.d, E.frontStrengths([mk('hinf')], [mk('hcav', 'B')], bc).d);   // the cavalry gets nothing extra
  const cl = E.makeRules({ classic: true });
  assert.equal(E.frontStrengths([mk('pike')], [mk('hcav', 'B')], E.battleContext(open, cl)).a, E.frontStrengths([mk('pike')], [mk('hinf', 'B')], E.battleContext(open, cl)).a);
  assert.equal(E.frontStrengths([mk('pike')], [mk('hcav', 'B')], E.battleContext({ terrain: 'water' }, rules)).a, rules.navyStrength);
});

test('wounds carry out of a battle and the survivor fights the next one with fewer pips', () => {
  const rng = E.makeRng(3);
  const att = [mk('giant')], dfn = [mk('hinf', 'B'), mk('hinf', 'B')];
  let seen = 0;
  for (let i = 0; i < 200; i++) {
    const r = E.resolveBattle({ attackers: att, defenders: dfn, tile: open, rng, rules });
    for (const a of r.survivors.attackers) {
      const w = r.wounds.get(a.id);
      assert.ok(w >= 0 && w < E.maxPips(a, rules));
      if (w > 0) seen++;
    }
    assert.equal(att[0].wounded, 0, 'the army handed in is never touched');
  }
  assert.ok(seen > 20, `giants should often come out wounded (${seen})`);
});

test('after a battle in the game, survivors stay wounded; classic mode forgets the wounds', () => {
  for (const classic of [false, true]) {
    let hurt = 0, fights = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const g = world({ seed, rules: { classic } });
      for (let n = 0; n < 4; n++) E.addArmy(g, 'hinf', 'A', 1, 1);
      for (let n = 0; n < 3; n++) E.addArmy(g, 'hinf', 'B', 2, 1);
      const r = E.attack(g, E.armiesAt(g, 1, 1).map((a) => a.id), 2, 1);
      assert.equal(r.ok, true); fights++;
      hurt += [...g.armies.values()].filter((a) => a.wounded > 0).length;
    }
    if (classic) assert.equal(hurt, 0); else assert.ok(hurt >= 8, `only ${hurt} wounded survivors in ${fights} battles`);
  }
});

test('wounds heal only inside one of your own cities, two pips a turn', () => {
  const g = world();
  E.addCity(g, { id: 'c1', x: 1, y: 1, income: 0, owner: 'A', production: [] });
  const inside = E.addArmy(g, 'giant', 'A', 1, 1, { wounded: 3 });
  const outside = E.addArmy(g, 'giant', 'A', 4, 4, { wounded: 3 });
  const foe = E.addArmy(g, 'giant', 'B', 1, 1, { wounded: 3 });    // an enemy standing in A's city is not healed by A's turn
  E.beginTurn(g, 'A');
  assert.equal(inside.wounded, 1);
  assert.equal(outside.wounded, 3);
  assert.equal(foe.wounded, 3);
  E.beginTurn(g, 'A');
  assert.equal(inside.wounded, 0);
});

test('unsworn armies shake off their wounds between rounds', () => {
  const g = world();
  const n = E.addArmy(g, 'hinf', null, 5, 5, { wounded: 2 });
  E.endRound(g);
  assert.equal(n.wounded, 0);
});

test('the attacker can call off the assault after a duel; the survivors stay put, wounds and all', () => {
  const g = world();
  const ids = []; for (let i = 0; i < 4; i++) ids.push(E.addArmy(g, 'linf', 'A', 1, 1).id);
  for (let i = 0; i < 4; i++) E.addArmy(g, 'pike', 'B', 2, 1);
  let calls = 0;
  const r = E.attack(g, ids, 2, 1, { retreat: () => { calls++; return true; } });
  assert.equal(r.ok, true);
  assert.equal(r.retreated, true);
  assert.equal(calls, 1);                       // asked once, after the first duel, and the answer was yes
  assert.equal(r.attackersWon, false);
  assert.equal(r.battle.fights.length, 1);
  assert.ok([...g.armies.values()].every((a) => a.owner !== 'A' || (a.x === 1 && a.y === 1)));
  assert.ok(E.armiesAt(g, 2, 1).filter((a) => a.owner === 'B').length >= 3);    // nobody moved in
});

test('retreat is only offered while both sides still have armies', () => {
  const rng = E.makeRng(9); let calls = 0;
  const r = E.resolveBattle({ attackers: [mk('hcav')], defenders: [mk('linf', 'B')], tile: open, rng, rules, retreat: () => { calls++; return true; } });
  assert.equal(calls, 0);
  assert.equal(r.retreated, false);
});

test('exact odds see wounds: a battered army is priced lower, and the answer agrees with playing it out', () => {
  const att = [mk('giant', 'A', { wounded: 3 }), mk('hcav', 'A', { wounded: 1 })], dfn = [mk('pike', 'B'), mk('hinf', 'B', { wounded: 1 })];
  const args = { attackers: E.defaultOrder(att, rules), defenders: E.defaultOrder(dfn, rules), tile: open, cityBonus: 1, rules };
  const fresh = E.exactOdds({ ...args, attackers: E.defaultOrder([mk('giant'), mk('hcav')], rules) });
  const hurt = E.exactOdds(args);
  assert.ok(hurt.winChance < fresh.winChance);
  const mc = E.estimateOdds({ ...args, trials: 30000, seed: 4 });
  assert.ok(Math.abs(hurt.winChance - mc.winChance) < 0.015, `${hurt.winChance} vs ${mc.winChance}`);
  assert.ok(Math.abs(hurt.attackerLosses - mc.attackerLosses) < 0.08);
});

test('exact odds agree with playing the battle out across random wounded, mixed stacks (counters included)', () => {
  const types = E.ARMY_KEYS.filter((t) => E.isBuildableType(t) || E.isSpecialType(t));
  let seed = 77; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let c = 0; c < 16; c++) {
    const mkSide = (owner, n) => Array.from({ length: n }, () => { const t = types[Math.floor(rnd() * types.length)];
      const a = E.createArmy(t, owner); a.wounded = rnd() < 0.5 ? Math.floor(rnd() * (E.maxPips(a, rules) - 1)) : 0; return a; });
    const A = mkSide('A', 1 + Math.floor(rnd() * 6)), D = mkSide('B', 1 + Math.floor(rnd() * 6));
    const args = { attackers: E.defaultOrder(A, rules), defenders: E.defaultOrder(D, rules), tile: { terrain: c % 3 === 0 ? 'hills' : 'open' }, cityBonus: c % 3, rules };
    const ex = E.exactOdds(args), mc = E.estimateOdds({ ...args, trials: 20000, seed: c + 3 });
    assert.ok(Math.abs(ex.winChance - mc.winChance) < 0.02, `case ${c}: exact ${ex.winChance} vs simulated ${mc.winChance}`);
    assert.ok(Math.abs(ex.attackerLosses - mc.attackerLosses) < 0.12, `case ${c}: attacker losses`);
  }
});

test('classic mode reproduces the the 90s original duel table', () => {
  const cl = E.makeRules({ classic: true });
  const duel = (sa, sd) => { const q = sa * (20 - sd) / (sa * (20 - sd) + sd * (20 - sa)); return q * q * (3 - 2 * q); };
  const e = E.exactOdds({ attackers: [mk('hinf')], defenders: [mk('hinf', 'B')], tile: open, rules: cl });
  assert.ok(Math.abs(e.winChance - duel(3, 3)) < 1e-12);
});

// ---- hero perks ---------------------------------------------------------------------------------------------------
const hero = (extra = {}) => mk('hero', 'A', extra);
const bonus = (att, dfn, tile = open, duel = 0) => E.frontStrengths(att, dfn, E.battleContext(tile, rules), { duel });

test('a level-up earns a perk point; classic mode earns none', () => {
  const h = hero();
  assert.equal(E.grantXp(h, 15, rules), 1);
  assert.equal(h.perkPoints, 1);
  const c = hero();
  E.grantXp(c, 15, E.makeRules({ classic: true }));
  assert.equal(c.perkPoints, 0);
});

test('the shortlist is three different perks, remembered, and the pick uses up the point', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 1, 1, { perkPoints: 2 });
  const o1 = E.offerPerks(g, h.id); assert.equal(o1.offer.length, 3); assert.equal(new Set(o1.offer).size, 3);
  assert.deepEqual(E.offerPerks(g, h.id).offer, o1.offer);
  assert.equal(E.choosePerk(g, h.id, 'not-a-perk').ok, false);
  assert.equal(E.choosePerk(g, h.id, o1.offer[0]).ok, true);
  assert.equal(h.perkPoints, 1); assert.deepEqual(h.perks, [o1.offer[0]]);
  const o2 = E.offerPerks(g, h.id); assert.ok(!o2.offer.includes(o1.offer[0]));
  E.aiChoosePerk(g, h.id);
  assert.equal(h.perkPoints, 0); assert.equal(h.perks.length, 2);
  assert.equal(E.offerPerks(g, h.id).ok, false);
});

test('heroes are dealt different temperaments, and a temperament leans the shortlist', () => {
  const g = world(); const seen = new Set(); let favoured = 0, total = 0;
  for (let i = 0; i < 60; i++) {
    const h = E.addArmy(g, 'hero', 'A', 1, 1, { perkPoints: 1 }); const o = E.offerPerks(g, h.id).offer;
    seen.add(h.temperament); const f = E.TEMPERAMENTS[h.temperament].favours; o.forEach((k) => { total++; if (f.includes(k)) favoured++; });
  }
  assert.equal(seen.size, 4);
  assert.ok(favoured / total > 0.45, `favoured share ${favoured / total}`);   // a third of the pool is favoured, weighted 3 to 1
  assert.ok(!E.offerPerks(g, [...g.armies.values()][0].id).offer?.includes('scout'));     // Scout waits for fog of war
});

test('Rally, Fortifier and Charge each add one to the stack bonus, but only for the first few duels of their situation', () => {
  const base = bonus([mk('hinf'), hero()], [mk('hinf', 'B')]);
  const att = (perk, duel) => bonus([mk('hinf'), hero({ perks: [perk] })], [mk('hinf', 'B')], open, duel).bonusA.total;
  assert.equal(att('rally', 0), base.bonusA.total + 1); assert.equal(att('rally', 1), base.bonusA.total + 1); assert.equal(att('rally', 2), base.bonusA.total);
  assert.equal(att('charge', 0), base.bonusA.total + 1); assert.equal(att('charge', 2), base.bonusA.total + 1); assert.equal(att('charge', 3), base.bonusA.total);
  // fortifier helps the defending stack and not an attacking one
  const def = (perk, duel) => bonus([mk('hinf')], [mk('hinf', 'B'), mk('hero', 'B', { perks: perk ? [perk] : [] })], open, duel).bonusD.total;
  assert.equal(def('fortifier', 0), def(null, 0) + 1); assert.equal(def('fortifier', 3), def(null, 3));
  assert.equal(def('rally', 0), def(null, 0) + 1);       // Rally works in either role
  assert.equal(att('fortifier', 0), base.bonusA.total);
  assert.equal(def('charge', 0), def(null, 0));
});

test('Banner-bearer, Hardened and Pathfinder change the hero himself', () => {
  assert.equal(E.heroStrength(hero({ perks: ['banner'] }), rules), E.heroStrength(hero(), rules) + 1);
  // the extra strength is his own: it does not lift the command bonus he gives the stack
  const lv = (perks) => hero({ level: 3, perks }); assert.equal(bonus([mk('hinf'), lv(['banner'])], [mk('hinf', 'B')]).bonusA.hero, bonus([mk('hinf'), lv([])], [mk('hinf', 'B')]).bonusA.hero);
  assert.equal(E.maxPips(hero({ perks: ['tough'] }), rules), E.maxPips(hero(), rules) + 1);
  assert.equal(E.heroMove(hero({ perks: ['pathfinder'] }), rules), E.heroMove(hero(), rules) + rules.pathfinderMove);
});

test('a Tactician cancels the counter that would be used against his stack', () => {
  const stack = (perks) => [mk('hcav', 'B'), mk('hero', 'B', { perks })];
  // the pike faces the heavy cavalry, which it counters, unless the cavalry's stack has a Tactician
  assert.equal(bonus([mk('pike')], stack([])).a, bonus([mk('pike')], stack(['tactician'])).a + 1);
  // and the front armies must actually be pike against cavalry for the test to mean anything
  assert.equal(bonus([mk('hinf')], stack([])).a, bonus([mk('hinf')], stack(['tactician'])).a);
  // and his own stack's counters hit one harder
  const own = (perks) => bonus([mk('pike'), mk('hero', 'A', { perks })], [mk('hcav', 'B')]).a;
  assert.equal(own(['tactician']), own([]) + rules.tacticianCounter);
});

test('a Field Medic heals his stack a pip a turn outside a city', () => {
  const g = world();
  const h = E.addArmy(g, 'hero', 'A', 4, 4, { perks: ['field_medic'], wounded: 2 });
  const s = E.addArmy(g, 'giant', 'A', 4, 4, { wounded: 3 });
  const far = E.addArmy(g, 'giant', 'A', 7, 7, { wounded: 3 });
  E.beginTurn(g, 'A');
  assert.equal(h.wounded, 1); assert.equal(s.wounded, 2); assert.equal(far.wounded, 3);
});

test('exact odds still match the dice with perks in play', () => {
  const att = [mk('hinf'), mk('pike'), hero({ perks: ['charge', 'rally'], level: 3 })];
  const dfn = [mk('hcav', 'B'), mk('elf', 'B'), mk('hero', 'B', { perks: ['fortifier', 'tactician'] })];
  const args = { attackers: E.defaultOrder(att, rules), defenders: E.defaultOrder(dfn, rules), tile: open, cityBonus: 1, rules };
  const ex = E.exactOdds(args), mc = E.estimateOdds({ ...args, trials: 40000, seed: 21 });
  assert.ok(Math.abs(ex.winChance - mc.winChance) < 0.015, `${ex.winChance} vs ${mc.winChance}`);
});

// ---- defenders falling back ------------------------------------------------------------------------------------------
test('defenders in the open may fall back after a duel: they leave wounded, the attackers hold the field', () => {
  const g = world();
  const ids = []; for (let i = 0; i < 4; i++) ids.push(E.addArmy(g, 'giant', 'A', 1, 1).id);
  for (let i = 0; i < 3; i++) E.addArmy(g, 'linf', 'B', 2, 1);
  let calls = 0;
  const r = E.attack(g, ids, 2, 1, { fallBack: () => { calls++; return true; } });
  assert.equal(r.ok, true); assert.equal(r.fled, true); assert.equal(r.attackersWon, true); assert.equal(calls, 1);
  assert.ok(r.fledTo && !(r.fledTo.x === 1 && r.fledTo.y === 1), 'they do not run through the attackers');
  const left = [...g.armies.values()].filter((a) => a.owner === 'B');
  assert.equal(left.length, 2);                                        // one died in the first duel
  assert.ok(left.every((a) => a.x === r.fledTo.x && a.y === r.fledTo.y && a.mp === 0));
  assert.ok([...g.armies.values()].filter((a) => a.owner === 'A').every((a) => a.x === 2 && a.y === 1));    // attackers moved in
});

test('city defenders never fall back, and nothing is offered when there is nowhere to go', () => {
  const g = world();
  E.addCity(g, { id: 'c2', x: 2, y: 1, owner: 'B', production: [] });
  const ids = []; for (let i = 0; i < 4; i++) ids.push(E.addArmy(g, 'giant', 'A', 1, 1).id);
  E.addArmy(g, 'linf', 'B', 2, 1); E.addArmy(g, 'linf', 'B', 2, 1);
  let calls = 0; E.attack(g, ids, 2, 1, { fallBack: () => { calls++; return true; } });
  assert.equal(calls, 0);
  // boxed in: every neighbour holds an enemy army
  const g2 = world();
  const a2 = [E.addArmy(g2, 'giant', 'A', 1, 1).id, E.addArmy(g2, 'giant', 'A', 1, 1).id];
  E.addArmy(g2, 'linf', 'B', 5, 5); E.addArmy(g2, 'linf', 'B', 5, 5);
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) E.addArmy(g2, 'linf', 'A', 5 + dx, 5 + dy);
  a2.forEach((id) => { const a = g2.armies.get(id); a.x = 4; a.y = 5; });
  calls = 0;
  const t = E.attack(g2, a2, 5, 5, { fallBack: () => { calls++; return true; } });
  assert.equal(calls, 0, 'no fall-back square, so the question is never asked');
});

test('the computer holds when it is winning and gives ground when it is not; humans and the Unsworn are never asked', () => {
  const g = world();
  E.addRealm(g, { id: 'H', human: true });
  const fall = E.aiFallBack(g, 'B', 5, 5);
  assert.equal(typeof fall, 'function');
  assert.equal(E.aiFallBack(g, 'H', 5, 5), null);
  assert.equal(E.aiFallBack(g, null, 5, 5), null);
  const strong = [mk('linf', 'A')], weak = [mk('giant', 'B')];
  assert.equal(fall({ attackers: strong, defenders: weak }), false);                       // a giant against a spearman: hold
  assert.equal(fall({ attackers: [mk('giant', 'A'), mk('giant', 'A'), mk('giant', 'A')], defenders: [mk('linf', 'B', { wounded: 0 })] }), true);   // hopeless: go
});

// ---- veterans ---------------------------------------------------------------------------------------------------------
test('ranks: duels won earn Seasoned (+1 pip) then Veteran (+1 strength); heroes and classic mode earn none', () => {
  const [s, v] = rules.veteranDuels;
  const a = mk('hinf'); assert.equal(E.rankOf(a, rules), 0);
  a.duelsWon = s; assert.equal(E.rankOf(a, rules), 1); assert.equal(E.maxPips(a, rules), E.ARMIES.hinf.pips + 1); assert.equal(E.baseStrength(a, rules), E.ARMIES.hinf.str);
  a.duelsWon = v; assert.equal(E.rankOf(a, rules), 2); assert.equal(E.baseStrength(a, rules), E.ARMIES.hinf.str + 1);
  assert.equal(E.rankOf(hero({ duelsWon: 99 }), rules), 0);
  assert.equal(E.rankOf(a, E.makeRules({ classic: true })), 0);
  assert.equal(E.maxPips(a, E.makeRules({ classic: true })), 2);
});
test('winners of a battle record the duels they won, and a veteran really is stronger in the odds', () => {
  const g = world();
  for (let n = 0; n < 4; n++) E.addArmy(g, 'giant', 'A', 1, 1);
  for (let n = 0; n < 3; n++) E.addArmy(g, 'linf', 'B', 2, 1);
  const r = E.attack(g, E.armiesAt(g, 1, 1).map((a) => a.id), 2, 1);
  assert.equal(r.ok, true);
  const total = [...g.armies.values()].reduce((s, a) => s + (a.duelsWon || 0), 0);
  assert.ok(total >= 1, 'somebody won a duel and it was written down');
  const fresh = E.exactOdds({ attackers: [mk('hinf')], defenders: [mk('hinf', 'B')], tile: open, rules });
  const vet = E.exactOdds({ attackers: [mk('hinf', 'A', { duelsWon: rules.veteranDuels[1] })], defenders: [mk('hinf', 'B')], tile: open, rules });
  assert.ok(vet.winChance > fresh.winChance + 0.15, `${vet.winChance} vs ${fresh.winChance}`);
});

// ---- hidden skill rolls ----------------------------------------------------------------------------------------------------
test('skill rolls: a fixed pool that sums to zero, humans excluded, best and worst at the ends, same seed same rolls', () => {
  const mkg = (seed) => { const g = E.createGame({ width: 6, height: 6, seed }); for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) E.addRealm(g, { id, human: id === 'a' }); return g; };
  const g = mkg(7); const sk = E.assignSkills(g);
  assert.equal(Object.keys(sk).length, 5);
  assert.equal(g.realms.get('a').skill, undefined);
  assert.ok(Math.abs(Object.values(sk).reduce((s, v) => s + v, 0)) < 1e-9);
  assert.ok(Math.max(...Object.values(sk)) > 0 && Math.min(...Object.values(sk)) < 0);
  assert.ok(Object.values(sk).every((v) => v >= -1 && v <= 1));
  assert.deepEqual(E.assignSkills(mkg(7)), sk);
  assert.notDeepEqual(E.assignSkills(mkg(8)), sk);
  assert.equal(E.skillRanking(g)[0].skill, Math.max(...Object.values(sk)));
});
test('skill moves judgement only: sharp realms reach further and waste less, loose ones misread odds and sit idle', () => {
  const base = { ...E.AI_SETTINGS, ...E.DIFFICULTY.medium };
  const sharp = E.applySkill(base, 1), loose = E.applySkill(base, -1);
  assert.ok(sharp.maxTargets > base.maxTargets && loose.maxTargets < base.maxTargets);
  assert.ok(sharp.productionMistake < base.productionMistake && loose.productionMistake > base.productionMistake);
  assert.ok(loose.oddsNoise > base.oddsNoise && loose.idle > base.idle && sharp.idle === base.idle);
  assert.equal(E.applySkill(base, 0), base);
  for (const k of ['startGold', 'income', 'gold']) assert.equal(sharp[k], base[k]);     // never money or armies
});
