// Build B rules decided 2026-10-22: city garrison 8, healing 1, debt pauses production, Unsworn default Strong, hero offers that are not wasted,
// heroes from ruins and quests, hero levels to 9, signature armies, rival count. (Capture choices are tested in game.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

function world(extra = {}) {
  const g = E.createGame({ width: 12, height: 8, seed: 11, ...extra });
  E.addRealm(g, { id: 'A', name: 'Verdant Court', gold: 1000 }); E.addRealm(g, { id: 'B', name: 'Crimson Horde', gold: 1000 });
  E.addCity(g, { id: 'ca', x: 0, y: 0, owner: 'A', income: 20, production: ['linf'] });
  E.addCity(g, { id: 'cb', x: 11, y: 7, owner: 'B', income: 20, production: ['linf'] });
  return g;
}
const rngFrom = (g, ...vals) => { let i = 0; g.rng = { next: () => (i < vals.length ? vals[i++] : 0.5), int: () => 1, pick: (a) => a[0], used: () => i }; return g; };
const fill = (g, type, owner, x, y, n) => Array.from({ length: n }, () => E.addArmy(g, type, owner, x, y));

// ---- 1. a city holds 8 -----------------------------------------------------------------------------------------------------
test('a city holds at most 8 armies: a ninth cannot walk in', () => {
  const g = world();
  assert.equal(g.rules.cityGarrisonLimit, 8); assert.equal(g.rules.cityGarrisonLimit, g.rules.stackLimit);
  fill(g, 'linf', 'A', 0, 0, 8);
  const w = E.addArmy(g, 'linf', 'A', 1, 0);
  assert.equal(E.moveGroup(g, [w.id], 0, 0).reason, 'stack-limit');
  assert.equal(E.armyLimitAt(g, 0, 0), 8);
});
test('production waits when the garrison is full and carries on when there is room', () => {
  const g = world(); E.setProduction(g, 'ca', 'linf');
  const inside = fill(g, 'linf', 'A', 0, 0, 8);
  const ev = E.beginTurn(g, 'A');
  assert.ok(ev.some((e) => e.type === 'production-stalled' && e.reason === 'garrison-full'));
  assert.equal(E.armiesAt(g, 0, 0).length, 8);
  E.moveGroup(g, [inside[0].id], 1, 0);
  const ev2 = E.beginTurn(g, 'A');
  assert.ok(ev2.some((e) => e.type === 'built'));
  assert.equal(E.armiesAt(g, 0, 0).length, 8);
});
test('a vectored army waits on the road while the target city is full, then arrives', () => {
  const g = world(); E.addCity(g, { id: 'c2', x: 5, y: 5, owner: 'A' });
  E.setProduction(g, 'ca', 'linf'); E.setVector(g, 'ca', 'c2');
  const there = fill(g, 'linf', 'A', 5, 5, 8);
  for (let t = 1; t <= 4; t++) { g.turn = t; E.beginTurn(g, 'A'); g.cities.get('ca').building = null; }     // one army built on turn 1, due on turn 3
  assert.equal(E.armiesAt(g, 5, 5).length, 8); assert.equal(g.transit.length, 1);
  E.moveGroup(g, [there[0].id], 6, 5);
  g.turn = 5; const ev = E.beginTurn(g, 'A');
  assert.ok(ev.some((e) => e.type === 'vector-arrived')); assert.equal(E.armiesAt(g, 5, 5).length, 8); assert.equal(g.transit.length, 0);
});
test('hiring a hero into a full city is refused; capture of a city moves at most 8 in', () => {
  const g = world(); fill(g, 'linf', 'A', 0, 0, 8);
  assert.equal(E.hireHero(g, 'A', 'ca', 100).reason, 'no-room');
  // capture: an attacking group is at most 8, the defenders are gone, so the city ends with at most 8
  const g2 = world(); const att = fill(g2, 'ele', 'A', 10, 7, 8);
  g2.rng = E.scriptedRng([]);
  const r = E.attack(g2, att.map((a) => a.id), 11, 7); assert.equal(r.captureNeeded, true);
  E.resolveCapture(g2, 'occupy'); assert.equal(E.armiesAt(g2, 11, 7).length, 8);
});
test('the computer does not try to squeeze a ninth army into a full city: a returning group goes to a city with room', () => {
  const solo = () => { const g = E.createGame({ width: 12, height: 8, seed: 11 }); E.addRealm(g, { id: 'A', gold: 1000 }); E.addRealm(g, { id: 'B', gold: 1000 });
    E.addCity(g, { id: 'ca', x: 0, y: 0, owner: 'A', production: ['linf'] }); return g; };     // no city to attack, so no attack groups muddy the picture
  const g = solo(); E.addCity(g, { id: 'c2', x: 6, y: 0, owner: 'A', production: ['linf'] });
  fill(g, 'linf', 'A', 0, 0, 8);
  const stray = E.addArmy(g, 'linf', 'A', 2, 0);
  E.beginTurn(g, 'A'); E.aiPlay(g, 'A');
  const ret = g.ai.A.groups.find((x) => x.ids.includes(stray.id));
  assert.ok(!ret || ret.cityId === 'c2', 'not sent to the full city');
  assert.ok(E.armiesAt(g, 0, 0).length <= 8);
  for (let t = 0; t < 6; t++) { g.turn++; E.beginTurn(g, 'A'); E.aiPlay(g, 'A'); for (const c of g.cities.values()) assert.ok(E.armiesAt(g, c.x, c.y).length <= 8); }
  assert.ok(stray.x === 6 && stray.y === 0, `the stray reached the city with room (at ${stray.x},${stray.y})`);
  // no city of ours has room: the group is dropped instead of retrying every turn
  const g2 = solo(); fill(g2, 'linf', 'A', 0, 0, 8); const s2 = E.addArmy(g2, 'linf', 'A', 3, 3);
  E.beginTurn(g2, 'A'); E.aiPlay(g2, 'A');
  assert.equal(g2.ai.A.groups.filter((x) => x.ids.includes(s2.id)).length, 0); assert.equal(E.armiesAt(g2, 0, 0).length, 8);
});

// ---- 2. healing --------------------------------------------------------------------------------------------------------------
test('healing in your own city is 1 pip a turn; Field Hospitals adds 1; a Field Medic still adds his pip', () => {
  const g = world(); assert.equal(g.rules.cityHeal, 1);
  const a = E.addArmy(g, 'giant', 'A', 0, 0, { wounded: 3 });
  E.beginTurn(g, 'A'); assert.equal(a.wounded, 2);
  const g2 = world(); g2.rules.docs.set('A', new Set(['hospitals'])); const b = E.addArmy(g2, 'giant', 'A', 0, 0, { wounded: 3 });
  E.beginTurn(g2, 'A'); assert.equal(b.wounded, 1);
  const g3 = world(); const c = E.addArmy(g3, 'giant', 'A', 0, 0, { wounded: 3 }); E.addArmy(g3, 'hero', 'A', 0, 0, { perks: ['field_medic'] });
  E.beginTurn(g3, 'A'); assert.equal(c.wounded, 1);
});

// ---- 3. out of gold ----------------------------------------------------------------------------------------------------------
test('out of gold: production pauses with reason debt, nothing deserts, upkeep is still charged; it resumes above zero', () => {
  const g = world(); const realm = g.realms.get('A');
  g.cities.get('ca').income = 0;
  E.setProduction(g, 'ca', 'linf');
  const army = fill(g, 'hcav', 'A', 3, 3, 4);           // upkeep 4 x 4 = 16 a turn
  realm.gold = 5;
  const ev = E.beginTurn(g, 'A');
  assert.equal(realm.gold, 5 - 16); assert.equal(realm.deficit, true);
  const st = ev.find((e) => e.type === 'production-stalled'); assert.ok(st); assert.equal(st.reason, 'debt'); assert.equal(st.city, 'ca');
  assert.equal(g.cities.get('ca').building.progress, 0);                 // paused: no progress made
  assert.equal(E.armiesAt(g, 0, 0).length, 0);
  E.beginTurn(g, 'A'); assert.equal(realm.gold, 5 - 32);                  // upkeep still charged
  assert.ok(army.every((a) => g.armies.has(a.id)));                      // nobody deserts
  realm.gold = 100;
  const ev3 = E.beginTurn(g, 'A');
  assert.ok(ev3.some((e) => e.type === 'built'), 'builds again once gold is above zero after upkeep');
});

// ---- 4. the Unsworn ---------------------------------------------------------------------------------------------------------
test('the Unsworn default to Strong; Normal and Active can still be chosen; anything else is refused', () => {
  const map = generateMap({ shape: 'continent', seed: 3, width: 110, height: 72, cities: 28, realms: 6 });
  const weakest = (g, c) => c.production.slice().sort((a, b) => E.ARMIES[a].str - E.ARMIES[b].str || E.ARMIES[a].cost - E.ARMIES[b].cost)[0];
  const strongPicks = (g) => [...g.cities.values()].filter((c) => !c.owner).filter((c) => E.armiesAt(g, c.x, c.y)[0].type !== weakest(g, c)).length;
  const def = E.mapToGame(map).game, normal = E.mapToGame(map, { neutrals: 'normal' }).game, strong = E.mapToGame(map, { neutrals: 'strong' }).game;
  assert.equal(strongPicks(def), strongPicks(strong));
  assert.ok(strongPicks(def) > strongPicks(normal));
  const active = E.mapToGame(map, { neutrals: 'active' }).game; assert.ok([...active.cities.values()].some((c) => c.active));
  assert.ok(![...def.cities.values()].some((c) => c.active));
  assert.throws(() => E.mapToGame(map, { neutrals: 'fierce' }));
});

// ---- 5. hero offers, heroes from ruins and quests ---------------------------------------------------------------------------
test('hero offers: a turn the realm cannot pay, is at its limit, or has no room does not use up the roll', () => {
  const g = world(); g.realms.get('A').gold = 1; E.addArmy(g, 'hero', 'A', 0, 0); rngFrom(g, 0.0);
  assert.equal(E.beginTurn(g, 'A').some((e) => e.type === 'hero-offer'), false); assert.equal(g.rng.used(), 0, 'no roll when he cannot be paid');
  const g2 = world(); fill(g2, 'linf', 'A', 0, 0, 7); E.addArmy(g2, 'hero', 'A', 0, 0); rngFrom(g2, 0.0);     // the only city is full
  assert.equal(E.beginTurn(g2, 'A').some((e) => e.type === 'hero-offer'), false); assert.equal(g2.rng.used(), 0, 'no roll with no room');
  const g3 = world(); for (let i = 0; i < 5; i++) E.addArmy(g3, 'hero', 'A', 2, 2); rngFrom(g3, 0.0);        // at the limit (5)
  assert.equal(E.beginTurn(g3, 'A').some((e) => e.type === 'hero-offer'), false); assert.equal(g3.rng.used(), 0, 'no roll at the hero limit');
  const g4 = world(); E.addArmy(g4, 'hero', 'A', 0, 0); rngFrom(g4, 0.0, 0.0, 0.0);
  const offer = E.beginTurn(g4, 'A').find((e) => e.type === 'hero-offer'); assert.ok(offer); assert.equal(offer.cityId, 'ca');
});
test('a hero can come from a ruin (rare, only under the hero limit)', () => {
  const ruin = (heroes) => {
    const g = world(); E.addSite(g, { x: 5, y: 5, kind: 'ruin', guardian: 'wiz' }); const h = E.addArmy(g, 'hero', 'A', 5, 5);
    for (let i = 1; i < heroes; i++) E.addArmy(g, 'hero', 'A', 2, 2);
    rngFrom(g, 0.0, 0.99, 0.0); return { g, r: E.exploreRuin(g, [h.id]) };
  };
  const { g, r } = ruin(1);
  assert.equal(r.outcome, 'hero'); const nh = g.armies.get(r.army); assert.ok(E.isHero(nh)); assert.equal(nh.owner, 'A'); assert.equal(nh.x, 5);
  const w = g.rules.ruinRewardWeights; const share = w.hero / Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(share > 0.05 && share < 0.12, `hero share of ruin rewards ${share}`);
  const full = ruin(5); assert.notEqual(full.r.outcome, 'hero');          // at the limit: the draw is over the other rewards
  assert.equal([...full.g.armies.values()].filter((a) => E.isHero(a)).length, 5);
});
test('a hero can be a quest reward; at the hero limit he is paid as gold instead', () => {
  const run = (extraHeroes) => {
    const g = world(); const h = E.addArmy(g, 'hero', 'A', 10, 7); const e = E.addArmy(g, 'ele', 'A', 10, 7);
    for (let i = 0; i < extraHeroes; i++) E.addArmy(g, 'hero', 'A', 2, 2);
    g.realms.get('A').quest = { kind: 'take-city', heroId: h.id, cityId: 'cb', text: 'Take cb', reward: { kind: 'hero' }, progress: 0 };
    E.attack(g, [h.id, e.id], 11, 7); const gold0 = g.realms.get('A').gold; E.resolveCapture(g, 'occupy');
    return { g, gold0, heroes: [...g.armies.values()].filter((a) => a.owner === 'A' && E.isHero(a)).length };
  };
  const ok = run(0); assert.equal(ok.heroes, 2); assert.ok(ok.g.events.some((e) => e.type === 'hero-joined'));
  const capped = run(5); assert.equal(capped.heroes, 6);      // taking cb gives A both cities, so its limit is 6 (more than half the cities) assert.ok(capped.g.realms.get('A').gold > capped.gold0);
  // the reward is drawn only while the realm is under its limit
  const g = world(); E.addSite(g, { x: 4, y: 4, kind: 'temple' }); const h = E.addArmy(g, 'hero', 'A', 4, 4);
  rngFrom(g, 0.0, 0.0, 0.0, 0.5, 0.0); const q = E.visitTemple(g, [h.id]).quest;     // offered, take-city, city cb, reward roll 0.5 (not gold), hero roll 0.0 assert.ok(q); assert.equal(q.reward.kind, 'hero');
});

// ---- 6. hero levels to 9 -----------------------------------------------------------------------------------------------------
test('hero pips: 4, one more at level 3 and one more at level 6', () => {
  const r = E.makeRules(); const h = (level) => E.createArmy('hero', 'A', { level });
  assert.deepEqual([1, 2, 3, 5, 6, 9].map((l) => E.maxPips(h(l), r)), [4, 4, 5, 5, 6, 6]);
});
test('a hero who has every perk is offered none, and his spare point is dropped', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 1, 1, { perkPoints: 9 });
  let picks = 0; while (E.aiChoosePerk(g, h.id).ok) picks++;
  assert.equal(picks, E.OFFERABLE.length); assert.equal(h.perks.length, E.OFFERABLE.length); assert.equal(new Set(h.perks).size, h.perks.length);
  assert.equal(h.perkPoints, 0); assert.equal(E.offerPerks(g, h.id).ok, false);
  assert.ok(E.OFFERABLE.length >= g.rules.heroMaxLevel - 1, 'enough perks for one choice at every level');
});
test('levels earn one perk point each, up to 8 by level 9', () => {
  const g = world(); const h = E.addArmy(g, 'hero', 'A', 1, 1);
  const thresholds = g.rules.heroXpThresholds;
  for (let l = 2; l <= 9; l++) { E.grantXp(h, thresholds[l - 1] - h.xp, g.rules); assert.equal(h.level, l); assert.equal(h.perkPoints, l - 1); }
});

// ---- 8. signature armies -----------------------------------------------------------------------------------------------------
test('every realm has its signature army; each capital starts with its hero and two of them and can build it', () => {
  assert.deepEqual(E.SIGNATURE_ARMIES, { ivory: 'pike', gold: 'hcav', ember: 'dwarf', crimson: 'orc', verdant: 'elf', azure: 'grif', tidewatch: 'lcav', ashen: 'undead' });
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 3 }));
  for (const [id, sig] of Object.entries(E.SIGNATURE_ARMIES)) {
    const cap = [...g.cities.values()].find((c) => c.owner === id && g.map.caps.includes(c.id)); assert.ok(cap, id);
    const here = E.armiesAt(g, cap.x, cap.y);
    assert.equal(here.filter(E.isHero).length, 1, id); assert.equal(here.filter((a) => a.type === sig).length, 2, id); assert.equal(here.length, 3, id);
    assert.ok(cap.production.includes(sig), `${id} capital builds ${sig}`); assert.ok(cap.production.length <= 4);
    assert.equal(E.setProduction(g, cap.id, sig).ok, true);
  }
});
test('the Ashen Legion builds Undead in its capital, and a city-built Undead pays upkeep; other realms cannot teach Undead', () => {
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 3 }));
  const cap = [...g.cities.values()].find((c) => c.owner === 'ashen' && g.map.caps.includes(c.id));
  const start = E.armiesAt(g, cap.x, cap.y).find((a) => a.type === 'undead'); assert.ok(E.armyUpkeep(start, g.rules) > 0);
  E.armiesAt(g, cap.x, cap.y).filter((a) => !E.isHero(a)).forEach((a) => g.armies.delete(a.id));
  g.realms.get('ashen').gold = 5000; E.setProduction(g, cap.id, 'undead');
  let built = null; for (let t = 0; t < 6 && !built; t++) built = E.beginTurn(g, 'ashen').find((e) => e.type === 'built');
  assert.ok(built); const u = g.armies.get(built.army); assert.equal(u.type, 'undead'); assert.ok(E.armyUpkeep(u, g.rules) > 0);
  const other = [...g.cities.values()].find((c) => c.owner === 'gold'); g.realms.get('gold').gold = 5000;
  assert.equal(E.addProductionType(g, 'gold', other.id, 'undead', other.production[0]).ok, false);
  assert.equal(E.validateProductionType('undead', 'ashen'), null); assert.ok(E.validateProductionType('undead', 'gold'));
});
test('signature perk hook exists and does nothing yet', () => {
  for (const [id, sig] of Object.entries(E.SIGNATURE_ARMIES)) assert.equal(E.signatureBuildTurnsBonus(id, sig), 0);
});

// ---- 9. rival count ----------------------------------------------------------------------------------------------------------
test('realmIds: only the listed realms exist; the first gets map capital 0; left-out capitals are ordinary Unsworn cities', () => {
  const map = generateMap({ shape: 'continent', seed: 3 });
  const all = E.mapToGame(map).game; assert.equal(all.realms.size, 8);
  const { game: g } = E.mapToGame(map, { realmIds: ['verdant', 'crimson', 'ashen'] });
  assert.deepEqual([...g.realms.keys()], ['verdant', 'crimson', 'ashen']);
  assert.equal(g.cities.get(`c${map.caps[0]}`).owner, 'verdant'); assert.equal(g.cities.get(`c${map.caps[1]}`).owner, 'crimson');
  assert.deepEqual(g.map.caps, map.caps.slice(0, 3).map((c) => `c${c}`));
  for (const ci of map.caps.slice(3)) {
    const c = g.cities.get(`c${ci}`); assert.equal(c.owner, null);
    const here = E.armiesAt(g, c.x, c.y); assert.equal(here.length, 1); assert.equal(here[0].owner, null);
    assert.ok(c.production.length <= 3, 'an ordinary city, not a 4-kind capital');
  }
  assert.ok([...g.armies.values()].every((a) => a.owner == null || g.realms.has(a.owner)));
  assert.equal([...g.cities.values()].filter((c) => c.owner).length, 3);
  // and the game plays
  for (const r of g.realms.keys()) { E.beginTurn(g, r); E.aiPlay(g, r); } E.endRound(g);
});
test('realmIds is checked: 2 to 8 distinct known realms, no more than the map has capitals', () => {
  const map = generateMap({ shape: 'continent', seed: 3 });
  for (const bad of [['verdant'], [], ['verdant', 'verdant'], ['verdant', 'nobody'], 'verdant', ['ivory', 'gold', 'ember', 'crimson', 'verdant', 'azure', 'tidewatch', 'ashen', 'ivory']]) {
    assert.throws(() => E.mapToGame(map, { realmIds: bad }), undefined, JSON.stringify(bad));
  }
  const small = generateMap({ shape: 'continent', seed: 3, width: 110, height: 72, cities: 28, realms: 6 });
  assert.throws(() => E.mapToGame(small, { realmIds: E.REALM_IDS }), /capitals/);
  assert.equal(E.mapToGame(small, { realmIds: ['ashen', 'ivory'] }).game.realms.size, 2);
  assert.equal(E.realmIdsError(['gold', 'ember']), null);
});
