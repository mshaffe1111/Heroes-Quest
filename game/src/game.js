// The game controller: selection, moving, attacking, the panels and the turn loop.
import * as E from '../../engine/src/index.js';
import { generateMap } from '../../engine/src/mapgen/index.js';
import { S, hooks, theRealm, medalImg, realmOf, colorOf, unitName, realmName, myCities, economy, unitLine } from './state.js';
import { MapView, loadAssets, realmHex } from './view.js';
import { h, $, $$, toast, sleep, openModal, frame, closeAllModals, modalOpen, topModal, crest, num, confirmBox } from './ui.js';
import * as D from './dialogs.js';
import { TP } from './paint.js';

// ======================================================================================================================
// building a new game
export const SIZES = { 60: [150, 96], 100: [190, 120], 140: [230, 146] };
export function newGame(o) {
  const [W, H] = SIZES[o.cities] ?? SIZES[60];
  const map = generateMap({ shape: o.shape, seed: o.seed, width: W, height: H, cities: o.cities, realms: 8 });
  const { game: g } = E.mapToGame(map, { neutrals: 'normal' });
  g.rules.fog = !!o.fog; g.rules.classic = !!o.classic;
  const ids = [...g.realms.keys()]; const me = o.realm && g.realms.has(o.realm) ? o.realm : ids[0];
  g.realms.get(me).human = true;
  for (const id of ids) if (id !== me) E.setDifficulty(g, id, o.difficulty ?? 'medium');
  E.assignSkills(g);
  const hero = [...g.armies.values()].find((a) => a.owner === me && a.type === 'hero'); if (hero && o.heroName) hero.name = o.heroName.slice(0, 20);
  g.meta = { difficulty: o.difficulty ?? 'medium', shape: o.shape, seed: o.seed, cities: o.cities, startedAt: Date.now() };
  return g;
}

// ======================================================================================================================
// the page skeleton
let skeletonMade = false;
function skeleton() {
  if (skeletonMade) return; skeletonMade = true;
  const app = $('#app');
  const menu = (title, items) => h('div', { class: 'mi' }, h('button', { class: 'mb', onclick: (e) => { e.stopPropagation(); const mi = e.currentTarget.parentElement; const was = mi.classList.contains('open'); $$('.mi.open').forEach((x) => x.classList.remove('open')); if (!was) mi.classList.add('open'); } }, title),
    h('div', { class: 'dd' }, items.map((it) => it === '-' ? h('hr') : h('button', { 'data-act': it[2] ?? '', onclick: () => { $$('.mi.open').forEach((x) => x.classList.remove('open')); it[1](); } }, h('span', {}, it[0]), it[3] ? h('kbd', {}, it[3]) : null))));
  const idle = () => !S.sel;
  const top = h('div', { id: 'top' },
    menu('Game', [['New game…', () => hooks.toTitle()], ['Save…', () => D.openSaveLoad('save'), 'save'], ['Load…', () => D.openSaveLoad('load')], '-', ['Give up…', () => concede()], ['Main menu', () => hooks.toTitle()]]),
    menu('Army', [['Next army', () => nextArmy(), '', 'N'], ['Fortify', () => order('fortify'), '', 'F'], ['Done for this turn', () => order('done'), '', 'D'], ['Wake up', () => order('wake'), '', 'W'], '-', ['Disband…', () => order('disband')]]),
    menu('Cities', [['Your cities…', () => D.openCities()], ['Doctrines…', () => D.openDoctrines()]]),
    menu('Reports', [['The realms', () => D.openRealms()], ['Battle history', () => D.openHistory()]]),
    menu('View', [['Zoom in', () => zoom(1.25), '', '+'], ['Zoom out', () => zoom(0.8), '', '−'], ['Whole map', () => S.view.fit()], ['Centre on selection', () => centreSel(), '', 'C'], ['Small map on/off', () => toggleMini(), '', 'M']]),
    menu('Options', [['Options…', () => D.openOptions()]]),
    menu('Help', [['How to play', () => D.openHelp()]]),
    h('span', { class: 'sp' }), h('span', { class: 'turn', id: 'turnlbl' }), h('span', { class: 'realm', id: 'realmlbl' }));
  const stage = h('div', { id: 'stage' },
    h('div', { id: 'mapwrap' }, h('canvas', { id: 'map' }), h('canvas', { id: 'minimap', width: 220, height: 140 }), h('div', { id: 'toast' })),
    h('div', { id: 'panel' }), h('div', { id: 'bottom' }, h('div', { id: 'cards' }), h('div', { id: 'endwrap' }, h('div', { id: 'msg' }), h('button', { class: 'btn pri', id: 'endbtn', onclick: () => endTurnClick() }, 'End turn'))));
  app.append(h('div', { id: 'game', class: 'hidden', style: { position: 'absolute', inset: 0 } }, top, stage), h('div', { id: 'modals' }));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mi')) $$('.mi.open').forEach((x) => x.classList.remove('open')); });
  document.addEventListener('keydown', onKey);
}

// ======================================================================================================================
// starting, resuming and leaving a game
export async function enterGame(g, { resume = false } = {}) {
  skeleton();
  S.g = g; S.meta = g.meta ?? {}; S.me = [...g.realms.values()].find((r) => r.human)?.id ?? [...g.realms.keys()][0]; S.sel = null; S.path = null; S.busy = false;
  $('#title')?.classList.add('hidden'); $('#game').classList.remove('hidden');
  S.view?.destroy();
  const old = $('#map'); const cv = old.cloneNode(false); old.replaceWith(cv);
  const view = new MapView(cv, g, S.assets, { me: S.me, onTile, onHover });
  view.minimapEl = $('#minimap'); S.view = view;
  const mini = $('#minimap'); const mm = (e) => { const r = mini.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * g.width, y = (e.clientY - r.top) / r.height * g.height; view.centerOn(Math.floor(x), Math.floor(y)); };
  mini.onpointerdown = (e) => { mini.setPointerCapture(e.pointerId); mm(e); mini.onpointermove = (ev) => { if (ev.buttons) mm(ev); }; };
  const cap = [...g.cities.values()].find((c) => c.owner === S.me) ?? [...g.cities.values()][0];
  const hero = [...g.armies.values()].find((a) => a.owner === S.me && a.x != null) ;
  view.fit(); const z0 = Math.max(0.9, view.cam.z); view.centerOn((hero ?? cap).x, (hero ?? cap).y, z0);
  hooks.refresh = refresh; hooks.openCity = D.openCity;
  $('#realmlbl').replaceChildren(crest(colorOf(S.me), 18), realmName(S.me));
  refresh(); hooks.ready?.();
  if (resume) { await offers(); selectNextOnStart(); return; }
  await startTurn();
}
function leaveGame() { S.view?.destroy(); S.view = null; $('#game').classList.add('hidden'); closeAllModals(); S.g = null; }
hooks.toTitle = async () => { if (S.g && !S.g.over) D.doAutosave(); leaveGame(); const { showTitle } = await import('./newgame.js'); showTitle(); };
hooks.loadSlot = (slot) => { const r = E.loadFromSlot(D.saveStore, slot); if (!r.ok) { toast('That save could not be loaded: ' + r.reason.replaceAll('-', ' '), 'bad'); return; } hooks.loadGame(r.game); };
hooks.loadGame = (game) => { closeAllModals(); S.view?.destroy(); enterGame(game, { resume: true }); };

// ======================================================================================================================
// the turn
async function startTurn() {
  const g = S.g; const before = new Map(myCities().map((c) => [c.id, c.owner]));
  const ev = E.beginTurn(g, S.me); S.events = ev;
  await continueGoals();
  D.doAutosave(); refresh();
  const notes = [];
  for (const e of ev) {
    if (e.type === 'built') notes.push(`${E.ARMIES[e.armyType].name} finished in ${g.cities.get(e.city).name}.`);
    else if (e.type === 'production-stalled') notes.push(`${g.cities.get(e.city).name} cannot finish: ${e.reason === 'gold' ? 'not enough gold' : 'the garrison is full'}.`);
    else if (e.type === 'woke') notes.push(`${e.armies.length} fortified ${e.armies.length === 1 ? 'army wakes' : 'armies wake'}: an enemy is near.`);
    else if (e.type === 'vector-arrived') notes.push(`New armies arrived in ${g.cities.get(e.city).name}.`);
  }
  const money = ev.find((e) => e.type === 'money'); if (money && money.gold < 0) notes.push('You are out of gold. Armies will desert if you stay in debt.');
  notes.slice(0, 4).forEach((t, i) => setTimeout(() => toast(t, t.includes('cannot') || t.includes('out of gold') ? 'bad' : ''), i * 250));
  await offers(); selectNextOnStart();
}
async function offers() {
  const g = S.g; const realm = g.realms.get(S.me);
  if (realm.heroOffer) { const o = realm.heroOffer; const yes = await D.heroOfferDialog(o); if (yes) { const r = E.acceptHero(g, S.me); if (r.ok) toast(`${o.name} joins you in ${g.cities.get(o.cityId).name}.`, 'good'); } else realm.heroOffer = null; refresh(); }
}
function selectNextOnStart() { const a = E.nextIdle(S.g, S.me, null); if (a) { selectStack(a.x, a.y); S.view.centerOn(a.x, a.y); } else refresh(); }

async function continueGoals() {
  const g = S.g; const groups = new Map();
  for (const a of g.armies.values()) if (a.owner === S.me && a.x != null && a.goal) { const k = `${a.x},${a.y}>${a.goal.x},${a.goal.y}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(a); }
  for (const list of groups.values()) {
    const ids = list.map((a) => a.id).slice(0, g.rules.stackLimit); const goal = list[0].goal;
    const route = E.planRoute(g, ids, goal); if (!route) { list.forEach((a) => delete a.goal); continue; }
    const steps = route.steps.filter((s) => s.action !== 'attack');
    for (const st of steps) { let r; if (st.action === 'embark') r = E.embark(g, ids); else if (st.action === 'disembark') r = E.disembark(g, ids); else r = E.moveGroup(g, ids, st.x, st.y); if (!r.ok) break; }
    const a0 = g.armies.get(ids[0]); if (!a0 || (a0.x === goal.x && a0.y === goal.y)) list.forEach((a) => { delete a.goal; });
  }
}

async function endTurnClick() {
  if (S.busy || !S.g) return;
  const idle = E.idleArmies(S.g, S.me).length;
  if (idle && S.opts.confirmEnd !== false) { if (!(await D.confirmEndTurn(idle))) return; }
  await endTurn();
}
async function endTurn() {
  const g = S.g; S.busy = true; S.sel = null; S.path = null; S.view.sel = null; S.view.path = null; refresh();
  const banner = h('div', { class: 'enemy' }, h('div', { class: 'spin' }), h('span', {}, 'The realms take their turns…')); $('#mapwrap').append(banner);
  const startBattles = g.stats.battles.length; const owned = new Map(myCities().map((c) => [c.id, c.name]));
  const others = E.liveRealms(g).filter((r) => r !== S.me);
  for (const r of others) {
    banner.lastChild.textContent = `${realmName(r)} is playing…`; await sleep(30);
    try { E.beginTurn(g, r); E.aiPlay(g, r); } catch (e) { console.error('AI turn failed for', r, e); }
    S.view.touch();
    if (E.gameStatus(g).over) break;
  }
  banner.remove();
  E.endRound(g); S.busy = false;
  // what happened to me
  const lines = []; const lost = [...owned].filter(([id]) => { const c = g.cities.get(id); return c.owner !== S.me; });
  for (const [id, name] of lost) { const c = g.cities.get(id); lines.push(`${name} ${c.razed ? 'was razed' : 'fell to the ' + realmName(c.owner)}.`); }
  const hits = g.stats.battles.slice(startBattles).filter((b) => b.defender === S.me && !lost.length);
  if (hits.length) lines.push(`${hits.length} attack${hits.length === 1 ? '' : 's'} on your armies or cities.`);
  const st = E.gameStatus(g);
  if (st.over) { S.view.touch(); refresh(); D.openEnd(st); return; }
  await startTurn();
  lines.slice(0, 3).forEach((t, i) => setTimeout(() => toast(t, 'bad'), 600 + i * 300));
  const st2 = E.gameStatus(g); if (st2.over) D.openEnd(st2);
}
async function concede() {
  if (!(await confirmBox({ title: 'Give up?', text: 'Your realm leaves the war and the game ends. You can still look at the map afterwards.', ok: 'Give up', cancel: 'Keep fighting', danger: true }))) return;
  E.concede(S.g, S.me); refresh(); D.openEnd(E.gameStatus(S.g));
}

// ======================================================================================================================
// selection and orders
const ownAt = (x, y) => E.orderedArmiesAt(S.g, x, y, S.me);
const movable = (a) => a.mp > 0 && !a.done && !a.fortified;
function selectStack(x, y, ids = null) {
  const arm = ownAt(x, y); if (!arm.length) { S.sel = null; } else {
    let pick = ids ? arm.filter((a) => ids.includes(a.id)) : arm.filter(movable);
    if (!pick.length) pick = arm.slice(-S.g.rules.stackLimit);
    S.sel = { x, y, ids: pick.slice(-S.g.rules.stackLimit).map((a) => a.id) };
  }
  S.path = null; S.view.sel = S.sel ? { x, y } : null; S.view.path = null; S.view.dirty = true; refresh();
}
const selArmies = () => (S.sel ? S.sel.ids.map((id) => S.g.armies.get(id)).filter(Boolean) : []);
function deselect() { S.sel = null; S.path = null; S.view.sel = null; S.view.path = null; refresh(); }
function nextArmy() {
  if (S.busy) return; const after = S.sel?.ids?.[0] ?? null; const a = E.nextIdle(S.g, S.me, after);
  if (!a) { toast('Every army has its orders. Time to end the turn.'); return; } selectStack(a.x, a.y); S.view.centerOn(a.x, a.y);
}
function order(kind) {
  if (!S.sel || S.busy) return; const ids = S.sel.ids; let r;
  if (kind === 'fortify') r = E.fortify(S.g, S.me, ids); else if (kind === 'done') r = E.markDone(S.g, S.me, ids); else if (kind === 'wake') r = E.wakeUp(S.g, S.me, ids);
  else if (kind === 'disband') { return confirmBox({ title: 'Disband?', text: `${ids.length} ${ids.length === 1 ? 'army' : 'armies'} will be disbanded for good. There is no refund.`, ok: 'Disband', danger: true }).then((y) => { if (y) { const rr = E.disband(S.g, S.me, ids); if (!rr.ok) toast(rr.reason === 'cannot-disband-hero' ? 'Heroes cannot be disbanded.' : 'Could not disband.', 'bad'); deselect(); } }); }
  if (r && !r.ok) { toast(r.reason === 'afloat' ? 'Armies afloat cannot fortify.' : 'That order did not work.', 'bad'); return; }
  S.view.touch(); if (S.opts.autoNext && kind !== 'wake') { const a = E.nextIdle(S.g, S.me, ids[0]); if (a && !(a.x === S.sel.x && a.y === S.sel.y)) { selectStack(a.x, a.y); S.view.centerOn(a.x, a.y); return; } }
  selectStack(S.sel.x, S.sel.y, ids);
}

let lastClick = { t: 0, x: -1, y: -1 };
function onHover(t) { const el = $('#mapwrap'); if (!el) return; el.style.cursor = S.sel && t ? 'crosshair' : 'default'; }
async function onTile(t, info) {
  const g = S.g; if (S.busy || !g || modalOpen()) return; if (t.x < 0 || t.y < 0 || t.x >= g.width || t.y >= g.height) return;
  const pin = S.view.pinAt(info.px, info.py); const tile = pin ?? t; const x = tile.x, y = tile.y;
  const fogHidden = E.fogOn(g) && !E.isExplored(g, S.me, x, y); if (fogHidden && !S.sel) return;
  const city = E.cityAt(g, x, y); const own = ownAt(x, y); const now = performance.now(); const dbl = now - lastClick.t < 380 && lastClick.x === x && lastClick.y === y; lastClick = { t: now, x, y };
  if (info.right && S.sel) return preview(x, y);
  if (S.path && S.path.dest.x === x && S.path.dest.y === y) return execute();
  const onSel = S.sel && S.sel.x === x && S.sel.y === y;
  if (dbl && city && city.owner === S.me) return D.openCity(city.id);
  if (own.length && !onSel && (own.some(movable) || !S.sel)) { selectStack(x, y); return; }
  if (onSel) { if (city && city.owner === S.me && !pin) return D.openCity(city.id); return deselect(); }
  if (city && city.owner === S.me && !S.sel) return D.openCity(city.id);
  if (S.sel) return preview(x, y);
  if (city) return D.openCity(city.id);
}

// ---- route preview and execution -----------------------------------------------------------------------------------
function preview(x, y) {
  const g = S.g; const ids = S.sel.ids; const armies = selArmies(); if (!armies.length) return;
  if (x === S.sel.x && y === S.sel.y) return;
  const search = E.routeSearch(g, ids); const r = E.routeTo(search, { x, y });
  if (!r) { toast('Your armies cannot get there.', 'bad'); S.path = null; S.view.path = null; refresh(); return; }
  const last = r.steps[r.steps.length - 1]; const full = Math.max(1, E.limitingMovePoints(armies.map((a) => ({ ...a, mp: Math.max(a.mp, 1) })))); const mp = E.limitingMovePoints(armies);
  const extra = r.cost <= mp ? 0 : Math.ceil((r.cost - mp) / full); let label = extra === 0 ? 'This turn' : extra === 1 ? 'Next turn' : `In ${extra} turns`; let odds = null;
  if (last.action === 'attack') { odds = oddsFor(armies, x, y); label = odds ? `Attack · ${Math.round(odds.winChance * 100)}%` : 'Attack'; }
  S.path = { dest: { x, y }, steps: r.steps, from: { x: S.sel.x, y: S.sel.y }, cost: r.cost, extra, odds, label, attack: last.action === 'attack' };
  S.view.path = S.path; S.view.dirty = true; refresh();
}
function oddsFor(armies, x, y) {
  const g = S.g; if (E.fogOn(g) && !E.visibleSet(g, S.me).has(E.tileIndex(g, x, y))) return null;
  const foes = E.armiesAt(g, x, y).filter((a) => a.owner !== S.me); const city = E.cityAt(g, x, y);
  const defOwner = foes[0]?.owner ?? city?.owner ?? null; const def = foes.length ? E.orderedArmiesAt(g, x, y, defOwner) : [];
  const att = E.applyCustomOrder(armies, g.realms.get(S.me)?.fightOrder, g.rules);
  if (!def.length) return { winChance: 1, attackerLosses: 0, defenderLosses: 0, empty: true };
  const tile = E.tileAt(g, x, y); const camped = def.every((a) => a.camped || (a.defending && E.hasDoctrine(g.rules, a.owner, 'line'))) && !city;
  try { return E.exactOdds({ attackers: att, defenders: def, tile, cityBonus: E.tileDefenceBonus(g, x, y, S.me), camped, rules: g.rules }); } catch { return null; }
}
async function execute() {
  const p = S.path; if (!p || S.busy) return; const ids = S.sel.ids.slice(); S.busy = true; S.path = null; S.view.path = null; refresh();
  const g = S.g; let stopped = null; let moved = 0;
  for (let i = 0; i < p.steps.length; i++) {
    const st = p.steps[i]; let r;
    if (st.action === 'attack') { await doAttack(ids, st.x, st.y); S.busy = false; afterMove(ids); return; }
    if (st.action === 'embark') r = E.embark(g, ids); else if (st.action === 'disembark') r = E.disembark(g, ids); else r = E.moveGroup(g, ids, st.x, st.y);
    if (!r.ok) { stopped = r.reason; break; }
    moved++; const a0 = g.armies.get(ids[0]); S.sel.x = a0.x; S.sel.y = a0.y; S.view.sel = { x: a0.x, y: a0.y }; S.view.touch();
    const sc = S.view.toScreen(a0.x, a0.y); if (sc.x < 80 || sc.y < 80 || sc.x > S.view.w - 80 || sc.y > S.view.h - 80) S.view.centerOn(a0.x, a0.y);
    await sleep(55);
  }
  S.busy = false;
  if (stopped === 'no-move-points' || (!stopped && false)) { const goal = p.steps.filter((s) => s.action !== 'attack').pop(); if (goal && stopped) { ids.forEach((id) => { const a = g.armies.get(id); if (a) a.goal = { x: goal.x, y: goal.y }; }); toast('The armies will keep marching next turn.'); } }
  else if (stopped) toast('The march was stopped: ' + stopped.replaceAll('-', ' ') + '.', 'bad');
  afterMove(ids);
}
function afterMove(ids) {
  const a0 = ids.map((id) => S.g.armies.get(id)).find(Boolean); S.view.touch();
  if (!a0) { deselect(); return; }
  S.sel = { x: a0.x, y: a0.y, ids: ids.filter((id) => S.g.armies.has(id)) }; S.view.sel = { x: a0.x, y: a0.y };
  const left = selArmies().some(movable);
  if (!left && S.opts.autoNext) { const a = E.nextIdle(S.g, S.me, null); if (a) { selectStack(a.x, a.y); S.view.centerOn(a.x, a.y); return; } }
  refresh();
}
async function doAttack(ids, x, y) {
  const g = S.g; const city = E.cityAt(g, x, y); const foes = E.armiesAt(g, x, y).filter((a) => a.owner !== S.me); const defOwner = foes[0]?.owner ?? city?.owner ?? null; const tile = E.tileAt(g, x, y);
  const res = E.attack(g, ids, x, y, {});
  if (!res.ok) { toast('Cannot attack: ' + res.reason.replaceAll('-', ' ') + '.', 'bad'); return; }
  S.view.touch();
  if (res.battle) await D.showBattle(res, { attacker: S.me, defender: defOwner, place: city?.name ?? null, tile });
  if (res.captureNeeded) { const c = await D.askCapture(res.cityId); const r = E.resolveCapture(g, c); toast(`${r.city.name} ${c === 'raze' ? 'is razed' : 'is yours'}${r.gold ? ` · +${num(r.gold)} gold` : ''}.`, 'good'); }
  else if (res.attackersWon && !res.battle) toast('The way is clear.');
  S.view.touch();
  const st = E.gameStatus(g); if (st.over) { refresh(); D.openEnd(st); }
}

// ======================================================================================================================
// panels
function refresh() {
  if (!S.g) return; const g = S.g; const eco = economy(); const realm = g.realms.get(S.me);
  $('#turnlbl').textContent = `Turn ${g.turn}`;
  S.view?.touch(); renderPanel(eco, realm); renderCards(); renderEnd();
}
function renderPanel(eco, realm) {
  const g = S.g; const p = $('#panel'); const arm = selArmies(); const kids = [];
  kids.push(h('h4', {}, 'Selected'));
  if (arm.length) {
    const top = arm[arm.length - 1]; const heroes = arm.filter(E.isHero).length; const mp = arm.length ? E.limitingMovePoints(arm) : 0; const up = arm.reduce((s, a) => s + E.armyUpkeep(a, g.rules), 0);
    const c = E.cityAt(g, S.sel.x, S.sel.y);
    const title = arm.length === 1 ? unitName(arm[0]) : `${arm.length} armies`;
    kids.push(h('div', { class: 'selbox' }, h('img', { src: medalImg(arm[0].afloat ? 'navy' : top.type, S.me, 128) }), h('div', {}, h('div', { class: 't' }, title),
      h('div', { class: 's' }, c ? `In ${c.name}` : tileName(S.sel.x, S.sel.y), h('br'), `${heroes ? heroes + ' hero · ' : ''}Moves left ${mp}`, h('br'), `Upkeep ${up ? '−' + up : '0'} gold a turn`))));
    kids.push(h('h4', {}, 'Orders'));
    const ob = h('div', { class: 'orders' },
      h('button', { class: 'btn sm', onclick: () => order('fortify') }, 'Fortify'), h('button', { class: 'btn sm', onclick: () => order('done') }, 'Done'),
      h('button', { class: 'btn sm', onclick: () => order('wake'), disabled: !arm.some((a) => a.fortified || a.done) }, 'Wake up'), h('button', { class: 'btn sm', onclick: () => nextArmy() }, 'Next army'),
      c && c.owner === S.me ? h('button', { class: 'btn sm', style: { gridColumn: '1/3' }, onclick: () => D.openCity(c.id) }, `Open ${c.name}`) : null,
      arm.some((a) => a.goal) ? h('button', { class: 'btn sm', style: { gridColumn: '1/3' }, onclick: () => { arm.forEach((a) => delete a.goal); toast('March cancelled.'); refresh(); } }, 'Cancel march') : null);
    kids.push(ob);
    kids.push(h('p', { class: 'hint' }, S.path ? '' : 'Click a square to plan a route. Click it again to go.'));
    if (S.path) kids.push(routeBox(S.path));
  } else {
    kids.push(h('p', { class: 'hint' }, 'Click one of your armies, or press N for the next one that is waiting for orders. Click one of your cities to choose what it builds.'));
  }
  kids.push(h('div', { class: 'grow' }));
  kids.push(h('h4', {}, 'Your realm'));
  kids.push(h('div', { class: 'kv' }, 'Gold', h('b', { class: 'g' }, num(realm.gold))), h('div', { class: 'kv' }, 'Income', h('b', { class: 'p' }, '+' + eco.income)), h('div', { class: 'kv' }, 'Upkeep', h('b', { class: 'n' }, '−' + eco.upkeep)),
    h('div', { class: 'kv' }, 'Cities', h('b', {}, `${myCities().length} of ${[...g.cities.values()].filter((c) => !c.razed).length}`)));
  p.replaceChildren(...kids);
}
function tileName(x, y) { const t = E.tileAt(S.g, x, y); return t.bridge ? 'On a bridge' : t.terrain === 'water' ? 'At sea' : ({ open: t.road ? 'On a road' : 'Open ground', woods: 'In the woods', hills: 'In the hills', mountain: 'In the mountains', swamp: 'In a swamp' }[t.terrain] ?? 'Open ground'); }
function routeBox(p) {
  const g = S.g; const kids = [h('h4', {}, 'Route')];
  const sq = p.steps.filter((s) => s.action !== 'embark' && s.action !== 'disembark').length;
  const box = h('div', { class: 'route' });
  if (p.attack) {
    const city = E.cityAt(g, p.dest.x, p.dest.y); const foes = E.armiesAt(g, p.dest.x, p.dest.y).filter((a) => a.owner !== S.me);
    box.append(h('div', {}, h('b', {}, city ? `Attack ${city.name}` : 'Attack'), foes.length ? ` · ${foes.length} ${foes.length === 1 ? 'army' : 'armies'} of ${theRealm(foes[0].owner)}` : city ? ' · no defenders' : ''));
    if (p.odds && S.opts.odds) { const o = p.odds; box.append(h('div', { class: 'odds' }, h('div', { class: 'bar' }, h('i', { style: { width: Math.round(o.winChance * 100) + '%' } })), h('b', {}, Math.round(o.winChance * 100) + '%')),
      o.empty ? h('div', { style: { color: '#a9bad0', marginTop: '6px', font: '500 12.5px Inter' } }, 'Nobody is defending.') : h('div', { style: { color: '#a9bad0', marginTop: '6px', font: '500 12.5px Inter' } }, `You expect to lose ${o.attackerLosses.toFixed(1)}, they lose ${o.defenderLosses.toFixed(1)}.`)); }
    else if (!p.odds) box.append(h('div', { style: { color: '#a9bad0', marginTop: '6px', font: '500 12.5px Inter' } }, 'You cannot see what defends there.'));
    if (sq > 1) box.append(h('div', { style: { marginTop: '6px', color: '#a9bad0', font: '500 12.5px Inter' } }, `${p.label.startsWith('Attack') ? '' : ''}Move ${sq - 1} squares first.`));
  } else box.append(h('div', {}, h('b', {}, `${sq} ${sq === 1 ? 'square' : 'squares'}`), ` · ${p.label.toLowerCase()}`), p.steps.some((s) => s.action === 'embark') ? h('div', { style: { marginTop: '4px', color: '#a9bad0', font: '500 12.5px Inter' } }, 'The route takes to the boats.') : null);
  kids.push(box, h('div', { class: 'orders', style: { marginTop: '8px' } }, h('button', { class: 'btn sm pri', onclick: () => execute() }, p.attack ? 'Attack' : 'Go'), h('button', { class: 'btn sm', onclick: () => { S.path = null; S.view.path = null; S.view.dirty = true; refresh(); } }, 'Cancel')));
  return h('div', {}, ...kids);
}
function renderCards() {
  const g = S.g; const c = $('#cards'); const arm = S.sel ? ownAt(S.sel.x, S.sel.y) : []; const on = new Set(S.sel?.ids ?? []);
  if (!arm.length) { c.replaceChildren(h('div', { class: 'hint', style: { alignSelf: 'center', margin: 0 } }, 'No army selected.')); return; }
  c.replaceChildren(...arm.slice(0, 32).map((a) => {
    const d = E.ARMIES[a.type]; const tag = a.afloat ? 'AFLOAT' : a.fortified ? 'FORTIFIED' : a.done ? 'DONE' : a.goal ? 'MARCHING' : a.mp <= 0 ? 'SPENT' : '';
    return h('button', { class: 'ucard' + (on.has(a.id) ? ' sel' : '') + (!movable(a) ? ' dim' : ''), onclick: () => { if (S.busy) return; const ids = new Set(S.sel.ids); if (ids.has(a.id)) { if (ids.size > 1) ids.delete(a.id); } else if (ids.size < g.rules.stackLimit) ids.add(a.id); else { toast('A group is at most 8 armies.'); return; } S.sel.ids = arm.filter((q) => ids.has(q.id)).map((q) => q.id); S.path = null; S.view.path = null; refresh(); } },
      h('div', { class: 'top' }, h('img', { src: medalImg(a.afloat ? 'navy' : a.type, S.me, 96) }), h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' } }, tag ? h('span', { class: 'tag' }, tag) : null, pipsRow(a))),
      h('div', {}, h('div', { class: 'nm' }, unitName(a)), h('div', { class: 'st' }, E.isHero(a) ? `Hero L${a.level} · M ${a.mp}` : `S ${d.str} · M ${a.mp}`)));
  }));
}
function pipsRow(a) { const mx = E.maxPips(a, S.g.rules), cur = E.pipsOf(a, S.g.rules); return h('div', { class: 'pips' }, Array.from({ length: mx }, (_, i) => h('i', { class: i < cur ? '' : 'w' }))); }
function renderEnd() {
  const idle = S.g ? E.idleArmies(S.g, S.me).length : 0; const b = $('#endbtn'); b.disabled = S.busy;
  $('#msg').textContent = S.path ? `${S.path.attack ? 'Attack' : 'March'}: ${S.path.label}. Click the square again to confirm.` : S.sel ? `Selected: ${selArmies().length} ${selArmies().length === 1 ? 'army' : 'armies'}${E.cityAt(S.g, S.sel.x, S.sel.y) ? ' in ' + E.cityAt(S.g, S.sel.x, S.sel.y).name : ''}.` : idle ? `${idle} ${idle === 1 ? 'army is' : 'armies are'} waiting for orders.` : 'Every army has its orders.';
}

// ======================================================================================================================
// view helpers and keys
function zoom(f) { const v = S.view; v.zoomAt(v.w / 2, v.h / 2, v.cam.z * f); }
function centreSel() { if (S.sel) S.view.centerOn(S.sel.x, S.sel.y); }
function toggleMini() { const m = $('#minimap'); m.classList.toggle('hidden'); }
function onKey(e) {
  if (!S.g || $('#game').classList.contains('hidden')) return; if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'Escape') { if (modalOpen()) { topModal()?.close(); return; } if (S.path) { S.path = null; S.view.path = null; S.view.dirty = true; refresh(); } else if (S.sel) deselect(); return; }
  if (modalOpen() || S.busy) return;
  const k = e.key.toLowerCase();
  if (k === 'n' || k === ' ' || k === 'tab') { e.preventDefault(); nextArmy(); } else if (k === 'f') order('fortify'); else if (k === 'd') order('done'); else if (k === 'w') order('wake');
  else if (k === 'enter') { if (S.path) execute(); } else if (k === 'e') endTurnClick(); else if (k === 'c') centreSel(); else if (k === 'm') toggleMini();
  else if (k === '+' || k === '=') zoom(1.25); else if (k === '-' || k === '_') zoom(0.8);
  else if (k === 'delete') order('disband');
  else if (k.startsWith('arrow')) { e.preventDefault(); const d = 90 / S.view.cam.z; if (k === 'arrowleft') S.view.cam.x -= d; if (k === 'arrowright') S.view.cam.x += d; if (k === 'arrowup') S.view.cam.y -= d; if (k === 'arrowdown') S.view.cam.y += d; S.view.clamp(); S.view.dirty = true; }
}
export function setup(assets) { S.assets = assets; try { Object.assign(S.opts, JSON.parse(localStorage.getItem('hq-opts') ?? '{}')); } catch {} skeleton(); }
