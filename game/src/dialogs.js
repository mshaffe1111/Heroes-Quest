// The framed dialogs: city, battle, capture, hero offer, doctrines, reports, saves, options, help, end of game.
import * as E from '../../engine/src/index.js';
import { S, hooks, theRealm, medalImg, realmOf, colorOf, unitName, realmName, myCities, economy, unitLine } from './state.js';
import { h, frame, openModal, closeAllModals, toast, confirmBox, crest, num, sleep, esc, REALM_LOOK, plural } from './ui.js';
import { realmHex } from './view.js';
import { sfx, syncMusic, pushBattle, popBattle, setScene, testSound, skipTrack, trackTitle, applyOptions as applyVolumes } from './audio.js';

const typeName = (t) => E.ARMIES[t].name;
const pipsRow = (a) => { const max = E.maxPips(a, S.g.rules), cur = E.pipsOf(a, S.g.rules); return h('div', { class: 'pips' }, Array.from({ length: max }, (_, i) => h('i', { class: i < cur ? '' : 'w' }))); };

// ===== city ====================================================================================================================
export function openCity(cityId, { list = null, onClose = null } = {}) {
  const g = S.g; const city = g.cities.get(cityId); if (!city) { onClose?.(); return; }
  let m; let chained = false; const mine = city.owner === S.me;
  const build = () => {
    const eco = economy(); const armies = E.orderedArmiesAt(g, city.x, city.y, city.owner);
    const def = E.cityDefenceBonus(city) + (E.hasDoctrine(g.rules, city.owner, 'walls') ? 1 : 0);
    const head = h('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingRight: '44px' } },
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } }, crest(colorOf(city.owner), 42),
        h('div', {}, h('h2', {}, city.name), h('div', { class: 'sub' }, `${g.map?.caps?.includes(city.id) ? 'Capital of the ' : 'City of the '}${realmName(city.owner)}`))),
      h('div', { class: 'statbox' }, h('div', {}, h('small', {}, 'INCOME'), h('b', { style: { color: '#7fe0a4' } }, `+${city.income} gp`)), h('div', {}, h('small', {}, 'DEFENCE'), h('b', {}, `+${def}`)),
        h('div', {}, h('small', {}, 'GARRISON'), h('b', {}, `${armies.length} of ${g.rules.cityGarrisonLimit}`))));
    const builds = h('div', { class: 'builds' });
    for (const t of city.production) {
      const d = E.ARMIES[t]; const on = city.building?.type === t; const turns = E.buildTurns(g.rules, city.owner, d);
      const letters = (d.indiv ? `+${d.indiv.amount} on ${d.indiv.on.map((l) => ({ O: 'open ground', R: 'roads', W: 'woods', H: 'hills' }[l])).join(' and ')}` : d.fly ? 'Flies over everything' : d.moveBonus ? `Cheap movement in ${d.moveBonus.map((l) => ({ W: 'woods', H: 'hills' }[l])).join(' and ')}` : '');
      builds.append(h('div', { class: 'bcard' + (on ? ' on' : '') },
        h('div', { class: 'h' }, h('img', { src: medalImg(t, city.owner, 96) }), h('div', {}, h('div', { class: 'n' }, d.name), h('div', { class: 'm' }, `Strength ${d.str} · Move ${d.move}`))),
        h('div', { class: 'd' }, letters), on ? h('div', {}, h('div', { class: 'prog' }, h('i', { style: { width: `${Math.round(100 * (city.building.progress / turns))}%` } })),
          h('div', { style: { font: '600 12px Inter', color: '#9fdcb1', marginTop: '4px' } }, `Turn ${city.building.progress} of ${turns} · ready in ${plural(Math.max(0, turns - city.building.progress), 'turn')}`)) : null,
        h('div', { class: 'pr' }, h('span', {}, `${E.priceOf(d, g.rules)} gp · ${plural(turns, 'turn')}`),
          mine ? h('button', { class: 'btn sm', onclick: () => { if (on) city.building = null; else { E.setProduction(g, city.id, t); sfx('built'); } render(); hooks.refresh(); } }, on ? 'Stop' : 'Build this') : null)));
    }
    const garr = h('div', { class: 'garr' }, armies.length ? armies.slice(0, 32).map((a) => h('div', { class: 'chip', title: `${unitName(a)} · ${unitLine(a)}` }, h('img', { src: medalImg(a.type, a.owner, 80) }))) : h('span', { class: 'sub' }, 'No armies here.'));
    const others = myCities().filter((c) => c.id !== city.id);
    const vsel = h('select', { onchange: (e) => { E.setVector(g, city.id, e.target.value || null); render(); } },
      h('option', { value: '' }, `Stay in ${city.name}`), ...others.map((c) => h('option', { value: c.id, selected: city.vector === c.id }, `Send to ${c.name}`)));
    const right = h('div', {}, h('div', { class: 'sec', style: { marginTop: 0 } }, `In the city · ${armies.length} armies`), garr,
      armies.length ? h('div', { class: 'hint' }, 'Weakest fights first, strongest last. The last one is shown on the map.') : null,
      mine ? h('div', {}, h('div', { class: 'sec' }, 'Send new armies to'), vsel,
        h('div', { class: 'hint' }, others.length ? 'New armies arrive 2 turns after they are built.' : 'When you own a second city you can send new armies there.')) : null,
      mine ? h('div', {}, h('div', { class: 'sec' }, 'City'), h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm', onclick: () => addTypeDialog(city, render) }, 'Add or replace army type…'),
        h('button', { class: 'btn sm', onclick: async () => { const n = prompt('Rename city', city.name); if (n && n.trim()) { city.name = n.trim().slice(0, 24); render(); hooks.refresh(); } } }, 'Rename'))) : null);
    const idx = (list ?? myCities().map((c) => c.id)); const k = idx.indexOf(city.id);
    const foot = h('div', { class: 'foot', style: { justifyContent: 'space-between' } },
      h('div', { style: { font: '600 13px Inter', color: '#c7d6e8' } }, mine ? `Gold ${num(S.g.realms.get(S.me).gold)} · Income ` : '', mine ? h('b', { style: { color: eco.net >= 0 ? '#7fe0a4' : '#ff9a8a' } }, `${eco.net >= 0 ? '+' : ''}${eco.net} a turn`) : ''),
      h('div', { style: { display: 'flex', gap: '10px' } }, mine && idx.length > 1 ? h('button', { class: 'btn', onclick: () => { const n = idx[(k + 1) % idx.length]; chained = true; m.close(); openCity(n, { list, onClose }); } }, 'Next city') : null, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Done')));
    const f = frame([head, h('div', { class: 'citygrid' }, h('div', {}, mine ? h('div', { class: 'sec', style: { marginTop: 0 } }, 'Building · one army at a time') : h('div', { class: 'sec', style: { marginTop: 0 } }, 'This city can build'), builds,
      mine ? h('div', { class: 'hint' }, `${city.name} can build ${city.production.length} army type${city.production.length === 1 ? '' : 's'}, the most a city can hold is 4.`) : null), right), foot], { width: 1040, onClose: () => m.close() });
    return f;
  };
  const render = () => m.el.replaceChildren(build());
  m = openModal(build(), { onClose: () => { hooks.refresh(); if (!chained) onClose?.(); } });
}
function addTypeDialog(city, back) {
  const g = S.g; const realm = g.realms.get(S.me); let m;
  const types = Object.keys(E.ARMIES).filter((t) => E.isBuildableType(t) && !city.production.includes(t)).sort((a, b) => E.ARMIES[a].cost - E.ARMIES[b].cost);
  const full = city.production.length >= 4; let replace = full ? city.production[0] : null;
  const draw = () => {
    const rows = types.map((t) => { const d = E.ARMIES[t]; const cost = E.establishCost(t, g.rules); const ok = realm.gold >= cost;
      return h('div', { class: 'bcard', style: { minHeight: 0 } }, h('div', { class: 'h' }, h('img', { src: medalImg(t, S.me, 80), style: { width: '40px', height: '40px' } }), h('div', {}, h('div', { class: 'n', style: { fontSize: '15px' } }, d.name), h('div', { class: 'm' }, `S ${d.str} · M ${d.move} · ${E.priceOf(d, g.rules)} gp · ${plural(d.build, 'turn')}`))),
        h('div', { class: 'pr' }, h('span', {}, `Cost to establish ${num(cost)} gp`), h('button', { class: 'btn sm', disabled: !ok, onclick: () => { const r = E.addProductionType(g, S.me, city.id, t, replace); if (!r.ok) { toast('That did not work: ' + r.reason.replaceAll('-', ' '), 'bad'); return; } toast(`${city.name} can now build ${d.name}.`, 'good'); m.close(); back(); hooks.refresh(); } }, 'Establish'))); });
    return frame([h('h2', { style: { fontSize: '26px' } }, 'Add an army type'), h('p', { class: 'sub' }, `${city.name} builds ${city.production.map(typeName).join(', ')}. You have ${num(realm.gold)} gold.`),
      full ? h('div', {}, h('div', { class: 'sec' }, 'The city is full. Replace which one?'), h('select', { onchange: (e) => { replace = e.target.value; } }, ...city.production.map((t) => h('option', { value: t, selected: t === replace }, typeName(t))))) : null,
      h('div', { class: 'builds', style: { marginTop: '14px' } }, rows), h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'))], { width: 820, onClose: () => m.close() });
  };
  m = openModal(draw());
}

// ===== battle ==================================================================================================================
/** Replays a finished battle fight by fight. Resolves when the player has seen (or skipped) it. */
export function showBattle(result, { attacker, defender, place, tile, theirs = false }) {
  return new Promise((resolve) => {
    const b = result.battle; const g = S.g; let skip = false; let m;
    const attS = new Map(), defS = new Map();
    const A = [...b.survivors.attackers, ...b.dead.attackers], D = [...b.survivors.defenders, ...b.dead.defenders];
    const order = (arr, fights, side) => { const seen = []; for (const f of fights) { const id = f[side].id; if (!seen.includes(id)) seen.push(id); } for (const a of arr) if (!seen.includes(a.id)) seen.push(a.id); return seen.map((id) => arr.find((a) => a.id === id)).filter(Boolean); };
    const attOrder = order(A, b.fights, 'attacker'), defOrder = order(D, b.fights, 'defender');
    const arena = h('div', { class: 'arena' }); const log = h('div', { class: 'log' });
    const chips = (list, side) => h('div', { class: 'row' }, list.map((a) => { const c = h('div', { class: 'chip', 'data-id': a.id, title: unitName(a) }, h('img', { src: medalImg(a.type, a.owner, 80) })); return c; }));
    const duel = h('div', { class: 'duel' }); const sideA = h('div', { class: 'side' }, h('div', { class: 'sec', style: { margin: '0 0 4px' } }, `${realmName(attacker)} attacks`), chips(attOrder, 'a')); const sideD = h('div', { class: 'side r' }, h('div', { class: 'sec', style: { margin: '0 0 4px' } }, `${place ? place + ' · ' : ''}${realmName(defender)} defends`), chips(defOrder, 'd'));
    arena.append(sideA, duel, sideD); sfx('horn'); pushBattle();
    const title = h('h2', { style: { fontSize: '28px' } }, place ? `Battle at ${place}` : 'Battle');
    const skipBtn = h('button', { class: 'btn', onclick: () => { skip = true; } }, 'Skip'); const doneBtn = h('button', { class: 'btn pri', style: { display: 'none' }, onclick: () => { popBattle(); m.close(); resolve(); } }, 'Continue');
    const f = frame([h('div', { class: 'eyebrow' }, theirs ? `${realmName(attacker)} attacked you` : 'The armies meet'), title, arena, log, h('div', { class: 'foot' }, skipBtn, doneBtn)], { width: 920, closeButton: false });
    m = openModal(f, { dismiss: false }); m.onEsc = () => { skip = true; };      // FIX: Esc = Skip (was: closed the modal and left the promise pending forever)
    const chipOf = (id) => f.querySelector(`.chip[data-id="${id}"]`);
    (async () => {
      try {
      let n = 0;
      for (const fight of b.fights) {
        n++; const ea = chipOf(fight.attacker.id), ed = chipOf(fight.defender.id); f.querySelectorAll('.chip.front').forEach((c) => c.classList.remove('front')); ea?.classList.add('front'); ed?.classList.add('front');
        const ta = typeName(fight.attacker.type), td = typeName(fight.defender.type);
        const hero = (x) => x.type === 'hero' ? 'Hero' : null;
        duel.replaceChildren(h('div', { class: 'big' }, h('div', {}, h('div', { class: 'sbig' }, fight.attacker.strength), h('div', {}, ta)), h('div', { class: 'vs' }, 'vs'), h('div', {}, h('div', { class: 'sbig' }, fight.defender.strength), h('div', {}, td))),
          fight.stackBonus.attacker || fight.stackBonus.defender ? h('div', { style: { font: '500 12px Inter', color: '#9fb4cc' } }, `Stack bonus: you +${fight.stackBonus.attacker} · they +${fight.stackBonus.defender}`) : null);
        if (!skip) await sleep(650);
        const loser = fight.winner === 'attacker' ? ed : ea; loser?.classList.add('dead'); sfx('clash', fight.attacker.strength + fight.defender.strength > 10); setTimeout(() => sfx('fall'), 180);
        log.append(h('div', {}, h('b', {}, `Duel ${n}: `), `${fight.winner === 'attacker' ? ta : td} beats ${fight.winner === 'attacker' ? td : ta} (${fight.attacker.strength} v ${fight.defender.strength}).`)); log.scrollTop = 1e6;
        if (!skip) await sleep(450);
      }
      f.querySelectorAll('.chip.front').forEach((c) => c.classList.remove('front'));
      const won = theirs ? b.winner === 'defender' : b.winner === 'attacker';
      const lostMine = theirs ? b.dead.defenders.length : b.dead.attackers.length, lostTheirs = theirs ? b.dead.attackers.length : b.dead.defenders.length;
      duel.replaceChildren(h('div', { class: 'vs', style: { fontSize: '20px' } }, b.retreated ? 'Called off' : won ? 'Victory' : 'Defeat'), h('div', {}, `${lostMine} of yours lost · ${lostTheirs} of theirs fell`));
      sfx(won && !b.retreated ? 'victory' : 'defeat'); skipBtn.style.display = 'none'; doneBtn.style.display = '';
      } catch (e) { console.error('battle replay failed', e); skipBtn.style.display = 'none'; doneBtn.style.display = ''; }      // FIX: never leave the player with a modal that cannot be closed
    })();
  });
}

// ===== capture =================================================================================================================
export function askCapture(cityId) {
  return new Promise((resolve) => {
    const g = S.g; const city = g.cities.get(cityId); const prev = city.owner; let m;
    const choose = (c) => { m.close(); resolve(c); };
    const row = (key, title, text) => h('button', { class: 'opt', style: { width: '100%', marginBottom: '8px' }, onclick: () => choose(key) }, h('b', {}, title), h('span', {}, text));
    m = openModal(frame([h('div', { class: 'eyebrow' }, 'The gates open'), h('h2', {}, `${city.name} is yours`), h('p', { class: 'sub', style: { margin: '10px 0 16px' } }, `What will you do with the city of ${theRealm(prev)}?`),
      row('occupy', 'Occupy', 'Keep it whole. It pays you its income from next turn and can build for you.'), row('pillage', 'Pillage', 'Take its coffers, keep the city. A lean haul, no ruin.'),
      row('sack', 'Sack', 'Take its coffers and a lot more, and leave it burning, with a smaller production list.'), row('raze', 'Raze', 'Take what you can carry and burn the rest. The city is gone until someone rebuilds it for 800 gold.')], { width: 560, closeButton: false }), { dismiss: false });
  });
}

// ===== hero offer ==============================================================================================================
export function heroOfferDialog(offer) {
  return new Promise((resolve) => {
    let m; const done = (v) => { m.close(); resolve(v); }; const g = S.g; const city = g.cities.get(offer.cityId);
    m = openModal(frame([h('div', { class: 'eyebrow' }, 'A stranger at the gate'), h('h2', {}, `${offer.name} offers a sword`), h('p', { class: 'sub', style: { margin: '10px 0 14px' } }, `A hero has come to ${city.name} and will join your cause for ${offer.cost} gold. Heroes grow stronger with every battle and can lead the armies around them.`),
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } }, h('img', { src: medalImg('hero', S.me, 96), style: { width: '70px' } }), h('div', { class: 'sub' }, `You have ${num(g.realms.get(S.me).gold)} gold.`)),
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Not now'), h('button', { class: 'btn pri', onclick: () => done(true) }, `Hire for ${offer.cost} gold`))], { width: 520, closeButton: false }), { dismiss: false }); m.onEsc = () => done(false);
  });
}

// ===== doctrines ===============================================================================================================
export function openDoctrines() {
  const g = S.g; let m; const realm = g.realms.get(S.me);
  const draw = () => {
    const groups = {}; for (const k of E.DOCTRINE_KEYS) (groups[E.DOCTRINES[k].group] ??= []).push(k);
    const body = Object.entries(groups).map(([name, keys]) => h('div', {}, h('div', { class: 'sec' }, name), h('div', { class: 'builds' }, keys.map((k) => {
      const d = E.DOCTRINES[k]; const owned = E.hasDoctrine(g.rules, S.me, k); const price = E.doctrinePrice(g, S.me, k);
      return h('div', { class: 'bcard' + (owned ? ' on' : '') }, h('div', { class: 'n' }, d.name), h('div', { class: 'd' }, d.text),
        h('div', { class: 'pr' }, owned ? h('span', { style: { color: '#9fdcb1' } }, 'Adopted') : h('span', {}, `${num(price)} gp`), owned ? null : h('button', { class: 'btn sm', disabled: realm.gold < price, onclick: () => { const r = E.buyDoctrine(g, S.me, k); if (r.ok) { toast(`${d.name} adopted.`, 'good'); m.el.replaceChildren(draw()); hooks.refresh(); } } }, 'Adopt')));
    }))));
    return frame([h('h2', { style: { fontSize: '28px' } }, 'Doctrines'), h('p', { class: 'sub' }, `Lasting upgrades for the whole realm. Each one you adopt makes the next cost 25% more. You have ${num(realm.gold)} gold.`), body, h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Done'))], { width: 900, onClose: () => m.close() });
  };
  m = openModal(draw());
}

// ===== reports =================================================================================================================
export function openRealms() {
  const g = S.g; let m; const rows = E.standings(g, null);
  const table = h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Realm', 'Cities', 'Armies', 'Gold', 'Taken', 'Lost', 'Battles won'].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((r) => { const realm = realmOf(r.id); const armies = [...g.armies.values()].filter((a) => a.owner === r.id && a.x != null).length; const fogHidden = E.fogOn(g) && r.id !== S.me;
      return h('tr', { style: { opacity: r.citiesNow || armies ? 1 : 0.5 } }, h('td', {}, h('span', { class: 'dot', style: { background: realmHex(realm) ?? '#999' } }), realm.name + (r.id === S.me ? ' (you)' : '')), h('td', {}, fogHidden ? '?' : r.citiesNow), h('td', {}, fogHidden ? '?' : armies),
        h('td', {}, r.id === S.me ? num(realm.gold) : '—'), h('td', {}, r.citiesTaken), h('td', {}, r.citiesLost), h('td', {}, r.battlesWon)); })));
  m = openModal(frame([h('div', { class: 'eyebrow' }, `Turn ${g.turn}`), h('h2', { style: { fontSize: '28px', marginBottom: '14px' } }, 'The realms'), table, h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 820, onClose: () => m.close() }));
}
export function openHistory() {
  const g = S.g; let m; const list = [...(g.stats?.battles ?? [])].reverse().slice(0, 60);
  const body = list.length ? list.map((b) => h('div', { style: { padding: '8px 0', borderBottom: '1px solid #16243a', font: '600 13px Inter' } }, h('b', { style: { color: '#f3dc9a' } }, `Turn ${b.turn} `), `${b.place ? 'at ' + b.place : 'in the field'}: ${realmName(b.attacker)} attacked ${realmName(b.defender)} (${b.attackers} v ${b.defenders}). `, h('span', { style: { color: b.winner === 'attacker' ? '#7fe0a4' : '#ff9a8a' } }, b.winner === 'attacker' ? 'The attackers won.' : b.winner === 'defender' ? 'The defenders held.' : 'Called off.'))) : [h('p', { class: 'sub' }, 'No battles yet.')];
  m = openModal(frame([h('h2', { style: { fontSize: '28px', marginBottom: '10px' } }, 'Battle history'), h('div', { style: { maxHeight: '55vh', overflow: 'auto' } }, body), h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 760, onClose: () => m.close() }));
}
export function openCities() {
  const list = myCities(); let m;
  const rows = list.map((c) => { const n = E.armiesAt(S.g, c.x, c.y).filter((a) => a.owner === S.me).length; const b = c.building ? E.ARMIES[c.building.type].name : '—';
    return h('tr', { style: { cursor: 'pointer' }, onclick: () => { m.close(); openCity(c.id, { list: list.map((q) => q.id) }); } }, h('td', {}, c.name), h('td', {}, `+${c.income}`), h('td', {}, n), h('td', {}, b), h('td', {}, c.building ? `${c.building.progress} / ${E.buildTurns(S.g.rules, S.me, E.ARMIES[c.building.type])}` : '—')); });
  m = openModal(frame([h('h2', { style: { fontSize: '28px', marginBottom: '10px' } }, 'Your cities'), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['City', 'Income', 'Armies', 'Building', 'Progress'].map((c) => h('th', {}, c)))), h('tbody', {}, rows)),
    h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => { m.close(); openDoctrines(); } }, 'Doctrines…'), h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 760, onClose: () => m.close() }));
}

// ===== help / options ==========================================================================================================
export function openHelp() {
  let m; const row = (k, t) => h('div', { style: { display: 'flex', gap: '14px', padding: '6px 0', borderBottom: '1px solid #16243a' } }, h('b', { style: { width: '150px', flex: 'none', color: '#f3dc9a', font: '700 13px Inter' } }, k), h('span', { style: { font: '500 13.5px/1.5 Inter', color: '#c7d6e8' } }, t));
  m = openModal(frame([h('div', { class: 'eyebrow' }, 'How to play'), h('h2', { style: { fontSize: '28px', marginBottom: '12px' } }, 'Heroes Quest'),
    h('p', { class: 'sub' }, 'Take more than half of all the cities and the other realms give up. Build armies in your cities, march them out, and take the neighbours’ castles. Every army fights until it has no pips left, and its wounds stay with it until it rests inside a city.'),
    h('div', { class: 'sec' }, 'With the mouse'), row('Click an army', 'Select it. Click a square to see the route and, for enemies, your chance of winning. Click the same square again to go.'), row('Click a city', 'Open it to choose what it builds. Click your own city with armies in it to select them.'),
    row('Right-click', 'Always shows the route, even onto a square holding your own armies.'), row('Drag / wheel', 'Move and zoom the map. On a touch screen, drag and pinch.'),
    h('div', { class: 'sec' }, 'Keys'), row('N or Space', 'Next army that still has orders.'), row('F · D · W', 'Fortify (hold the ground), Done for this turn, Wake up.'), row('Enter', 'Confirm the route that is showing.'), row('Esc', 'Cancel the route, then deselect.'), row('E', 'End your turn.'), row('+ · − · arrows · C', 'Zoom, scroll, centre on the selected army.'), row('M', 'Show or hide the small map.'),
    h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 760, onClose: () => m.close() }));
}
export const DEFAULT_OPTS = { odds: true, autoNext: true, sound: true, music: true, replay: true, follow: true, moveSpeed: 60, musicVol: 70, fxVol: 85, quietHidden: true, confirmEnd: true, enemyMode: 'watch' };
export function openOptions() {
  let m; const save = () => { try { localStorage.setItem('hq-opts', JSON.stringify(S.opts)); } catch { /* private mode */ } syncMusic(); hooks.refresh(); };
  const sw = (key, extra) => { const b = h('button', { class: 'sw' + (S.opts[key] !== false ? ' on' : ''), role: 'switch', 'aria-checked': String(S.opts[key] !== false), onclick: () => { S.opts[key] = S.opts[key] === false ? true : !S.opts[key]; b.classList.toggle('on', S.opts[key] !== false); b.setAttribute('aria-checked', String(S.opts[key] !== false)); extra?.(); save(); } }); return b; };
  const row = (title, text, ...ctl) => h('div', { class: 'toggle' }, h('div', {}, h('b', {}, title), h('span', {}, text)), ...ctl);
  const slider = (key, label, onChange) => { const out = h('output', {}, String(S.opts[key] ?? 0)); const inp = h('input', { type: 'range', min: 0, max: 100, step: 1, value: S.opts[key] ?? 0, 'aria-label': label, oninput: () => { S.opts[key] = +inp.value; out.textContent = inp.value; onChange?.(); }, onchange: save });
    return h('div', { class: 'vol' }, h('span', {}, label), inp, out); };
  const now = h('b', {}, trackTitle() || '—'); const np = h('div', { class: 'now' }, h('span', { class: 'eyebrow' }, 'Now playing'), now,
    h('button', { class: 'btn sm', 'aria-label': 'Previous track', onclick: () => { now.textContent = skipTrack(-1) || '—'; } }, '‹'), h('button', { class: 'btn sm', 'aria-label': 'Next track', onclick: () => { now.textContent = skipTrack(1) || '—'; } }, '›'));
  const modeBtns = [['watch', 'Watch every move'], ['quick', 'Quick'], ['hidden', 'Hidden']].map(([v, t]) => { const b = h('button', { class: 'seg' + (S.opts.enemyMode === v ? ' on' : ''), onclick: () => { S.opts.enemyMode = v; modeBtns.forEach((x) => x.classList.toggle('on', x === b)); save(); } }, t); return b; });
  const body = [h('h2', { style: { fontSize: '28px', marginBottom: '4px' } }, 'Options'), h('p', { class: 'sub' }, 'Changes apply at once and are saved on this device.'),
    h('div', { class: 'eyebrow', style: { margin: '10px 0 6px' } }, 'Sound'),
    row('Music', 'Orchestral score. Different tracks for the map, battles and your menus.', sw('music')), h('div', { class: 'sub2' }, slider('musicVol', 'Music volume', () => applyVolumes()), np),
    row('Sound effects', 'Swords, hooves, gold, gates and fanfares.', sw('sound')), h('div', { class: 'sub2' }, slider('fxVol', 'Effects volume', () => applyVolumes()), h('button', { class: 'btn sm', onclick: () => testSound() }, 'Test')),
    row('Quiet when you switch tabs', 'Pauses music and effects while the game is in the background.', sw('quietHidden')),
    h('div', { class: 'eyebrow', style: { margin: '14px 0 6px' } }, 'Game flow'),
    row('Enemy turns', 'Every enemy army moves in turn while the camera follows it. Tap to skip an army, or skip the rest.', h('div', { class: 'segs' }, modeBtns)),
    row('Camera follows armies', 'Centres the map on each army as it moves, on your turn and theirs.', sw('follow')), h('div', { class: 'sub2' }, slider('moveSpeed', 'Movement speed', save)),
    row('Combat advisor', 'Show your chance of winning when you point an army at an enemy.', sw('odds')),
    row('Jump to the next army', 'After an army has moved, select the next one that still has orders.', sw('autoNext')),
    row('Confirm End turn', 'Ask first if some of your armies still have moves left.', sw('confirmEnd')),
    h('div', { class: 'foot', style: { justifyContent: 'space-between' } }, h('button', { class: 'btn sm', onclick: () => { Object.assign(S.opts, DEFAULT_OPTS); save(); m.close(); openOptions(); } }, 'Reset to defaults'), h('button', { class: 'btn pri', onclick: () => m.close() }, 'Done'))];
  m = openModal(frame(body, { width: 640, onClose: () => m.close() }));
}

// ===== saves ===================================================================================================================
const store = () => { try { const t = '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; } catch { return E.memoryStore(); } };
export const saveStore = store();
export function doAutosave() { try { E.autosave(saveStore, S.g, S.meta); } catch (e) { console.warn('autosave failed', e); } }
export function openSaveLoad(mode = 'save') {
  let m; const draw = () => {
    const list = E.listSaves(saveStore); const bySlot = new Map(list.map((s) => [s.slot, s]));
    const slots = (mode === 'save' ? E.MANUAL_SLOTS : E.ALL_SLOTS).map((slot) => { const rec = bySlot.get(slot); const s = rec && !rec.empty ? rec : null; const label = slot.startsWith('auto') ? `Autosave ${slot.slice(4)}` : `Slot ${slot.slice(4)}`;
      return h('div', { class: 'bcard', style: { minHeight: 0 } }, h('div', { class: 'n' }, label), s ? h('div', { class: 'm', style: { color: '#c7d6e8' } }, `${s.summary?.realmName ?? ''} · Turn ${s.summary?.turn ?? '?'} · ${s.summary?.cities ?? '?'} cities`) : h('div', { class: 'd' }, 'Empty'),
        s ? h('div', { class: 'd' }, new Date(s.savedAt).toLocaleString()) : null,
        h('div', { class: 'pr' }, h('span', {}), h('span', { style: { display: 'flex', gap: '6px' } }, mode === 'save' ? h('button', { class: 'btn sm', onclick: () => { const r = E.saveToSlot(saveStore, slot, `${realmName(S.me)}`, S.g, S.meta); if (r.ok) { toast('Saved.', 'good'); draw2(); } else toast('Could not save: ' + r.reason, 'bad'); } }, 'Save here') : (s ? h('button', { class: 'btn sm', onclick: () => { m.close(); hooks.loadSlot(slot); } }, 'Load') : null),
          s && !slot.startsWith('auto') ? h('button', { class: 'btn sm danger', onclick: () => { E.deleteSlot(saveStore, slot); draw2(); } }, 'Delete') : null))); });
    return frame([h('h2', { style: { fontSize: '28px', marginBottom: '12px' } }, mode === 'save' ? 'Save game' : 'Load game'), h('div', { class: 'builds' }, slots),
      h('div', { class: 'foot', style: { justifyContent: 'space-between' } }, h('div', { style: { display: 'flex', gap: '8px' } },
        mode === 'save' ? h('button', { class: 'btn sm', onclick: () => { const text = E.exportSave(E.saveGame(S.g, S.meta)); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = `heroes-quest-turn-${S.g.turn}.json`; a.click(); } }, 'Save to a file') : h('button', { class: 'btn sm', onclick: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = async () => { const t = await inp.files[0].text(); const r = E.importSave(t); if (!r.ok) { toast('That file could not be loaded: ' + (r.reason ?? 'unknown').replaceAll('-', ' '), 'bad'); return; } m.close(); hooks.loadGame(r.game, r.data.game?.meta ?? null); }; inp.click(); } }, 'Load from a file')),
        h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 820, onClose: () => m.close() });
  };
  const draw2 = () => m.el.replaceChildren(draw());
  m = openModal(draw());
}

// ===== end of game =============================================================================================================
export function openEnd(status) {
  setScene(status.victor === S.me ? 'victory' : 'defeat');
  const g = S.g; const rows = E.standings(g, status.victor); const won = status.victor === S.me;
  let title = won ? 'Victory' : status.reason === 'conceded' ? 'You gave up' : status.reason === 'eliminated' ? 'Your realm has fallen' : `${realmName(status.victor)} rules the land`;
  const sub = won ? `The ${realmName(S.me)} hold more than half of all the cities. The other realms lay down their arms.` : status.reason === 'conceded' ? 'The war goes on without you.' : status.reason === 'eliminated' ? 'No cities and no armies are left to your name.' : 'They hold more than half of all the cities.';
  const table = h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['', 'Realm', 'Cities', 'Most cities', 'Taken', 'Lost', 'Battles won', 'Armies lost'].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((r, i) => h('tr', {}, h('td', { style: { color: '#f3dc9a' } }, i + 1), h('td', {}, h('span', { class: 'dot', style: { background: realmHex(realmOf(r.id)) ?? '#999' } }), r.name + (r.id === S.me ? ' (you)' : '') + (r.winner ? ' ★' : '')), h('td', {}, r.citiesNow), h('td', {}, r.mostCities), h('td', {}, r.citiesTaken), h('td', {}, r.citiesLost), h('td', {}, r.battlesWon), h('td', {}, r.armiesLost)))));
  const big = E.biggestBattle(g, S.me);
  const m = openModal(frame([h('div', { class: 'eyebrow' }, `After ${plural(g.turn, 'turn')}`), h('h2', { style: { fontSize: '42px' } }, title), h('p', { class: 'sub', style: { margin: '8px 0 16px' } }, sub), table,
    big ? h('p', { class: 'sub', style: { marginTop: '14px' } }, `Your biggest battle: turn ${big.turn}${big.place ? ' at ' + big.place : ''}, ${big.attackers} against ${big.defenders}.`) : null,
    h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => { m.close(); } }, 'Look at the map'), h('button', { class: 'btn pri', onclick: () => { m.close(); hooks.toTitle(); } }, 'Main menu'))], { width: 920, closeButton: false }), { dismiss: false }); m.onEsc = () => m.close();
}
export async function confirmEndTurn(idle, idleCities = 0) {
  const parts = []; if (idle) parts.push(`${idle} ${idle === 1 ? 'army has' : 'armies have'} not been given orders. Use Done or Fortify to rest them.`); if (idleCities) parts.push(`${idleCities} ${idleCities === 1 ? 'city is' : 'cities are'} not building anything.`);
  return confirmBox({ title: 'End your turn?', text: parts.join(' ') + ' End the turn anyway?', ok: 'End turn', cancel: 'Keep playing' });
}
