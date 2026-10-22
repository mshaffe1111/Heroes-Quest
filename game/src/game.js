// The game controller: selection, moving, attacking, the panels and the turn loop.
import * as E from '../../engine/src/index.js';
import { generateMap } from '../../engine/src/mapgen/index.js';
import { S, hooks, theRealm, medalImg, realmOf, colorOf, unitName, realmName, myCities, economy, unitLine } from './state.js';
import { MapView, loadAssets, realmHex } from './view.js';
import { h, $, $$, toast, sleep, openModal, frame, closeAllModals, modalOpen, topModal, crest, num, confirmBox, plural, toggleFullscreen, fsButton } from './ui.js';
import * as D from './dialogs.js';
import { TP } from './paint.js';
import { initAudio, sfx, stepSound, setScene } from './audio.js';
import * as PB from './playback.js';

// ======================================================================================================================
// building a new game
export const SIZES = { 60: [150, 96], 100: [190, 120], 140: [230, 146] };
export function newGame(o) {
  const [W, H] = SIZES[o.cities] ?? SIZES[60];
  const map = generateMap({ shape: o.shape, seed: o.seed, width: W, height: H, cities: o.cities, realms: 8 });
  const { game: g } = E.mapToGame(map, { neutrals: o.neutrals ?? 'strong', ...(o.realmIds ? { realmIds: o.realmIds } : {}) });
  g.rules.fog = !!o.fog; g.rules.classic = !!o.classic;
  const ids = [...g.realms.keys()]; const me = o.realm && g.realms.has(o.realm) ? o.realm : ids[0];
  g.realms.get(me).human = true;
  for (const id of ids) if (id !== me) E.setDifficulty(g, id, o.difficulty ?? 'medium');
  E.assignSkills(g);
  const hero = [...g.armies.values()].find((a) => a.owner === me && a.type === 'hero'); if (hero && o.heroName) hero.name = o.heroName.slice(0, 20); if (hero && o.portrait) hero.portrait = o.portrait;
  g.meta = { difficulty: o.difficulty ?? 'medium', shape: o.shape, seed: o.seed, cities: o.cities, rivals: ids.length - 1, unsworn: o.neutrals ?? 'strong', startedAt: Date.now() };
  return g;
}

// ======================================================================================================================
// the page skeleton
let skeletonMade = false;
function skeleton() {
  if (skeletonMade) return; skeletonMade = true;
  const app = $('#app');
  const menu = (title, items) => h('div', { class: 'mi' }, h('button', { class: 'mb', onclick: (e) => { e.stopPropagation(); const mi = e.currentTarget.parentElement; const was = mi.classList.contains('open'); $$('.mi.open').forEach((x) => x.classList.remove('open')); if (!was) { mi.classList.add('open'); const dd = mi.querySelector('.dd'), r = e.currentTarget.getBoundingClientRect(); dd.style.left = Math.max(6, Math.min(r.left, innerWidth - dd.offsetWidth - 6)) + 'px'; dd.style.top = r.bottom + 'px'; dd.style.maxHeight = (innerHeight - r.bottom - 8) + 'px'; } } }, title),
    h('div', { class: 'dd' }, items.map((it) => it === '-' ? h('hr') : h('button', { 'data-act': it[2] ?? '', onclick: () => { $$('.mi.open').forEach((x) => x.classList.remove('open')); it[1](); } }, h('span', {}, it[0]), it[3] ? h('kbd', {}, it[3]) : null))));
  const idle = () => !S.sel;
  const MENUS = [['Game', [['New game…', () => hooks.toTitle()], ['Save…', () => D.openSaveLoad('save'), 'save'], ['Load…', () => D.openSaveLoad('load')], '-', ['Give up…', () => concede()], ['Main menu', () => hooks.toTitle()]]],
    ['Army', [['Next army', () => nextArmy(), '', 'N'], ['Fortify', () => order('fortify'), '', 'F'], ['Done for this turn', () => order('done'), '', 'D'], ['Wake up', () => order('wake'), '', 'W'], '-', ['Disband…', () => order('disband')]]],
    ['Cities', [['Your cities…', () => D.openCities()], ['Doctrines…', () => D.openDoctrines()]]],
    ['Reports', [['The realms', () => D.openRealms()], ['Battle history', () => D.openHistory()]]],
    ['View', [['Full screen', () => toggleFullscreen(), '', 'F11'], '-', ['Zoom in', () => zoom(1.25), '', '+'], ['Zoom out', () => zoom(0.8), '', '−'], ['Whole map', () => S.view.fit()], ['Centre on selection', () => centreSel(), '', 'C'], ['Small map on/off', () => toggleMini(), '', 'M']]],
    ['Options', [['Options…', () => D.openOptions()]]],
    ['Help', [['How to play', () => D.openHelp()]]]];
  PHONE.menus = MENUS;
  const top = h('div', { id: 'top' }, ...MENUS.map(([t, items]) => menu(t, items)),
    h('span', { class: 'sp' }), fsButton('bar'), h('span', { class: 'turn', id: 'turnlbl' }), h('span', { class: 'realm', id: 'realmlbl' }));
  const ic = (n) => h('img', { src: `play/assets/ui/icons/${n}.svg`, alt: '' });
  // phones: one slim bar (menu, turn, realm, gold, this turn's news) instead of the menu bar
  const ptop = h('div', { id: 'ptop' }, h('button', { class: 'pmenu', 'aria-label': 'Menu', onclick: () => phoneMenu() }, h('i'), h('i'), h('i')),
    h('span', { class: 'pturn', id: 'pturn' }), h('span', { id: 'pcrest' }), h('span', { class: 'sp' }), h('span', { class: 'pgold', id: 'pgold' }),
    fsButton('pfs'), h('button', { class: 'pbell', id: 'pbell', 'aria-label': 'This turn', onclick: () => phoneNews() }, ic('bell'), h('b', { id: 'pbelln' })));
  // every command is a button (Matt: nothing hidden in menus). short = the label on phones; ph = shown on phones (false: the map has its own zoom buttons)
  const cmd = (icon, label, key, fn, id, short = label, ph = true) => h('button', { class: 'btn cmd' + (ph ? ' ph' : ' noph'), id: id ?? null, onclick: () => { if (!S.busy) fn(); } }, ic(icon), h('span', { class: 'lg' }, label), h('span', { class: 'sh' }, short), key ? h('kbd', {}, key) : null);
  const openHere = () => cityButton();
  const stage = h('div', { id: 'stage' },
    h('div', { id: 'mapwrap' }, h('canvas', { id: 'map' }), h('div', { id: 'toast' }), h('div', { class: 'zoombtns' }, h('button', { class: 'btn ibtn', 'aria-label': 'Zoom in', onclick: () => zoom(1.25) }, ic('zoomin')), h('button', { class: 'btn ibtn', 'aria-label': 'Zoom out', onclick: () => zoom(0.8) }, ic('zoomout')))),
    h('div', { id: 'status' }, h('div', { id: 'msg' })),
    h('div', { id: 'bottom' }, h('div', { id: 'cards' }), h('div', { id: 'gmove' }, h('small', {}, 'Group move'), h('b', { id: 'gmoveval' }, '–'), h('span', {}, 'The slowest army sets it'))),
    h('aside', { id: 'side' },
      h('div', { id: 'minislot' }, h('canvas', { id: 'minimap', width: 440, height: 280 }), h('span', { class: 'minihint' }, 'Tap to jump · drag to look'), h('button', { class: 'btn sm', id: 'wholemap', onclick: () => S.view.fit() }, ic('map'), 'Whole map', h('kbd', {}, 'M'))),
      h('div', { id: 'realmstrip' }),
      h('div', { id: 'cmds' },
        cmd('next', 'Next army', 'N', () => nextArmy(), 'cmdnext', 'Next'), cmd('fortify', 'Fortify', 'F', () => order('fortify'), 'cmdfort'), cmd('done', 'Done', 'D', () => order('done'), 'cmddone'), cmd('wake', 'Wake', 'W', () => order('wake'), 'cmdwake'),
        cmd('city', 'Open city', 'Enter', openHere, 'cmdcity', 'City'), cmd('list', 'Your cities', '', () => D.openCities(), 'cmdcities', 'Cities'), cmd('disband', 'Disband', 'Del', () => order('disband'), 'cmddisband'), cmd('centre', 'Centre', 'C', () => centreSel(), 'cmdcentre'),
        cmd('zoomin', 'Zoom in', '+', () => zoom(1.25), null, 'Zoom in', false), cmd('zoomout', 'Zoom out', '−', () => zoom(0.8), null, 'Zoom out', false), cmd('map', 'Whole map', 'M', () => S.view.fit(), 'cmdmap', 'Map'), cmd('scroll', 'Reports', '', () => D.openRealms(), 'cmdrep'),
        cmd('hero', 'Hero', '', () => nextHero(), 'cmdhero'), cmd('ruin', 'Search', 'S', () => searchHere(), 'cmdsearch'), cmd('search', 'Army info', 'I', () => { const a = selArmies(); if (a.length) armySheet(ownAt(S.sel.x, S.sel.y), a[0].id); else toast('Select an army first.'); }, 'cmdinfo', 'Info')),
      h('div', { id: 'panel' }),
      h('div', { id: 'events' }),
      h('div', { id: 'endwrap' }, h('div', { id: 'miniord' }, h('button', { class: 'btn sm', onclick: () => order('fortify') }, 'Fortify'), h('button', { class: 'btn sm', onclick: () => order('done') }, 'Done'), h('button', { class: 'btn sm', onclick: () => nextArmy() }, 'Next'), h('button', { class: 'btn sm', onclick: openHere }, 'City')),
        h('button', { class: 'btn pri', id: 'endbtn', onclick: () => endTurnClick() }, ic('hourglass_dark'), 'End turn', h('kbd', {}, 'E')))));
  app.append(h('div', { id: 'game', class: 'hidden', style: { position: 'absolute', inset: 0 } }, top, ptop, stage), h('div', { id: 'modals' }));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mi')) $$('.mi.open').forEach((x) => x.classList.remove('open')); });
  document.addEventListener('keydown', onKey);
  placeLayout(); addEventListener('resize', placeLayout);
}
/** Three layouts from the approved board: the full screen (desk), a phone held sideways (pl: big map, slim column on the right with
 *  End turn always in view) and a phone held upright (pp: small map across the top, big map, army row, four commands, End turn). */
function placeLayout() {
  const mode = innerWidth > 860 && innerHeight > 560 ? 'desk' : innerWidth > innerHeight ? 'pl' : 'pp';
  document.body.classList.toggle('pl', mode === 'pl'); document.body.classList.toggle('pp', mode === 'pp'); PHONE.mode = mode;
  const mini = $('#minimap'), end = $('#endwrap');
  if (mini.parentElement.id !== 'minislot') $('#minislot').prepend(mini); if (end.parentElement.id !== 'side') $('#side').append(end);
  S.view?.resize?.(); S.view && (S.view.dirty = true);
}

// ======================================================================================================================
// starting, resuming and leaving a game
export async function enterGame(g, { resume = false } = {}) {
  skeleton();
  S.g = g; S.meta = g.meta ?? {}; S.me = [...g.realms.values()].find((r) => r.human)?.id ?? [...g.realms.keys()][0]; S.sel = null; S.path = null; S.busy = false;
  S.goFull?.(); hooks.stopTitle?.(); document.body.classList.add('ingame'); $('#title')?.classList.add('hidden'); $('#game').classList.remove('hidden'); setScene('map');
  S.view?.destroy();
  const old = $('#map'); const cv = old.cloneNode(false); old.replaceWith(cv);
  const view = new MapView(cv, g, S.assets, { me: S.me, onTile, onHover });
  view.minimapEl = $('#minimap'); S.view = view; document.body.classList.toggle('nomini', !!S.opts.miniOff);
  const mini = $('#minimap'); mini.height = Math.round(mini.width * g.height / g.width);      // the small map keeps the world's shape
  // where the picture really sits inside the element (object-fit: contain leaves bands at the sides), so a tap lands on the right square
  const mm = (e) => { const r = mini.getBoundingClientRect(); const fit = getComputedStyle(mini).objectFit; const k = fit === 'contain' ? Math.min(r.width / mini.width, r.height / mini.height) : fit === 'cover' ? Math.max(r.width / mini.width, r.height / mini.height) : null;
    const dw = k ? mini.width * k : r.width, dh = k ? mini.height * k : r.height, ox = r.left + (r.width - dw) / 2, oy = r.top + (r.height - dh) / 2;
    const x = Math.max(0, Math.min(g.width - 1, (e.clientX - ox) / dw * g.width)), y = Math.max(0, Math.min(g.height - 1, (e.clientY - oy) / dh * g.height)); view.centerOn(Math.floor(x), Math.floor(y)); };
  mini.onpointerdown = (e) => { mini.setPointerCapture(e.pointerId); mm(e); mini.onpointermove = (ev) => { if (ev.buttons) mm(ev); }; };
  const cap = [...g.cities.values()].find((c) => c.owner === S.me) ?? [...g.cities.values()][0];
  const hero = [...g.armies.values()].find((a) => a.owner === S.me && a.x != null) ;
  view.fit(); const z0 = Math.max(0.9, view.cam.z); view.centerOn((hero ?? cap).x, (hero ?? cap).y, z0);
  hooks.refresh = refresh; hooks.openCity = D.openCity;
  $('#realmlbl').replaceChildren(crest(colorOf(S.me), 18), realmName(S.me));
  refresh(); hooks.ready?.();
  if (resume) { selectNextOnStart(); await offers(); return; }
  await startTurn();
}
function leaveGame() { document.body.classList.remove('ingame'); S.view?.destroy(); S.view = null; $('#game').classList.add('hidden'); closeAllModals(); S.g = null; }
hooks.toTitle = async () => { if (S.busy) { toast('The other realms are still playing. Wait a moment.'); return; } if (S.g && !S.g.over) D.doAutosave(); leaveGame(); const { showTitle } = await import('./newgame.js'); showTitle(); };
hooks.loadSlot = (slot) => { S.goFull?.(); if (S.busy) { toast('The other realms are still playing. Wait a moment.'); return; } const r = E.loadFromSlot(D.saveStore, slot); if (!r.ok) { toast('That save could not be loaded: ' + r.reason.replaceAll('-', ' '), 'bad'); return; } hooks.loadGame(r.game); };
hooks.loadGame = (game) => { closeAllModals(); S.view?.destroy(); enterGame(game, { resume: true }); };

// ======================================================================================================================
// the turn
async function startTurn() {
  const g = S.g; const before = new Map(myCities().map((c) => [c.id, c.owner]));
  const ev = E.beginTurn(g, S.me); S.events = ev;
  await continueGoals();
  D.doAutosave(); refresh(); if (!g.realms.get(S.me).heroOffer) sfx('chime');
  const notes = [];
  for (const e of ev) {
    if (e.type === 'built') notes.push(`${E.ARMIES[e.armyType].name} finished in ${g.cities.get(e.city).name}.`);
    else if (e.type === 'production-stalled' && e.reason !== 'debt') notes.push(`${g.cities.get(e.city).name} cannot finish: ${e.reason === 'gold' ? 'not enough gold' : 'the garrison is full'}.`);
    else if (e.type === 'quest-done') notes.push(`Quest complete: ${e.text}. ${rewardText(e.reward)}`);
    else if (e.type === 'quest-impossible') notes.push(`Quest over: ${e.text} can no longer be done.`);
    else if (e.type === 'woke') notes.push(`${e.armies.length} fortified ${e.armies.length === 1 ? 'army wakes' : 'armies wake'}: an enemy is near.`);
    else if (e.type === 'vector-arrived') notes.push(`New armies arrived in ${g.cities.get(e.city).name}.`);
  }
  const money = ev.find((e) => e.type === 'money'); if (money && money.gold < 0) notes.push('You are out of gold. Your cities cannot start new armies until your gold is above zero.');
  S.notes = notes.slice(); renderEvents();
  notes.slice(0, 4).forEach((t, i) => setTimeout(() => toast(t, t.includes('cannot') || t.includes('out of gold') ? 'bad' : ''), i * 250));
  selectNextOnStart();
  const idleCities = myCities().filter((c) => !c.building).length; const hasArmies = [...g.armies.values()].some((q) => q.owner === S.me && q.x != null);
  if (!hasArmies && myCities().length) setTimeout(() => toast('You have no armies. Open a city and choose what it builds.', 'bad'), 700);
  else if (idleCities) setTimeout(() => toast(`${idleCities} of your cities ${idleCities === 1 ? 'is' : 'are'} not building anything.`), 1000);
  await offers();
}
async function offers() {
  const g = S.g; const realm = g.realms.get(S.me);
  if (realm.heroOffer) { sfx('hero'); const o = realm.heroOffer; const yes = await D.heroOfferDialog(o); if (yes) { const r = E.acceptHero(g, S.me); if (r.ok) toast(`${o.name} joins you in ${g.cities.get(o.cityId).name}.`, 'good'); } else realm.heroOffer = null; refresh(); }
}
/** Where the player's attention belongs right now: the first army that wants orders, else any army of theirs, else their capital. */
function homeSpot() {
  const g = S.g; const idle = nextWaiting(null); if (idle) return { x: idle.x, y: idle.y, idle: true };
  const mine = [...g.armies.values()].find((a) => a.owner === S.me && a.x != null); if (mine) return { x: mine.x, y: mine.y };
  const c = myCities()[0] ?? [...g.cities.values()].find((c) => c.owner === S.me); return c ? { x: c.x, y: c.y } : null;
}
function lookHome() { const p = homeSpot(); if (!p) return; const z = S.view.cam.z; S.view.centerOn(p.x, p.y, z < 0.5 ? 0.9 : z); }
function selectNextOnStart() { const p = homeSpot(); if (p?.idle) selectStack(p.x, p.y); else refresh(); lookHome(); }

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
  const idle = waiting().length; const idleCities = myCities().filter((c) => !c.building).length;      // an army marching on a route has its orders
  if ((idle || idleCities) && S.opts.confirmEnd !== false) { if (!(await D.confirmEndTurn(idle, idleCities))) return; }
  await endTurn();
}
async function endTurn() {
  try { await endTurnInner(); } finally { S.busy = false; E.setBattleHook(null); }       // FIX: an exception anywhere below used to leave the whole page dead
}
async function endTurnInner() {
  sfx('gong'); const g = S.g; S.busy = true; S.sel = null; S.path = null; S.view.sel = null; S.view.path = null; refresh();
  const banner = h('div', { class: 'enemy' }, h('div', { class: 'spin' }), h('span', {}, 'The realms take their turns…')); $('#mapwrap').append(banner);
  const startBattles = g.stats.battles.length; const onMe = []; E.setBattleHook((b) => { if (b.defender === S.me && b.attacker !== S.me) onMe.push(b); });
  const owned = new Map(myCities().map((c) => [c.id, c.name]));
  const others = E.liveRealms(g).filter((r) => r !== S.me);
  // Enemy turns you can watch: each computer realm plays its whole turn at once, then playback shows what the player could have seen
  banner.style.display = 'none'; PB.open(); const timing = [];
  try {
    for (const r of others) {
      PB.say(r, 'is planning its turn…'); await sleep(30);
      const events = []; E.setActionHook((e) => events.push(e)); let built = []; const visBefore = E.fogOn(g) ? E.visibleSet(g, S.me) : null; const c0 = performance.now();
      try { built = (E.beginTurn(g, r) ?? []).filter((e) => e.type === 'built'); E.aiPlay(g, r); } catch (e) { console.error('AI turn failed for', r, e); } finally { E.setActionHook(null); }
      const c1 = performance.now(); S.view?.touch();
      try { await PB.playRealm(g, r, events, built, visBefore); } catch (e) { console.error('playback failed for', r, e); S.view.ghosts = []; S.view.hide = null; S.view.cityOverride = null; }
      timing.push({ r, compute: Math.round(c1 - c0), events: events.length, play: Math.round(performance.now() - c1) });
      if (E.gameStatus(g).over) break;
    }
  } finally { PB.close(); window.HQ_LASTROUND = timing; }
  banner.remove(); E.setBattleHook(null);
  E.endRound(g);
  S.busy = false;
  // what happened to me
  const lines = []; const lost = [...owned].filter(([id]) => { const c = g.cities.get(id); return c.owner !== S.me; });
  for (const [id, name] of lost) { const c = g.cities.get(id); lines.push(`${name} ${c.razed ? 'was razed' : 'fell to the ' + realmName(c.owner)}.`); }
  const hits = g.stats.battles.slice(startBattles).filter((b) => b.defender === S.me && !lost.length);
  if (hits.length) lines.push(`${hits.length} attack${hits.length === 1 ? '' : 's'} on your armies or cities.`);
  const st = E.gameStatus(g);
  if (st.over) { S.view.touch(); refresh(); D.openEnd(st); return; }
  await startTurn();
  if (lost.length) setTimeout(() => sfx('lost'), 500);
  lines.slice(0, 3).forEach((t, i) => setTimeout(() => toast(t, 'bad', true), 600 + i * 300));
  const st2 = E.gameStatus(g); if (st2.over) D.openEnd(st2);
}
async function ruinsDialog(city) {
  const cost = S.g.rules.rebuildRazedCityCost; const gold = S.g.realms.get(S.me).gold;
  const yes = await confirmBox({ title: `${city.name} lies in ruins`, text: `You can raise it again for ${num(cost)} gold (you have ${num(gold)}). Your armies are standing in the ruins.`, ok: gold >= cost ? 'Rebuild' : 'Leave it', cancel: 'Leave it' });
  if (yes && gold >= cost) { const r = E.rebuildCity(S.g, S.me, city.id); if (r.ok) { toast(`${city.name} is rebuilt.`, 'good'); S.view.touch(); await new Promise((done) => D.openCity(city.id, { onClose: done })); } }
}
async function concede() {
  if (S.busy) return;
  if (!(await confirmBox({ title: 'Give up?', text: 'Your realm leaves the war and the game ends. You can still look at the map afterwards.', ok: 'Give up', cancel: 'Keep fighting', danger: true }))) return;
  E.concede(S.g, S.me); refresh(); D.openEnd(E.gameStatus(S.g));
}

// ======================================================================================================================
// selection and orders
const ownAt = (x, y) => E.orderedArmiesAt(S.g, x, y, S.me);
/** Armies that really wait for orders: idle in the engine's sense and not marching on a route the player already gave. */
const waiting = () => E.idleArmies(S.g, S.me).filter((a) => !a.goal);
const nextWaiting = (afterId) => { const l = waiting(); if (!l.length) return null; const n = afterId ? Number(String(afterId).slice(1)) : -1; return l.find((a) => Number(a.id.slice(1)) > n) ?? l[0]; };
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
  if (S.busy) return; const idle = waiting();
  if (!idle.length) { toast('Every army has its orders. Time to end the turn.'); return; }
  const num = (a) => Number(a.id.slice(1)); const sel = S.sel;
  const elsewhere = sel ? idle.filter((a) => a.x !== sel.x || a.y !== sel.y) : idle;      // FIX: skip the square we are already on
  const here = sel ? Math.min(...selArmies().map(num), Infinity) : -1;
  const a = elsewhere.find((q) => num(q) > here) ?? elsewhere[0] ?? idle[0];
  sfx('select'); selectStack(a.x, a.y); S.view.centerOn(a.x, a.y);
}
function order(kind) {
  if (!S.sel || S.busy) return; const ids = S.sel.ids; let r; if (kind !== 'disband') sfx('order');
  if (kind === 'fortify') r = E.fortify(S.g, S.me, ids); else if (kind === 'done') r = E.markDone(S.g, S.me, ids); else if (kind === 'wake') r = E.wakeUp(S.g, S.me, ids);
  else if (kind === 'disband') { return confirmBox({ title: 'Disband?', text: `${ids.length} ${ids.length === 1 ? 'army' : 'armies'} will be disbanded for good. There is no refund.`, ok: 'Disband', danger: true }).then((y) => { if (y) { const rr = E.disband(S.g, S.me, ids); if (!rr.ok) toast(rr.reason === 'cannot-disband-hero' ? 'Heroes cannot be disbanded.' : 'Could not disband.', 'bad'); deselect(); } }); }
  if (r && !r.ok) { toast(r.reason === 'afloat' ? 'Armies afloat cannot fortify.' : 'That order did not work.', 'bad'); return; }
  S.view.touch();
  if (kind === 'wake') { selectStack(S.sel.x, S.sel.y, ids); return; }
  // an order rests only the selected armies (at most 8): carry straight on with whatever is still idle, on this square first
  const rest = waiting().filter((a) => !ids.includes(a.id));
  const here = rest.filter((a) => a.x === S.sel.x && a.y === S.sel.y);
  if (here.length) { selectStack(S.sel.x, S.sel.y); toast(`${here.length} more ${here.length === 1 ? 'army' : 'armies'} here still ${here.length === 1 ? 'has' : 'have'} no orders.`); return; }
  if (S.opts.autoNext && rest.length) { const a = nextWaiting(ids[0]); if (a) { selectStack(a.x, a.y); S.view.centerOn(a.x, a.y); return; } }
  selectStack(S.sel.x, S.sel.y, ids);
  if (!rest.length) toast('Every army has its orders. End the turn when you are ready.');
}

let lastClick = { t: 0, x: -1, y: -1 };
function onHover(t) { const el = $('#mapwrap'); if (!el) return; el.style.cursor = S.sel && t ? 'crosshair' : 'default'; }
async function onTile(t, info) {
  const g = S.g; if (S.busy || !g || modalOpen()) return; if (t.x < 0 || t.y < 0 || t.x >= g.width || t.y >= g.height) return;
  // a tap on a city's name always opens that city (even where an army medal overlaps it); a tap on its castle counts as a tap on its square
  const hit = S.view.cityHitAt?.(info.px, info.py);
  const pin = hit?.kind === 'label' ? null : S.view.pinAt(info.px, info.py);
  const ch = !pin ? hit : null;
  if (ch && ch.kind === 'label' && !info.hold) { const c = g.cities.get(ch.id); if (c && (c.owner === S.me || !E.fogOn(g) || E.visibleSet(g, S.me).has(E.tileIndex(g, c.x, c.y)))) { sfx('select'); return D.openCity(c.id); } }
  const snap = !pin && !ch && S.sel && !E.cityAt(g, t.x, t.y) && !E.armiesAt(g, t.x, t.y).length ? S.view.roadSnap(info.px, info.py) : null;      // a tap beside the road means the road
  const tile = pin ?? (ch ? { x: ch.x, y: ch.y } : null) ?? snap ?? t; const x = tile.x, y = tile.y;
  const fogHidden = E.fogOn(g) && !E.isExplored(g, S.me, x, y); if (fogHidden && !S.sel) return;
  const city = E.cityAt(g, x, y); const own = ownAt(x, y); const now = performance.now(); const dbl = now - lastClick.t < 380 && lastClick.x === x && lastClick.y === y; lastClick = { t: now, x, y };
  // press and hold: select the armies there (or open your city if none stand in it)
  const foes = E.armiesAt(g, x, y).filter((a) => a.owner !== S.me); const seeFoes = foes.length && (!E.fogOn(g) || E.visibleSet(g, S.me).has(E.tileIndex(g, x, y)));
  if (info.hold) { if (own.length) { sfx('select'); selectStack(x, y); } else if (seeFoes) enemySheet(x, y); else if (city && city.owner === S.me) D.openCity(city.id); return; }
  if (info.right && S.sel) return preview(x, y);
  if (S.path && S.path.dest.x === x && S.path.dest.y === y) return execute();
  const onSel = S.sel && S.sel.x === x && S.sel.y === y;
  if (onSel) { if (city && city.owner === S.me) return D.openCity(city.id); return deselect(); }      // tap the selected armies again: inside your city that opens the city
  if (dbl && city && city.owner === S.me) return D.openCity(city.id);
  if (city && city.owner === S.me && !pin && !(S.sel && selArmies().some(movable))) return D.openCity(city.id);      // the castle itself: open the city (the army medal selects the armies)
  if (own.length) {
    const canGo = S.sel && selArmies().some(movable);
    if (!canGo) { sfx('select'); selectStack(x, y); return; }      // nothing selected (or it cannot move): pick these armies
    return preview(x, y);                                          // otherwise: march over and join them (hold to pick them instead)
  }
  if (city && city.owner === S.me && !S.sel) return D.openCity(city.id);
  if (S.sel) return preview(x, y);
  if (seeFoes && !city) return enemySheet(x, y);      // nothing selected: tapping an enemy army shows what is in it
  if (city && city.owner !== S.me && E.fogOn(g) && !E.visibleSet(g, S.me).has(E.tileIndex(g, x, y))) {      // FIX (fog): no live garrison/owner for a city out of sight
    const k = E.knownCity(g, S.me, city); toast(k ? `${city.name}: ${k.owner ? 'held by ' + realmName(k.owner) : 'Unsworn'} when last seen (turn ${k.turn}).` : `${city.name}: nothing is known about it.`); return;
  }
  if (city) return D.openCity(city.id);
}

// ---- route preview and execution -----------------------------------------------------------------------------------
function preview(x, y) {
  const g = S.g; const ids = S.sel.ids; const armies = selArmies(); if (!armies.length) return;
  if (x === S.sel.x && y === S.sel.y) return;
  const search = E.routeSearch(g, ids); const r = E.routeTo(search, { x, y });
  if (!r) { toast('Your armies cannot get there.', 'bad'); S.path = null; S.view.path = null; refresh(); return; }
  const last = r.steps[r.steps.length - 1]; const { turnAt, extra } = marchTurns(armies, r.steps);
  const squares = r.steps.filter((s) => s.action !== 'embark' && s.action !== 'disembark').length; const straight = Math.max(Math.abs(x - S.sel.x), Math.abs(y - S.sel.y));
  const why = squares > straight * 2 + 2 ? ' · the way goes around' : extra >= 2 && r.steps.some((s) => { const t = E.tileAt(g, s.x, s.y); return t && !t.road && !t.cityId && (t.terrain === 'woods' || t.terrain === 'hills'); }) ? ' · woods and hills are slow' : '';
  const when = extra === 0 ? 'This turn' : extra === 1 ? 'Next turn' : `In ${extra} turns`; let label = when + (extra >= 2 ? ` · ${squares} squares${why}` : ''); let odds = null;
  if (last.action === 'attack') {
    odds = oddsFor(armies, x, y); label = odds && S.opts.odds !== false ? `Attack · ${Math.round(odds.winChance * 100)}%` : 'Attack';
    // FIX: the attack step itself needs move points (the target square's cost); say so instead of failing later with a 2-second toast
    if (r.steps.length === 1 && !E.canPay(armies, E.groupMoveCost(armies, E.tileAt(g, x, y), g.rules))) label += ' · not enough moves left';
  }
  // FIX (fog): a square the player cannot see is shown as a plain march; the engine's 'attack' flag (and the foe count/realm) would reveal what is hiding there
  const hiddenAttack = last.action === 'attack' && E.fogOn(g) && !E.visibleSet(g, S.me).has(E.tileIndex(g, x, y));
  if (hiddenAttack) { label = when; odds = null; }
  let join = false;
  if (last.action !== 'attack') { const there = ownAt(x, y).filter((a) => !ids.includes(a.id)); if (there.length) { join = true; const cap = E.armyLimitAt(g, x, y); const cty = E.cityAt(g, x, y); const room = cap - there.length;
    label = room >= ids.length ? `Join ${there.length} ${there.length === 1 ? 'army' : 'armies'}${cty ? ' in ' + cty.name : ''} · ${when}` : `Full: ${cty ? cty.name : 'that square'} holds ${cap} armies and has ${there.length}. Send ${Math.max(0, room)} at most`; } }
  S.path = { dest: { x, y }, steps: r.steps, from: { x: S.sel.x, y: S.sel.y }, cost: r.cost, extra, turnAt, odds, label, join, attack: last.action === 'attack' && !hiddenAttack, hiddenAttack };
  S.view.path = S.path; S.view.dirty = true; refresh();
}
/** Walk the route turn by turn the way the march really goes: this turn's move points first, then a full turn's worth each turn; taking to
 *  the boats, stepping off them and coming ashore each end that turn's move. Returns the turn (0 = this one) each step is reached in. */
function marchTurns(armies, steps) {
  const g = S.g; const full = Math.max(1, Math.min(...armies.map((a) => E.moveOf(a, g.rules)))); let mp = E.limitingMovePoints(armies); let afloat = armies.every((a) => a.afloat);
  let turn = 0; const turnAt = [];
  for (const s of steps) {
    if (s.action === 'embark' || s.action === 'disembark') { if (mp <= 0) { turn++; } afloat = s.action === 'embark'; mp = 0; turnAt.push(turn); continue; }
    const c = E.groupMoveCost(armies.map((a) => ({ ...a, afloat })), E.tileAt(g, s.x, s.y), g.rules); const need = Number.isFinite(c) ? c : full;
    if (mp < need) { turn++; mp = full; }
    mp = Math.max(0, mp - need); if (s.action === 'land') { afloat = false; mp = 0; }
    turnAt.push(turn);
  }
  return { turnAt, extra: turnAt.length ? turnAt[turnAt.length - 1] : 0 };
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
  const p = S.path; if (!p || S.busy) return;
  try { await executeInner(p); } catch (e) { console.error('execute failed', e); toast('Something went wrong with that order.', 'bad'); S.busy = false; afterMove(S.sel?.ids ?? []); } finally { S.busy = false; }
}
async function executeInner(p) { const ids = S.sel.ids.slice(); S.busy = true; S.path = null; S.view.path = null; refresh();
  const g = S.g; let stopped = null; let moved = 0;
  for (let i = 0; i < p.steps.length; i++) {
    const st = p.steps[i]; let r;
    if (st.action === 'attack' && p.hiddenAttack) { toast('Something is waiting there. Plan your attack.'); break; }      // FIX (fog): stop at the edge of the unknown instead of attacking blind
    if (st.action === 'attack') { await doAttack(ids, st.x, st.y); S.busy = false; afterMove(ids); return; }
    if (st.action === 'embark') r = E.embark(g, ids); else if (st.action === 'disembark') r = E.disembark(g, ids); else r = E.moveGroup(g, ids, st.x, st.y);
    if (!r.ok) { stopped = r.reason; break; }
    moved++; stepSound(); const a0 = g.armies.get(ids[0]); S.sel.x = a0.x; S.sel.y = a0.y; S.view.sel = { x: a0.x, y: a0.y }; S.view.touch();
    if (S.opts.follow !== false) S.view.centerOn(a0.x, a0.y);      // the camera stays on what is moving, as in the original
    else { const sc = S.view.toScreen(a0.x, a0.y); if (sc.x < 80 || sc.y < 80 || sc.x > S.view.w - 80 || sc.y > S.view.h - 80) S.view.centerOn(a0.x, a0.y); }
    await sleep(20 + (100 - (S.opts.moveSpeed ?? 60)) * 2.2);
  }
  S.busy = false;
  if (stopped === 'no-move-points' || (!stopped && false)) { const goal = p.steps.filter((s) => s.action !== 'attack').pop(); if (goal && stopped) { ids.forEach((id) => { const a = g.armies.get(id); if (a) a.goal = { x: goal.x, y: goal.y }; }); toast('The armies will keep marching next turn.'); } }
  else if (stopped === 'stack-limit') toast(`No room: a square or city holds at most ${g.rules.stackLimit} armies. Leave some behind (tap them in the army row) and try again.`, 'bad');
  else if (stopped) toast('The march was stopped: ' + stopped.replaceAll('-', ' ') + '.', 'bad');
  afterMove(ids);
}
function afterMove(ids) {
  const a0 = ids.map((id) => S.g.armies.get(id)).find(Boolean); S.view.touch();
  if (!a0) { deselect(); if (S.opts.autoNext) { const n = nextWaiting(null); if (n) { selectStack(n.x, n.y); S.view.centerOn(n.x, n.y); } else selectNextOnStart(); } return; }      // FIX: the attackers all died: still hand the player the next army (or the capital)
  S.sel = { x: a0.x, y: a0.y, ids: ids.filter((id) => S.g.armies.has(id)) }; S.view.sel = { x: a0.x, y: a0.y };
  const site = E.siteAt(S.g, a0.x, a0.y);
  if (site && !site.explored && selArmies().some(E.isHero) && (site.kind === 'ruin' || site.kind === 'temple' || site.kind === 'library')) { refresh(); setTimeout(() => searchHere(), 250); return; }
  const left = selArmies().some((a) => movable(a) && !a.goal);
  if (!left && S.opts.autoNext) { const a = nextWaiting(null); if (a) { selectStack(a.x, a.y); S.view.centerOn(a.x, a.y); return; } }
  refresh();
}
async function doAttack(ids, x, y) {
  const g = S.g; const city = E.cityAt(g, x, y); const foes = E.armiesAt(g, x, y).filter((a) => a.owner !== S.me); const defOwner = foes[0]?.owner ?? city?.owner ?? null; const tile = E.tileAt(g, x, y);
  const res = E.attack(g, ids, x, y, {});
  if (!res.ok) { toast('Cannot attack: ' + res.reason.replaceAll('-', ' ') + '.', 'bad'); return; }
  S.view.touch();
  if (res.battle) await D.showBattle(res, { attacker: S.me, defender: defOwner, place: city?.name ?? null, tile });
  if (res.captureNeeded) {
    const c = await D.askCapture(res.cityId); const r = E.resolveCapture(g, c); sfx(c === 'raze' ? 'fall' : 'capture'); if (r.gold) setTimeout(() => sfx('coin'), 500);
    toast(`${r.city.name} ${c === 'raze' ? 'is razed' : 'is yours'}${r.gold ? ` · +${num(r.gold)} gold` : ''}.`, 'good');
    // FIX: take the player straight into the city (production, garrison) instead of leaving them on the map
    S.view.centerOn(r.city.x, r.city.y); S.view.touch(); refresh();
    if (c === 'raze') await ruinsDialog(r.city); else await new Promise((done) => D.openCity(r.city.id, { onClose: done }));
  }
  else if (res.attackersWon && !res.battle) toast('The way is clear.');
  S.view.touch();
  const st = E.gameStatus(g); if (st.over) { refresh(); D.openEnd(st); }
}

// ======================================================================================================================
// panels
function refresh() {
  if (!S.g) return; const g = S.g; const eco = economy(); const realm = g.realms.get(S.me);
  $('#turnlbl').textContent = `Turn ${g.turn}`;
  $('#pturn').textContent = `Turn ${g.turn}`; $('#pcrest').replaceChildren(crest(colorOf(S.me), 22)); $('#pgold').replaceChildren(h('b', {}, num(realm.gold)), h('em', { class: eco.income - eco.upkeep >= 0 ? 'p' : 'n' }, `${eco.income - eco.upkeep >= 0 ? '+' : '−'}${Math.abs(eco.income - eco.upkeep)}`));
  const nn = (S.notes ?? []).length; $('#pbelln').textContent = nn ? String(nn) : ''; $('#pbell').classList.toggle('has', !!nn);
  S.view?.touch(); renderPanel(eco, realm); renderCards(); renderEnd(); renderEvents();
}
function renderPanel(eco, realm) {
  const g = S.g; const p = $('#panel'); const arm = selArmies(); const kids = [];
  if (arm.length) {
    const top = arm[arm.length - 1]; const heroes = arm.filter(E.isHero).length; const mp = E.limitingMovePoints(arm); const up = arm.reduce((s, a) => s + E.armyUpkeep(a, g.rules), 0);
    const c = E.cityAt(g, S.sel.x, S.sel.y);
    const title = arm.length === 1 ? unitName(arm[0]) : `${arm.length} armies`;
    kids.push(h('div', { class: 'selbox' }, h('img', { src: medalImg(arm[0].afloat ? 'navy' : top.type, S.me, 128) }), h('div', {}, h('div', { class: 't' }, title),
      h('div', { class: 's' }, c ? `In ${c.name}` : tileName(S.sel.x, S.sel.y), ` · ${heroes ? heroes + ' hero · ' : ''}moves ${mp} · upkeep ${up ? '−' + up : '0'}`))));
    if (arm.some((a) => a.goal)) kids.push(h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => { arm.forEach((a) => delete a.goal); toast('March cancelled.'); refresh(); } }, 'Cancel march'));
    if (S.path) kids.push(routeBox(S.path));
  } else kids.push(h('p', { class: 'hint' }, 'Click one of your armies, or press N for the next one waiting for orders. Click one of your cities to choose what it builds.'));
  p.replaceChildren(...kids);
  // command tiles that need something to act on
  const c = S.sel && E.cityAt(g, S.sel.x, S.sel.y);
  const set = (id, off) => { const b = $(id); if (b) b.disabled = !!off; };
  set('#cmdwake', !arm.some((a) => a.fortified || a.done)); set('#cmddisband', !arm.length); set('#cmdcity', false);
  $('#cmdcity .lg').textContent = c && c.owner === S.me ? `Open ${c.name}` : 'Open city';
  // the realm strip
  $('#realmstrip').replaceChildren(
    h('div', {}, h('small', {}, 'Gold'), h('b', {}, num(realm.gold))), h('div', {}, h('small', {}, 'Income'), h('b', { class: 'p' }, '+' + eco.income)),
    h('div', {}, h('small', {}, 'Upkeep'), h('b', { class: 'n' }, '−' + eco.upkeep)), h('div', {}, h('small', {}, 'Cities'), h('b', {}, `${myCities().length}`, h('em', {}, ` / ${[...g.cities.values()].filter((q) => !q.razed).length}`))));
  // group move under the army cards
  $('#gmoveval').textContent = arm.length ? String(E.limitingMovePoints(arm)) : '–';
}
function renderEvents() {
  const el = $('#events'); if (!el) return; const notes = S.notes ?? []; const idle = S.g ? waiting().length : 0;
  const tone = (t) => (/cannot|out of gold|lost|fell|attacked/.test(t) ? 'bad' : /finished|arrived|healed|took/.test(t) ? 'good' : '');
  el.replaceChildren(h('div', { class: 'eh' }, h('img', { src: 'play/assets/ui/icons/bell.svg', alt: '' }), h('span', {}, 'This turn')),
    ...(notes.length ? notes.slice(0, 5).map((t) => h('div', { class: 'ev ' + tone(t) }, t)) : [h('div', { class: 'ev dim' }, 'Nothing new this turn.')]),
    h('div', { class: 'ef' }, h('img', { src: 'play/assets/ui/icons/flag.svg', alt: '' }), h('span', {}, idle ? `${idle} ${idle === 1 ? 'stack can' : 'stacks can'} still move` : 'Every army has its orders'), idle ? h('kbd', {}, 'N for the next') : null));
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
  } else box.append(h('div', {}, h('b', {}, `${sq} ${sq === 1 ? 'square' : 'squares'}`), ` · ${p.label.toLowerCase()}`), ...(p.steps.some((s) => s.action === 'embark') ? [h('div', { style: { marginTop: '4px', color: '#a9bad0', font: '500 12.5px Inter' } }, 'The route takes to the boats.')] : []));
  kids.push(box, h('div', { class: 'orders', style: { marginTop: '8px' } }, h('button', { class: 'btn sm pri', onclick: () => execute() }, p.attack ? 'Attack' : 'Go'), h('button', { class: 'btn sm', onclick: () => { S.path = null; S.view.path = null; S.view.dirty = true; refresh(); } }, 'Cancel')));
  return h('div', {}, ...kids);
}
function renderCards() {
  const g = S.g; const c = $('#cards'); const arm = S.sel ? ownAt(S.sel.x, S.sel.y) : []; const on = new Set(S.sel?.ids ?? []);
  if (!arm.length) { c.replaceChildren(h('div', { class: 'hint', style: { alignSelf: 'center', margin: 0 } }, 'No army selected.')); return; }
  c.replaceChildren(...arm.slice(0, 32).map((a) => {
    const d = E.ARMIES[a.type]; const tag = a.afloat ? 'AFLOAT' : a.fortified ? 'FORTIFIED' : a.done ? 'DONE' : a.goal ? 'MARCHING' : a.mp <= 0 ? 'SPENT' : '';
    let held = false, timer = 0;      // press and hold a card: what this army is
    const press = () => { held = false; clearTimeout(timer); timer = setTimeout(() => { held = true; armySheet(arm, a.id); }, 450); }; const release = () => clearTimeout(timer);
    return h('button', { class: 'ucard' + (on.has(a.id) ? ' sel' : '') + (!movable(a) ? ' dim' : ''), onpointerdown: press, onpointerup: release, onpointerleave: release, onpointercancel: release, oncontextmenu: (e) => e.preventDefault(), onclick: () => { if (S.busy || held) return; if (S.sel.ids.length === 1 && S.sel.ids[0] === a.id) { armySheet(arm, a.id); return; } const ids = new Set(S.sel.ids); if (ids.has(a.id)) { if (ids.size > 1) ids.delete(a.id); } else if (ids.size < g.rules.stackLimit) ids.add(a.id); else { toast('A group is at most 8 armies.'); return; } S.sel.ids = arm.filter((q) => ids.has(q.id)).map((q) => q.id); S.path = null; S.view.path = null; refresh(); } },
      h('div', { class: 'top' }, h('img', { src: medalImg(a.afloat ? 'navy' : a.type, S.me, 96) }), h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' } }, tag ? h('span', { class: 'tag' }, tag) : null, pipsRow(a))),
      h('div', {}, h('div', { class: 'nm' }, unitName(a)), h('div', { class: 'st' }, E.isHero(a) ? `Hero L${a.level} · M ${a.mp}` : `S ${d.str} · M ${a.mp}`)));
  }), h('button', { class: 'uinfo', 'aria-label': 'What are these armies?', onclick: () => armySheet(arm, S.sel?.ids?.[0]) }, h('b', {}, 'i'), h('span', {}, 'Info')));
}
// ---- what an army is: the info sheet (tap the Info button, tap a lone selected army, or press and hold any army card) ----------------
const LETTERS = { O: 'open ground', R: 'on roads', W: 'woods', H: 'hills', C: 'cities and ruins' };
const where = (on) => (on ?? []).map((l) => LETTERS[l] ?? l).join(' and ');
function abilities(a) {
  const d = E.ARMIES[a.type]; const out = [];
  if (d.fly) out.push('Flies: crosses water and mountains. A group flies only if every army in it can (a hero may ride along).');
  if (d.moveBonus) out.push(`Moves through ${where(d.moveBonus)} at the open-ground cost, and the whole group with it.`);
  if (d.indiv) out.push(`+${d.indiv.amount} strength for itself when fighting in ${where(d.indiv.on)}.`);
  if (d.stack) out.push(`+${d.stack.amount} strength to every army in its group${d.stack.on ? ' when fighting in ' + where(d.stack.on) : ''}.`);
  if (d.enemySubtract) out.push(`Takes ${d.enemySubtract} off the strength of every enemy army in the fight.`);
  if (d.cancelCity) out.push('Cancels the defence bonus of a city it attacks.');
  if (d.cancelHero) out.push("Cancels the enemy heroes' bonus to their group.");
  if (d.cancelNonHero) out.push("Cancels the enemy armies' group bonuses.");
  if (d.special) out.push('A rare army: it cannot be built in a city.');
  return out;
}
/** What an enemy stack holds. Easy and Medium show every army; Hard and Expert only the army in front and how many there are. */
function enemySheet(x, y) {
  const g = S.g; const foes = E.armiesAt(g, x, y).filter((a) => a.owner !== S.me); if (!foes.length) return;
  const owner = foes[0].owner; const ord = E.orderedArmiesAt(g, x, y, owner); const lvl = g.meta?.difficulty ?? 'medium'; const full = lvl === 'easy' || lvl === 'medium';
  const top = E.displayArmy(ord) ?? ord[ord.length - 1]; const show = full ? ord.slice().reverse() : [top]; const cty = E.cityAt(g, x, y);
  let m; const close = () => m.close();
  const card = (a) => { const hero = E.isHero(a); const mx = E.maxPips(a, g.rules), cur = E.pipsOf(a, g.rules);
    const rows = [['Strength', String(E.baseStrength(a, g.rules))], ['Health', `${cur} of ${mx}`], ['Moves', String(E.moveOf(a, g.rules))]]; if (hero) rows.unshift(['Level', String(a.level)]);
    const ab = hero ? [] : abilities(a);
    return h('div', { class: 'acard' + (hero ? ' hero' : '') }, h('div', { class: 'ahead' }, h('img', { src: medalImg(a.afloat ? 'navy' : a.type, a.owner, 96), alt: '' }), h('div', {}, h('b', {}, unitName(a)), h('small', {}, hero ? 'Enemy hero' : 'Army'))),
      h('div', { class: 'arows' }, rows.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, v)))), ab.length ? h('ul', { class: 'aab' }, ab.map((t) => h('li', {}, t))) : null); };
  m = openModal(frame([h('div', { class: 'eyebrow' }, owner ? realmName(owner) : 'The Unsworn'), h('h2', { style: { fontSize: '24px', margin: '2px 0 4px' } }, `${ord.length} ${ord.length === 1 ? 'army' : 'armies'}${cty ? ' in ' + cty.name : ' here'}`),
    h('p', { class: 'sub', style: { margin: '0 0 10px' } }, full ? 'Strongest first. They fight weakest first, so the strongest comes last.' : `On ${lvl === 'hard' ? 'Hard' : 'Expert'} you only see the army in front. ${ord.length > 1 ? `${ord.length - 1} more stand behind it.` : ''}`),
    h('div', { class: 'acards' }, show.map(card)), h('div', { class: 'foot' }, S.sel ? h('button', { class: 'btn', onclick: () => { close(); preview(x, y); } }, 'Plan an attack') : null, h('button', { class: 'btn pri', onclick: close }, 'Close'))], { width: 560, onClose: close, cls: 'sheet' }));
}
function armySheet(arm, focusId = null) {
  const g = S.g; if (!arm?.length) return; let m; const close = () => m.close();
  const status = (a) => (a.afloat ? 'At sea' : a.fortified ? 'Fortified' : a.goal ? 'Marching on a route' : a.done ? 'Done for this turn' : a.mp <= 0 ? 'No moves left this turn' : 'Ready for orders');
  const card = (a) => {
    const hero = E.isHero(a); const d = E.ARMIES[a.type]; const mx = E.maxPips(a, g.rules), cur = E.pipsOf(a, g.rules);
    const rows = [['Strength', String(E.baseStrength(a, g.rules)) + (a.blessings ? ` (blessed +${a.blessings})` : '')], ['Moves', `${a.mp} of ${E.moveOf(a, g.rules)} left this turn`], ['Health', `${cur} of ${mx}`], ['Upkeep', `${E.armyUpkeep(a, g.rules)} gold a turn`]];
    if (hero) { const th = g.rules.heroXpThresholds ?? []; const next = th[a.level]; rows.unshift(['Level', `${a.level}${next != null ? ` · ${a.xp} of ${next} experience to level ${a.level + 1}` : ' (the highest)'}`]);
      const cmd = (E.naturalCommand?.(E.heroCoreStrength(a, g.rules)) ?? 0) + (E.heroCommandItems?.(a) ?? 0); if (cmd) rows.push(['Leads', `+${cmd} strength to every army in his group`]); }
    const q = hero ? g.realms.get(a.owner)?.quest : null; const questLine = q && q.heroId === a.id ? [`Quest: ${q.text}${q.goal ? ` (${q.progress ?? 0} of ${q.goal})` : ''}. ${rewardText(q.reward)}`] : [];
    const extra = hero ? [...questLine, ...(a.items ?? []).map((it) => `Carries ${it.name ?? E.ITEMS?.[it.key]?.name ?? 'an item'}`), ...(a.perks ?? []).map((k) => `${E.PERKS?.[k]?.name ?? k}: ${E.PERKS?.[k]?.text ?? ''}`)] : abilities(a);
    return h('div', { class: 'acard' + (a.id === focusId ? ' focus' : '') + (hero ? ' hero' : '') },
      h('div', { class: 'ahead' }, h('img', { src: medalImg(a.afloat ? 'navy' : a.type, a.owner, 96), alt: '' }), h('div', {}, h('b', {}, unitName(a)), h('small', {}, hero ? 'Hero' + (a.portrait ? '' : '') : d.special ? 'Rare army' : 'Army'), h('em', {}, status(a)))),
      h('div', { class: 'arows' }, rows.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, v)))),
      extra.length ? h('ul', { class: 'aab' }, extra.map((t) => h('li', {}, t))) : h('p', { class: 'sub', style: { margin: '6px 0 0' } }, 'No special abilities.'));
  };
  const order = focusId ? [...arm.filter((a) => a.id === focusId), ...arm.filter((a) => a.id !== focusId)] : arm;
  m = openModal(frame([h('div', { class: 'eyebrow' }, arm.length === 1 ? 'Army' : `${arm.length} armies here`), h('h2', { style: { fontSize: '24px', margin: '2px 0 10px' } }, arm.length === 1 ? unitName(arm[0]) : 'Who is in this group'), h('div', { class: 'acards' }, order.map(card)),
    h('div', { class: 'foot' }, h('button', { class: 'btn pri', onclick: close }, 'Close'))], { width: 560, onClose: close, cls: 'sheet' }));
}
function pipsRow(a) { const mx = E.maxPips(a, S.g.rules), cur = E.pipsOf(a, S.g.rules); return h('div', { class: 'pips' }, Array.from({ length: mx }, (_, i) => h('i', { class: i < cur ? '' : 'w' }))); }
function renderEnd() {
  const idle = S.g ? waiting().length : 0; const b = $('#endbtn'); b.disabled = S.busy;
  const odds = S.path?.attack && S.path.odds && S.opts.odds && !S.path.odds.empty && !S.path.label.includes('%') ? ` · ${Math.round(S.path.odds.winChance * 100)}% to win` : '';
  const tapWord = PHONE.mode === 'desk' ? 'Click' : 'Tap';
  const inCity = S.sel && E.cityAt(S.g, S.sel.x, S.sel.y); const myCity = inCity && inCity.owner === S.me;
  $('#msg').textContent = S.path ? `${S.path.attack ? '' : S.path.join ? '' : 'March: '}${S.path.label}${odds}. ${tapWord} the square again to confirm${S.path.join ? ' · hold to pick them instead' : S.path.attack ? ' · hold to see who is there' : ''}.` :
    S.sel && myCity ? `Selected: ${selArmies().length} ${selArmies().length === 1 ? 'army' : 'armies'} in ${inCity.name}. ${tapWord} them again to open the city.` : S.sel ? `Selected: ${selArmies().length} ${selArmies().length === 1 ? 'army' : 'armies'}${E.cityAt(S.g, S.sel.x, S.sel.y) ? ' in ' + E.cityAt(S.g, S.sel.x, S.sel.y).name : ''}.` : idle ? `${idle} ${idle === 1 ? 'army is' : 'armies are'} waiting for orders.` : 'Every army has its orders.';
}

// ======================================================================================================================
// view helpers and keys
function zoom(f) { const v = S.view; v.zoomAt(v.w / 2, v.h / 2, v.cam.z * f); }
function centreSel() { if (S.sel) S.view.centerOn(S.sel.x, S.sel.y); }
// ---- ruins, temples and libraries: the Search button (or stopping on one with a hero) ---------------------------------------------------
const SITE_NAME = { ruin: 'ruin', temple: 'temple', library: 'library', tower: 'mage tower' };
function rewardText(rw) { if (!rw) return ''; return rw.kind === 'gold' ? `Reward: ${num(rw.gold)} gold.` : rw.kind === 'item' ? `Reward: ${E.ITEMS?.[rw.itemKey]?.name ?? 'a magic item'}.` : rw.kind === 'ally' ? `Reward: ${E.ARMIES[rw.type]?.name ?? 'a rare army'} joins you.` : rw.kind === 'hero' ? 'Reward: a hero joins you.' : rw.kind === 'stronghold' ? 'Reward: the way to a hidden stronghold.' : ''; }
function sceneCard(img, eyebrow, title, body, buttons) {
  return new Promise((resolve) => {
    let m; const done = (v) => { resolve(v); m.close(); };      // resolve first: close() fires onClose, which would answer null
    m = openModal(frame([img ? h('img', { class: 'scene', src: `play/assets/scenes/${img}.webp`, alt: '' }) : null, h('div', { class: 'eyebrow' }, eyebrow), h('h2', { style: { fontSize: '26px', margin: '4px 0 8px' } }, title), ...[].concat(body).filter(Boolean),
      h('div', { class: 'foot' }, buttons.map(([label, v, pri]) => h('button', { class: 'btn' + (pri ? ' pri' : ''), onclick: () => done(v) }, label)))].filter(Boolean), { width: 560, onClose: () => done(null), cls: 'sheet scenecard' }), { onClose: () => resolve(null) });
  });
}
async function searchHere() {
  const g = S.g; if (!S.sel) { toast('Select a group with a hero, standing on a ruin, temple or library.'); return; }
  const arm = selArmies(); const x = S.sel.x, y = S.sel.y; const site = E.siteAt(g, x, y); const hero = arm.find(E.isHero);
  if (!site) { toast('There is nothing to search here. March a group with a hero onto a ruin, temple or library.'); return; }
  const ids = arm.map((a) => a.id); const what = SITE_NAME[site.kind] ?? 'place';
  if (site.kind === 'ruin') {
    if (site.explored) { toast('This ruin has already been searched. Nothing is left.'); return; }
    if (!hero) { toast('Only a hero can search a ruin. Bring a hero here.'); return; }
    const guard = site.guardian ?? 'giant'; const p = Math.round(100 * E.ruinWinChance(hero, guard, arm.length - 1, g.rules));
    const go = await sceneCard('ruin', 'A ruin', `Search the ruin?`, [h('p', { class: 'sub' }, `${((n) => (/^[aeiou]/i.test(n) ? 'An ' : 'A ') + n)(E.ARMIES[guard]?.name ?? 'monster')} guards it. ${hero.name ?? 'Your hero'} goes in alone; the armies with him raise his chances.`),
      h('div', { class: 'odds big' }, h('div', { class: 'bar' }, h('i', { style: { width: p + '%' } })), h('b', {}, `${p}%`)), h('p', { class: 'sub', style: { margin: '8px 0 0' } }, 'If he loses, he dies and the ruin stays unsearched. If he wins: gold, a magic item, an ally, a sage — or, rarely, a captive hero.')],
      [['Not now', false], ['Search', true, true]]);
    if (!go) return;
    const r = E.exploreRuin(g, ids); S.view.touch();
    if (!r.ok) { toast('The search did not happen: ' + r.reason.replaceAll('-', ' '), 'bad'); return; }
    if (r.outcome === 'died') { sfx('defeat'); await sceneCard('defeat', 'The ruin', `${hero.name ?? 'Your hero'} has fallen`, h('p', { class: 'sub' }, `The ${E.ARMIES[guard]?.name ?? 'guardian'} was too strong. Whatever he carried lies in the ruin. The ruin is still unsearched.`), [['Continue', true, true]]); }
    else if (r.outcome === 'sage') {
      sfx('victory'); const pick = await sceneCard('sage', 'Deep in the ruin', 'A sage offers a gift', h('p', { class: 'sub' }, 'Choose one.'), r.options.map((o, i) => [o.kind === 'gold' ? `${num(o.gold)} gold` : o.kind === 'item' ? (E.ITEMS?.[o.itemKey]?.name ?? 'A magic item') : 'The way to a stronghold', i, i === 0]));
      const rs = E.resolveSage(g, pick ?? 0); toast(rs.ok ? 'The sage’s gift is yours.' : 'The sage is gone.', 'good');
    } else {
      sfx('victory'); const body = r.outcome === 'gold' ? `${num(r.gold)} gold for your treasury.` : r.outcome === 'item' ? `${hero.name ?? 'Your hero'} takes ${r.item?.name ?? 'a magic item'}${r.item?.strength ? ` (+${r.item.strength} strength)` : r.item?.command ? ` (+${r.item.command} to his group)` : ''}.` : r.outcome === 'ally' ? `${E.ARMIES[r.type]?.name ?? 'A rare army'} joins your group.` : r.outcome === 'hero' ? `${r.name ?? 'A hero'} was held captive here, and joins your realm.` : '';
      await sceneCard(r.outcome === 'hero' ? 'heroffer' : 'ruin', 'The ruin is searched', r.outcome === 'gold' ? 'Treasure' : r.outcome === 'item' ? 'A magic item' : r.outcome === 'ally' ? 'An ally' : r.outcome === 'hero' ? 'A hero joins you' : 'Searched', [h('p', { class: 'sub' }, body), h('p', { class: 'sub' }, `${hero.name ?? 'Your hero'} gains experience.`)], [['Continue', true, true]]);
    }
  } else if (site.kind === 'temple') {
    const r = E.visitTemple(g, ids); if (!r.ok) { toast('Nothing happens here.'); return; }
    sfx('chime'); await sceneCard('quest', 'A temple', r.blessed ? `${r.blessed} ${r.blessed === 1 ? 'army is' : 'armies are'} blessed` : 'You have been blessed here before', h('p', { class: 'sub' }, r.blessed ? 'Each blessed army fights one strength higher from now on. A temple blesses each army only once.' : 'Each army can be blessed once at each temple. Bring new armies.'), [['Continue', true, true]]);
    const offer = g.realms.get(S.me).questOffer;
    if (offer) { const yes = await sceneCard('quest', 'The priests have a quest', offer.text, [h('p', { class: 'sub' }, `For ${g.armies.get(offer.heroId)?.name ?? 'your hero'}. ${rewardText(offer.reward)}`), h('p', { class: 'sub' }, 'You can hold one quest at a time. It ends if the hero dies.')], [['Decline', false], ['Accept the quest', true, true]]);
      if (yes) { E.acceptQuest(g, S.me); toast('Quest accepted: ' + offer.text, 'good'); } else E.declineQuest(g, S.me); }
  } else if (site.kind === 'library') {
    if (!hero) { toast('Only a hero can study at a library.'); return; }
    const r = E.studyLibrary(g, ids); if (!r.ok) { toast(r.reason === 'already-studied' ? `${hero.name ?? 'This hero'} has already studied here.` : 'Nothing to study here.'); return; }
    sfx('chime'); await sceneCard('levelup', 'A library', `${hero.name ?? 'Your hero'} studies`, h('p', { class: 'sub' }, `+${r.xp} experience${r.levels ? ` · now level ${hero.level}` : ''}.`), [['Continue', true, true]]);
  } else { toast(`The ${what} is sealed. Nothing to find here yet.`); return; }
  S.view.touch(); refresh(); D.doAutosave();
}
/** The City button: the city your selected armies stand in; otherwise your city nearest the middle of the map view (Next city cycles). */
function cityButton() {
  const g = S.g; const c = S.sel && E.cityAt(g, S.sel.x, S.sel.y); if (c && c.owner === S.me) return D.openCity(c.id);
  const mine = myCities(); if (!mine.length) { toast('You have no cities. Take one by marching into it.'); return; }
  const v = S.view; const cx = (v.cam.x + v.w / 2 / v.cam.z) / TP, cy = (v.cam.y + v.h / 2 / v.cam.z) / TP;
  const best = mine.slice().sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy))[0];
  D.openCity(best.id, { list: mine.map((q) => q.id) });
}
// ---- phones ------------------------------------------------------------------------------------------------------------
const PHONE = { mode: 'desk', menus: [] };
function sheet(title, groups) {
  let m; const close = () => m.close();
  const body = groups.flatMap(([head, items]) => [head ? h('div', { class: 'sec' }, head) : null, h('div', { class: 'sheetbtns' }, items.filter((it) => it !== '-').map((it) => h('button', { class: 'btn', onclick: () => { close(); it[1](); } }, it[0].replace('…', ''))))]);
  m = openModal(frame([h('h2', { style: { fontSize: '24px', marginBottom: '6px' } }, title), ...body], { width: 520, onClose: close, cls: 'sheet' }));
}
function phoneMenu() { sheet('Menu', PHONE.menus.filter(([t]) => t !== 'Army')); }
function phoneMore() {
  const openHere = () => { const c = S.sel && E.cityAt(S.g, S.sel.x, S.sel.y); if (c && c.owner === S.me) D.openCity(c.id); else D.openCities(); };
  sheet('More orders', [['This army', [['Wake up', () => order('wake')], ['Centre on it', () => centreSel()], ['Disband', () => order('disband')], ...(PHONE.mode === 'pp' ? [['Hero', () => nextHero()], ['Open city', () => cityButton()]] : [])]],
    ['The realm', [['Your cities', () => D.openCities()], ['Doctrines', () => D.openDoctrines()], ['The realms', () => D.openRealms()], ['Battle history', () => D.openHistory()]]], ['The map', [['Whole map', () => S.view.fit()], ['Zoom in', () => zoom(1.25)], ['Zoom out', () => zoom(0.8)]]]]);
}
function phoneNews() {
  const notes = S.notes ?? []; let m; const close = () => m.close();
  m = openModal(frame([h('div', { class: 'eyebrow' }, `Turn ${S.g.turn}`), h('h2', { style: { fontSize: '24px', margin: '4px 0 10px' } }, 'This turn'), ...(notes.length ? notes.map((t) => h('p', { class: 'sub', style: { margin: '0 0 8px' } }, '◆ ', t)) : [h('p', { class: 'sub' }, 'Nothing new this turn.')])], { width: 520, onClose: close }));
}
/** Select the next of your heroes (and centre on it). */
function nextHero() {
  const hs = [...S.g.armies.values()].filter((a) => a.owner === S.me && E.isHero(a) && a.x != null); if (!hs.length) { toast('You have no hero on the map.'); return; }
  const cur = S.sel?.ids?.find((id) => S.g.armies.get(id) && E.isHero(S.g.armies.get(id))); const i = hs.findIndex((a) => a.id === cur); const a = hs[(i + 1) % hs.length];
  selectStack(a.x, a.y); centreSel(); refresh();
}
/** The small map on or off. Off gives its space to the big map (phones especially); the choice is remembered. */
function toggleMini(on = null) {
  const off = on == null ? !document.body.classList.contains('nomini') : !on; document.body.classList.toggle('nomini', off); $('#minimap').classList.remove('hidden');
  S.opts.miniOff = off; try { localStorage.setItem('hq-opts', JSON.stringify(S.opts)); } catch { /* private mode */ }
  requestAnimationFrame(() => { S.view?.resize?.(); if (S.view) { S.view.dirty = true; S.view.minimapDirty = true; } });
  toast(off ? 'Small map off. Turn it back on from the menu, under View.' : 'Small map on.');
}
function onKey(e) {
  if (!S.g || $('#game').classList.contains('hidden')) return; if (e.target.matches('input,textarea,select')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;      // FIX: Ctrl+F (find) used to fortify the selection, Ctrl+D (bookmark) to rest it, Ctrl+W/N/M ...
  if (e.key === 'Escape') { if (modalOpen()) { const t = topModal(); if (t.dismiss !== false) t.close(); else t.onEsc?.(); return; } if (S.path) { S.path = null; S.view.path = null; S.view.dirty = true; refresh(); } else if (S.sel) deselect(); return; }
  if (modalOpen() || S.busy) return;
  const k = e.key.toLowerCase();
  if (k === 'n' || k === ' ' || k === 'tab') { e.preventDefault(); nextArmy(); } else if (k === 'f') order('fortify'); else if (k === 'd') order('done'); else if (k === 'w') order('wake');
  else if (k === 'enter') { if (S.path) execute(); } else if (k === 'e') endTurnClick(); else if (k === 'c') centreSel(); else if (k === 'm') toggleMini();
  else if (k === '+' || k === '=') zoom(1.25); else if (k === '-' || k === '_') zoom(0.8);
  else if (k === 'delete') order('disband');
  else if (k.startsWith('arrow')) { e.preventDefault(); const d = 90 / S.view.cam.z; if (k === 'arrowleft') S.view.cam.x -= d; if (k === 'arrowright') S.view.cam.x += d; if (k === 'arrowup') S.view.cam.y -= d; if (k === 'arrowdown') S.view.cam.y += d; S.view.clamp(); S.view.dirty = true; }
}
export function setup(assets) { initAudio(); document.addEventListener('click', (e) => { const el = e.target.closest?.('button,.btn,.opt,.sw'); if (el && el.id !== 'endbtn') sfx('click'); }, true); S.assets = assets; try { Object.assign(S.opts, JSON.parse(localStorage.getItem('hq-opts') ?? '{}')); } catch {} skeleton(); }
