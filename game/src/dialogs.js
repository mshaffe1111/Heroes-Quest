// The framed dialogs: city, battle, capture, hero offer, doctrines, reports, saves, options, help, end of game.
import { openGuide, resetLessons } from './coach.js';
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
  const types = Object.keys(E.ARMIES).filter((t) => (E.canRealmBuild ? E.canRealmBuild(city.owner, t) : E.isBuildableType(t)) && !city.production.includes(t)).sort((a, b) => E.ARMIES[a].cost - E.ARMIES[b].cost);
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
  // The fight window, phone first (board: Fight + BattleResult). Your armies on top, theirs below, every army named; each duel lights the two
  // fighters and a line says who struck whom; the fallen are greyed with a red cross; the end card lists exactly who was lost, heroes first.
  return new Promise((resolve) => {
    const b = result.battle; let m; let skip = false;
    const mine = theirs ? 'defender' : 'attacker', other = theirs ? 'attacker' : 'defender';
    const myRealm = theirs ? defender : attacker, foeRealm = theirs ? attacker : defender;
    const listOf = (side) => { const alive = side === 'attacker' ? b.survivors.attackers : b.survivors.defenders, dead = side === 'attacker' ? b.dead.attackers : b.dead.defenders; const all = [...alive, ...dead];
      const seen = []; for (const f of b.fights) { const id = f[side].id; if (!seen.includes(id)) seen.push(id); } for (const a of all) if (!seen.includes(a.id)) seen.push(a.id); return seen.map((id) => all.find((a) => a.id === id)).filter(Boolean); };
    const nameOf = (a) => (E.isHero(a) ? (a.name ?? 'Your hero') : typeName(a.type));
    const short = (a) => (E.isHero(a) ? (a.name ?? 'Hero') : typeName(a.type).replace('Heavy ', 'Hvy ').replace('Light ', 'Lt ').replace('Infantry', 'Inf.').replace('Cavalry', 'Cav.'));
    const chip = (a) => h('div', { class: 'ch' + (E.isHero(a) ? ' hero' : ''), 'data-id': a.id }, h('div', { class: 'md' }, h('img', { src: medalImg(a.type, a.owner, 96), alt: '' }), E.isHero(a) ? h('span', { class: 'crown', title: 'Hero' }, '♛') : null, h('span', { class: 'kx' })),
      h('div', { class: 'nm' }, short(a)), h('div', { class: 'fl' }, 'fallen'));
    const band = (side, realm, list) => h('div', { class: 'band ' + (side === mine ? 'me' : 'foe') }, h('div', { class: 'bh' }, crest(colorOf(realm), 26), h('div', {}, h('b', {}, side === mine ? `Your armies · ${realmName(realm)}` : (realm ? realmName(realm) : 'The Unsworn') + (place && side === 'defender' ? ` · ${place}` : '')),
      h('small', {}, side === 'attacker' ? 'Attacking' : 'Defending', h('span', { class: 'cnt' }))), h('span', { class: 'sp' })), h('div', { class: 'chips' }, list.map(chip)));
    const myList = listOf(mine), foeList = listOf(other);
    const bandMe = band(mine, myRealm, myList), bandFoe = band(other, foeRealm, foeList);
    const count = () => { for (const [el, list] of [[bandMe, myList], [bandFoe, foeList]]) { const up = list.filter((a) => !el.querySelector(`.ch[data-id="${a.id}"]`)?.classList.contains('dead')).length; el.querySelector('.cnt').textContent = ` · ${up} of ${list.length} standing`; } };
    const round = h('div', { class: 'round' }, h('b', {}, 'Ready'), h('span', {}, 'The armies close in'));
    const speeds = [['slow', 'Slow', 1.7], ['normal', 'Normal', 1], ['fast', 'Fast', 0.4]]; const spd = () => (speeds.find((q) => q[0] === (S.opts.battleSpeed ?? 'normal')) ?? speeds[1])[2];
    const segs = h('div', { class: 'segs' }, speeds.map(([k, t]) => h('button', { class: 'seg' + ((S.opts.battleSpeed ?? 'normal') === k ? ' on' : ''), onclick: (e) => { S.opts.battleSpeed = k; try { localStorage.setItem('hq-opts', JSON.stringify(S.opts)); } catch { /* private */ } segs.querySelectorAll('.seg').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } }, t)));
    const skipBtn = h('button', { class: 'btn pri', onclick: () => { skip = true; } }, 'Skip to the result');
    const doneBtn = h('button', { class: 'btn pri', style: { display: 'none' }, onclick: () => { popBattle(); m.close(); resolve(); } }, 'Continue');
    const head = h('div', { class: 'bthead' }, h('div', { class: 'eyebrow' }, theirs ? `${realmName(attacker)} attacks you` : 'The armies meet'), h('h2', {}, place ? `Battle at ${place}` : 'Battle'));
    const body = h('div', { class: 'btbody' }, bandMe, round, bandFoe);
    const foot = h('div', { class: 'btfoot' }, h('div', { class: 'spd' }, h('small', {}, 'Speed'), segs), h('span', { class: 'sp' }), skipBtn, doneBtn);
    const f = frame([head, body, foot], { width: 760, closeButton: false, cls: 'bt' });
    m = openModal(f, { dismiss: false }); m.onEsc = () => { skip = true; }; sfx('horn'); pushBattle(); count();
    const chipOf = (id) => f.querySelector(`.ch[data-id="${id}"]`);
    (async () => {
      try {
        let n = 0;
        for (const fight of b.fights) {
          n++; f.querySelectorAll('.ch.front').forEach((c) => c.classList.remove('front'));
          const A = fight[mine], O = fight[other]; const ca = chipOf(A.id), co = chipOf(O.id); ca?.classList.add('front'); co?.classList.add('front');
          const aArmy = myList.find((q) => q.id === A.id), oArmy = foeList.find((q) => q.id === O.id);
          round.className = 'round'; round.replaceChildren(h('b', {}, `Round ${n}`), h('span', {}, `Your ${aArmy ? short(aArmy) : typeName(A.type)} (${A.strength}) against their ${oArmy ? short(oArmy) : typeName(O.type)} (${O.strength})`));
          if (!skip) await sleep(700 * spd());
          const iWon = fight.winner === mine; const loserChip = iWon ? co : ca; loserChip?.classList.add('dead'); count();
          sfx('clash', fight.attacker.strength + fight.defender.strength > 10); setTimeout(() => sfx('fall'), 180);
          const lost = iWon ? oArmy : aArmy;
          round.className = 'round ' + (iWon ? 'good' : 'bad'); round.replaceChildren(h('b', {}, `Round ${n}`), h('span', {}, iWon ? `Your ${short(aArmy ?? { type: A.type })} beats their ${lost ? short(lost) : typeName(O.type)}` : `You lose your ${lost ? nameOf(lost) : typeName(A.type)}${lost && E.isHero(lost) ? ' — your hero has fallen' : ''}`));
          if (!skip) await sleep(650 * spd());
        }
        f.querySelectorAll('.ch.front').forEach((c) => c.classList.remove('front'));
        // the end card
        const won = theirs ? b.winner === 'defender' : b.winner === 'attacker';
        const deadMine = theirs ? b.dead.defenders : b.dead.attackers, deadFoe = theirs ? b.dead.attackers : b.dead.defenders;
        const lostLine = (arr) => { const heroes = arr.filter(E.isHero).map((a) => `${a.name ?? 'a hero'} (hero)`); const by = new Map(); for (const a of arr.filter((q) => !E.isHero(q))) by.set(typeName(a.type), (by.get(typeName(a.type)) ?? 0) + 1); return [...heroes, ...[...by].map(([k, c]) => (c > 1 ? `${c} × ${k}` : k))].join(', ') || 'nobody'; };
        head.replaceChildren(h('div', { class: 'eyebrow' }, b.retreated ? 'Called off' : won ? 'You won' : 'You lost'), h('h2', { class: won ? 'win' : 'loss' }, `${b.retreated ? 'Retreat' : won ? 'Victory' : 'Defeat'}${place ? ' at ' + place : ''}`));
        round.className = 'round sum'; round.replaceChildren(...[
          h('div', { class: 'ln ' + (deadMine.length ? 'bad' : 'good') }, h('b', {}, 'You lost'), h('span', {}, lostLine(deadMine))),
          deadMine.some(E.isHero) ? h('div', { class: 'ln bad hero' }, h('b', {}, '♛'), h('span', {}, `${deadMine.filter(E.isHero).map((a) => a.name ?? 'Your hero').join(' and ')} fell in this battle. Their items lie where they fell.`)) : null,
          h('div', { class: 'ln good' }, h('b', {}, 'They lost'), h('span', {}, lostLine(deadFoe)))].filter(Boolean));
        sfx(won && !b.retreated ? 'victory' : 'defeat'); skipBtn.style.display = 'none'; doneBtn.style.display = ''; doneBtn.focus?.();
      } catch (e) { console.error('battle replay failed', e); skipBtn.style.display = 'none'; doneBtn.style.display = ''; }      // never leave the player with a window that cannot be closed
    })();
  });
}

// ===== capture =================================================================================================================
export function askCapture(cityId) {
  return new Promise((resolve) => {
    const g = S.g; const city = g.cities.get(cityId); const prev = city.owner; let m;
    const choose = (c) => { m.close(); resolve(c); };
    const out = E.captureOutcomes ? E.captureOutcomes(city, g.rules) : null; const gp = (k) => (out ? out[k].gold : null);
    const row = (key, title, text) => h('button', { class: 'opt cap', style: { width: '100%', marginBottom: '8px' }, onclick: () => choose(key) }, h('div', { class: 'caprow' }, h('b', {}, title), gp(key) != null ? h('span', { class: 'capgold' + (gp(key) ? '' : ' none') }, gp(key) ? `+${num(gp(key))} gold` : 'no gold') : null), h('span', {}, text));
    const lostName = out?.sack.kindLost ? E.ARMIES[out.sack.kindLost].name : null;
    m = openModal(frame([h('div', { class: 'eyebrow' }, 'The gates open'), h('h2', {}, `${city.name} is yours`), h('p', { class: 'sub', style: { margin: '10px 0 16px' } }, `What will you do with the city of ${theRealm(prev)}?`),
      h('div', { class: 'capgrid' }, row('occupy', 'Occupy', 'Keep it whole. It pays you its income from next turn and can build for you.'), row('pillage', 'Pillage', 'Take its coffers, keep the city. A lean haul, no ruin.'),
      row('sack', 'Sack', lostName ? `Take its coffers and a lot more, and leave it burning. It forgets how to build ${lostName}.` : 'Take its coffers and leave it burning. It builds nothing, so there is no more to take.'), row('raze', 'Raze', `Take what you can carry and burn the rest. The city is gone until someone rebuilds it for ${num(g.rules.rebuildRazedCityCost ?? 800)} gold.`))], { width: 560, closeButton: false }), { dismiss: false });
  });
}

// ===== hero offer ==============================================================================================================
export function heroOfferDialog(offer) {
  return new Promise((resolve) => {
    let m; const done = (v) => { m.close(); resolve(v); }; const g = S.g; const city = g.cities.get(offer.cityId);
    m = openModal(frame([h('img', { class: 'scene', src: 'play/assets/scenes/heroffer.webp', alt: '' }), h('div', { class: 'eyebrow' }, 'A stranger at the gate'), h('h2', {}, `${offer.name} offers a sword`), h('p', { class: 'sub', style: { margin: '10px 0 14px' } }, `A hero has come to ${city.name} and will join your cause for ${offer.cost} gold. Heroes grow stronger with every battle and can lead the armies around them.`),
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } }, h('img', { src: medalImg('hero', S.me, 96), style: { width: '70px' } }), h('div', { class: 'sub' }, `You have ${num(g.realms.get(S.me).gold)} gold.`)),
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Not now'), h('button', { class: 'btn pri', onclick: () => done(true) }, `Hire for ${offer.cost} gold`))], { width: 520, closeButton: false , cls: 'scenecard' }), { dismiss: false }); m.onEsc = () => done(false);
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
  const g = S.g; let m; const rows = E.standings(g, null); if (E.fogOn(g)) rows.sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : realmOf(a.id).name.localeCompare(realmOf(b.id).name)));      // fog: the order would rank the hidden realms
  const table = h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Realm', 'Cities', 'Armies', 'Gold', 'Taken', 'Lost', 'Battles won'].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map((r) => { const realm = realmOf(r.id); const armies = [...g.armies.values()].filter((a) => a.owner === r.id && a.x != null).length; const fogHidden = E.fogOn(g) && r.id !== S.me;
      return h('tr', { style: { opacity: r.citiesNow || armies ? 1 : 0.5 } }, h('td', {}, h('span', { class: 'dot', style: { background: realmHex(realm) ?? '#999' } }), realm.name + (r.id === S.me ? ' (you)' : '')), h('td', {}, fogHidden ? '?' : r.citiesNow), h('td', {}, fogHidden ? '?' : armies),
        h('td', {}, r.id === S.me ? num(realm.gold) : '—'), h('td', {}, fogHidden ? '?' : r.citiesTaken), h('td', {}, fogHidden ? '?' : r.citiesLost), h('td', {}, fogHidden ? '?' : r.battlesWon)); })));
  m = openModal(frame([h('div', { class: 'eyebrow' }, `Turn ${g.turn}`), h('h2', { style: { fontSize: '28px', marginBottom: '14px' } }, 'The realms'), table, h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 820, onClose: () => m.close() }));
}
export function openHistory() {
  const g = S.g; let m; const list = [...(g.stats?.battles ?? [])].filter((b) => !E.fogOn(g) || b.attacker === S.me || b.defender === S.me).reverse().slice(0, 60);      // fog: only the battles your own armies fought
  const body = list.length ? list.map((b) => h('div', { style: { padding: '8px 0', borderBottom: '1px solid #16243a', font: '600 13px Inter' } }, h('b', { style: { color: '#f3dc9a' } }, `Turn ${b.turn} `), `${b.place ? 'at ' + b.place : 'in the field'}: ${realmName(b.attacker)} attacked ${realmName(b.defender)} (${b.attackers} v ${b.defenders}). `, h('span', { style: { color: b.winner === 'attacker' ? '#7fe0a4' : '#ff9a8a' } }, b.winner === 'attacker' ? 'The attackers won.' : b.winner === 'defender' ? 'The defenders held.' : 'Called off.'))) : [h('p', { class: 'sub' }, 'No battles yet.')];
  m = openModal(frame([h('h2', { style: { fontSize: '28px', marginBottom: '10px' } }, 'Battle history'), h('div', { style: { maxHeight: '55vh', overflow: 'auto' } }, body), h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 760, onClose: () => m.close() }));
}
export function openCities() {
  const list = myCities(); let m;
  const rows = list.map((c) => { const n = E.armiesAt(S.g, c.x, c.y).filter((a) => a.owner === S.me).length; const b = c.building ? E.ARMIES[c.building.type].name : '—';
    return h('tr', { style: { cursor: 'pointer' }, onclick: () => { m.close(); openCity(c.id, { list: list.map((q) => q.id) }); } }, h('td', {}, c.name), h('td', {}, `+${c.income}`), h('td', {}, n), h('td', {}, b), h('td', {}, c.building ? `${c.building.progress} / ${E.buildTurns(S.g.rules, S.me, E.ARMIES[c.building.type])}` : '—'), h('td', {}, h('button', { class: 'btn sm' }, 'Open'))); });
  m = openModal(frame([h('h2', { style: { fontSize: '28px', marginBottom: '10px' } }, 'Your cities'), h('table', { class: 't cities' }, h('thead', {}, h('tr', {}, ['City', 'Income', 'Armies', 'Building', 'Progress', ''].map((c) => h('th', {}, c)))), h('tbody', {}, rows)),
    h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => { m.close(); openDoctrines(); } }, 'Doctrines…'), h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 760, onClose: () => m.close() }));
}

// ===== help / options ==========================================================================================================
export function openHelp(at = null) {
  return openGuide(at, { onLessons: S.g ? () => { resetLessons(); hooks.replayLessons?.(); } : () => { resetLessons(); toast('The lessons will start with your next new game.'); } });
}
export const DEFAULT_OPTS = { odds: true, autoNext: true, sound: true, music: true, replay: true, follow: true, moveSpeed: 60, musicVol: 70, fxVol: 85, quietHidden: true, confirmEnd: true, enemyMode: 'watch' };
export function openOptions() {
  let m; const save = () => { try { localStorage.setItem('hq-opts', JSON.stringify(S.opts)); } catch { /* private mode */ } syncMusic(); hooks.refresh?.(); };
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
    row('Keep full screen', 'The game fills the whole screen and goes back to full screen whenever the phone drops out of it. The full-screen button at the top turns this off and on.', sw('autoFull')),
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
export const persistent = (() => { try { return saveStore === localStorage; } catch { return false; } })();
let warned = false;
export function doAutosave() { let r; try { r = E.autosave(saveStore, S.g, S.meta); } catch (e) { r = { ok: false }; console.warn('autosave failed', e); }
  if (!r?.ok && !warned) { warned = true; toast('The autosave failed: this browser has no room left for saves. Save to a file from Game > Save.', 'bad'); } }
export function openSaveLoad(mode = 'save') {
  let m; const draw = () => {
    const list = E.listSaves(saveStore); const bySlot = new Map(list.map((s) => [s.slot, s]));
    const slots = (mode === 'save' ? E.MANUAL_SLOTS : E.ALL_SLOTS).map((slot) => { const rec = bySlot.get(slot); const s = rec && !rec.empty ? rec : null; const label = slot.startsWith('auto') ? `Autosave ${slot.slice(4)}` : `Slot ${slot.slice(4)}`;
      return h('div', { class: 'bcard', style: { minHeight: 0 } }, h('div', { class: 'n' }, label), s ? h('div', { class: 'm', style: { color: '#c7d6e8' } }, `${s.summary?.realmName ?? ''} · Turn ${s.summary?.turn ?? '?'} · ${s.summary?.cities ?? '?'} cities`) : h('div', { class: 'd' }, 'Empty'),
        s ? h('div', { class: 'd' }, new Date(s.savedAt).toLocaleString()) : null,
        h('div', { class: 'pr' }, h('span', {}), h('span', { style: { display: 'flex', gap: '6px' } }, mode === 'save' ? h('button', { class: 'btn sm', onclick: () => { if (S.busy) { toast('The other realms are still playing. Wait a moment.'); return; } const r = E.saveToSlot(saveStore, slot, `${realmName(S.me)}`, S.g, S.meta); if (r.ok) { toast('Saved.', 'good'); draw2(); } else toast(r.reason === 'storage-full' ? 'Could not save: this browser has no room left. Delete a slot or save to a file.' : 'Could not save: ' + r.reason.replaceAll('-', ' '), 'bad'); } }, 'Save here') : (s ? h('button', { class: 'btn sm', onclick: () => { m.close(); hooks.loadSlot(slot); } }, 'Load') : null),
          s && !slot.startsWith('auto') ? h('button', { class: 'btn sm danger', onclick: () => { E.deleteSlot(saveStore, slot); draw2(); } }, 'Delete') : null))); });
    return frame([h('h2', { style: { fontSize: '28px', marginBottom: '12px' } }, mode === 'save' ? 'Save game' : 'Load game'), h('div', { class: 'builds' }, slots),
      h('div', { class: 'foot', style: { justifyContent: 'space-between' } }, h('div', { style: { display: 'flex', gap: '8px' } },
        mode === 'save' ? h('button', { class: 'btn sm', onclick: () => { const text = E.exportSave(E.saveGame(S.g, S.meta)); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = `heroes-quest-turn-${S.g.turn}.json`; a.click(); } }, 'Save to a file') : h('button', { class: 'btn sm', onclick: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = async () => { if (S.busy) { toast('The other realms are still playing. Wait a moment.'); return; } const t = await inp.files[0].text(); const r = E.importSave(t); if (!r.ok) { toast('That file could not be loaded: ' + (r.reason ?? 'unknown').replaceAll('-', ' '), 'bad'); return; } m.close(); hooks.loadGame(r.game, r.data.game?.meta ?? null); }; inp.click(); } }, 'Load from a file')),
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
  const table = h('table', { class: 't standings' }, h('thead', {}, h('tr', {}, ['', 'Realm', 'Cities', 'Most cities', 'Taken', 'Lost', 'Battles won', 'Armies lost'].map((c) => h('th', {}, c)))),
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

/** Credits: who made the game, and the sounds that must be credited (CC BY). */
export function openCredits() {
  const line = (a, b) => h('div', { class: 'cr' }, h('b', {}, a), h('span', {}, b));
  let m; m = openModal(frame([h('div', { class: 'eyebrow' }, 'Heroes Quest'), h('h2', {}, 'Credits'),
    h('div', { class: 'sec' }, 'The game'), line('Created and made by', 'Matt Shaffer'), line('Painted scenes', 'made for Heroes Quest'),
    h('div', { class: 'sec' }, 'Music'), h('p', { class: 'sub' }, 'Original music for Heroes Quest, played with the VSCO 2 Community Edition (CC0) and Sonatina Symphonic Orchestra (Creative Commons Sampling Plus 1.0) sample libraries.'),
    h('div', { class: 'sec' }, 'Sound effects'), h('p', { class: 'sub' }, 'Kenney (kenney.nl), StarNinjas, Eldritch Grim and StephenSaldanha, all CC0.'),
    line('Horse gallop', 'AntumDeluge / Alan McKinney (freesound 403026), CC BY 3.0'), line('Archers shooting', "copyc4t (Paolo D'Emilio), OpenGameArt, CC BY 3.0"),
    h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: () => m.close() }, 'Close'))], { width: 640, onClose: () => m.close() }));
}
