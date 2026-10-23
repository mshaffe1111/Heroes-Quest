// How to play (Matt, 22 Oct): a royal advisor who coaches the first game, one-time tips the first time something happens, and a
// picture guide with chapters. Research: teach one thing at a time, by doing, at the moment it matters; keep a guide to look things up.
import { h, $, openModal, frame } from './ui.js';

export const ADVISOR = { name: 'Hollis', role: 'Royal Steward', img: 'play/assets/ui/advisor.webp' };
const ic = (n) => h('img', { src: `play/assets/ui/icons/${n}.svg`, alt: '' });

// ===== the guide =================================================================================================================
// Every chapter: an icon, a picture, the advisor's one-line lead, points (icon, bold, plain text), and a tip.
export const CHAPTERS = [
  { id: 'goal', mood: 'happy', icon: 'trophy', title: 'The goal', line: 'How you win', img: 'play/assets/scenes/title.webp',
    lead: 'Hold more than half the cities on the map, my liege, and every other realm will lay down its arms.',
    points: [['city', 'Cities are everything', 'Each city pays you gold every turn and trains one kind of army.'],
      ['sword', 'Armies take cities', 'March onto an enemy city and beat whoever guards it. Then it is yours.'],
      ['hero', 'Heroes lead', 'Your hero makes every army in the group stronger, and only heroes can explore.'],
      ['flag', 'You lose', 'when your last city and last army are gone.']],
    tip: 'Free cities (light beige on the small map) are guarded only lightly. Take them early, before your rivals do.' },
  { id: 'turn', icon: 'hourglass', title: 'Your turn', line: 'Six taps, every turn', img: 'play/assets/scenes/loading.webp',
    lead: 'Every turn follows the same rhythm. Learn it once and you know the game.',
    steps: [['Tap an army', 'It lights up, and a soft outline shows how far it can go this turn.'],
      ['Tap a square', 'A route appears with how many turns it takes. Enemies show your chance of winning.'],
      ['Tap it again', 'The army marches. A long march carries on by itself next turn.'],
      ['Tap Next', 'Jumps to the next army still waiting for orders.'],
      ['Check your cities', 'Every city should be building something. Tap its castle or name.'],
      ['End turn', 'The other realms move. You can watch them, speed them up, or skip.']],
    tip: 'When End turn says nobody is waiting, you have given every order. That is the moment to end.' },
  { id: 'move', icon: 'boot', title: 'Moving', line: 'Roads, woods and water', img: 'play/assets/scenes/heroffer.webp',
    lead: 'Roads are swift, forests and hills are slow, and only the winged may cross the mountains.',
    points: [['boot', 'Move points', 'Each army has move points (the number on the right). Each square costs some.'],
      ['map', 'Roads are fastest', 'Tap beside a road and the route snaps onto it.'],
      ['people', 'Groups move together', 'The slowest army sets the pace for the whole group.'],
      ['ship', 'Water', 'Walk into a port city to board a ship. Boarding takes a whole turn.'],
      ['fortify', 'Fortify', 'Dig in and hold the ground. It defends better and stays put until you wake it.'],
      ['done', 'Done', 'Skip this army for this turn only.']],
    tip: 'The numbered dots on a route show where the march stops at the end of each turn.' },
  { id: 'cities', icon: 'city', title: 'Cities & gold', line: 'Build, pay, heal', img: 'play/assets/scenes/capture.webp',
    lead: 'A city that builds nothing is a city wasted. Keep every forge burning.',
    points: [['city', 'Open a city', 'Tap its castle or its name, or the City button. Tap your armies inside twice.'],
      ['shield', 'Choose what it builds', 'Each kind takes a few turns. When it is done, a new army appears and the next one starts.'],
      ['coin', 'Gold in, gold out', 'Cities pay you each turn. Every army costs upkeep each turn, even when marching.'],
      ['heart', 'Healing', 'Wounded armies heal one pip a turn while they rest in your cities.'],
      ['people', 'Room', 'A city or a square holds 8 armies at most.']],
    tip: 'If your gold falls below zero, your cities stop building. Disband old, weak armies to save upkeep.' },
  { id: 'fight', mood: 'warn', icon: 'sword', title: 'Fighting', line: 'Odds before you strike', img: 'play/assets/scenes/battle.webp',
    lead: 'Never march blind into battle. Look at your chance first.',
    points: [['sword', 'Attack', 'Tap an enemy. The label shows your chance of winning. Tap again to attack.'],
      ['eye', 'Red ring', 'An enemy with a red ring is within reach this turn.'],
      ['heart', 'Pips are health', 'Armies fight in pairs until one side runs out. Wounds stay until they rest in a city.'],
      ['shield', 'Defenders have help', 'City walls, hills and forest favour whoever is standing there.'],
      ['hero', 'Heroes add strength', 'A hero raises every army in the same group.'],
      ['list', 'Fight order', 'Open the army card (Info) to choose who fights first.']],
    tip: 'Send a strong group together rather than armies one at a time. Bonuses count for the whole group.' },
  { id: 'heroes', mood: 'warn', icon: 'crown', title: 'Heroes', line: 'Your queen on the board', img: 'play/assets/scenes/levelup.webp',
    lead: 'Guard your hero well. Like the queen in chess, a hero is your strongest piece and your hardest to replace.',
    points: [['crown', 'Levels', 'Heroes gain experience from fights and quests, up to level 9.'],
      ['scroll', 'Abilities', 'Each new level lets you pick an ability, such as Siege Master or Ranger.'],
      ['ruin', 'Explore', 'Only heroes can search ruins, take quests and study.'],
      ['shield', 'Items', 'Treasures make a hero stronger. If the hero falls, they drop where the hero stood.'],
      ['hero', 'More heroes', 'Now and then a hero offers to join for gold. Say yes when you can.']],
    tip: 'Tap Hero to jump straight to your hero. Press and hold an army card at the bottom to read what it is.' },
  { id: 'places', mood: 'happy', icon: 'ruin', title: 'Places to explore', line: 'Ruins, temples, towers', img: 'play/assets/scenes/ruin.webp',
    lead: 'The old places of the realm hold gold, allies and secrets, for the brave.',
    places: [['ruin_columns', 'Ruins', 'Guarded. Your hero searches: gold, a treasure, a new ally, or a sage with choices. Heroes can die there, so bring company. Every army along raises the odds.'],
      ['temple', 'Temples', 'Every army that visits is blessed: +1 strength, once per temple. Priests may give your hero a quest.'],
      ['library', 'Libraries', 'Your hero studies once for experience.'],
      ['mage_tower', 'Mage Towers', 'Pay 200 gold and your hero learns one ability of three.']],
    tip: 'Stand your hero on the place and tap Search. Searched ruins look faded on the map.' },
  { id: 'capture', icon: 'flag', title: 'Taking cities', line: 'Occupy, pillage, sack, raze', img: 'play/assets/scenes/razed.webp',
    lead: 'When a city falls, you decide its fate. Choose with care.',
    points: [['city', 'Occupy', 'Keep it whole. It pays you and builds for you from the next turn.'],
      ['coin', 'Pillage', 'Take gold now. The city keeps everything.'],
      ['sword', 'Sack', 'More gold, but the city forgets one kind of army.'],
      ['disband', 'Raze', 'Burn it to the ground. Nobody can use it until it is rebuilt.']],
    tip: 'Occupy is usually best. A city pays every turn for the rest of the game.' },
  { id: 'enemy', mood: 'warn', icon: 'eye', title: 'Enemy turns', line: 'Watch, quick or hidden', img: 'play/assets/scenes/quest.webp',
    lead: 'While you rest, your rivals march. Keep an eye on them.',
    points: [['eye', 'Watch', 'The camera follows each enemy move. Fights with you open the battle window.'],
      ['fast', 'Quick or hidden', 'Change it in Options, or tap Skip while they move.'],
      ['bell', 'The bell', 'News of the turn: cities lost or taken, quests, heroes. Tap the bell to read it.'],
      ['eye', 'Look at enemies', 'Tap an enemy army to see what is in it (on Easy and Medium you see all of it).']],
    tip: 'A fortified army wakes up by itself when an enemy comes within 3 squares.' },
  { id: 'buttons', icon: 'list', title: 'Every button', line: 'What each one does', img: null,
    buttons: [['next', 'Next', 'The next army waiting for orders.'], ['fortify', 'Fortify', 'Dig in and hold the ground.'], ['done', 'Done', 'Skip this army for this turn.'],
      ['wake', 'Wake', 'Wake fortified armies here.'], ['city', 'City', 'Open the city these armies stand in.'], ['list', 'Cities', 'All your cities and what they build.'],
      ['disband', 'Disband', 'Send armies home for good. Upkeep stops.'], ['centre', 'Centre', 'Bring the selected armies to the middle of the screen.'], ['map', 'Map', 'See the whole map.'],
      ['chart', 'Reports', 'Realms, battles and the state of the war.'], ['hero', 'Hero', 'Jump to your next hero.'], ['help', 'Info', 'What each army here is and what it is good at.'],
      ['search', 'Search', 'Search a ruin, visit a temple, library or tower.'], ['close', 'Deselect', 'Let go of the selected armies.'], ['hourglass', 'End turn', 'Finish your turn.'],
      ['menu', 'Menu', 'Save, load, options, this guide.'], ['full', 'Full screen', 'On by itself. Tap to turn it off.'], ['bell', 'News', 'What happened since your last turn.']] },
  { id: 'taps', icon: 'zoomin', title: 'Taps & gestures', line: 'Fingers on the map', img: null,
    gestures: [['Tap', 'Select your armies, or pick where to go.'], ['Tap again', 'Go. The same square twice confirms the move.'],
      ['Touch a castle or armies', 'A magnifier with crosshairs appears above your finger. Tap as usual, or slide onto the exact square and lift. Scroll by dragging from open ground.'], ['Press and hold an army card', 'Read what that army is.'], ['Drag open ground', 'Slide the map around (or use two fingers).'],
      ['Pinch', 'Zoom in and out. The + and − buttons do the same.'], ['Tap the small map', 'Jump anywhere. Drag on it to look around.']],
    keys: [['N / Space', 'Next army'], ['F · D · W', 'Fortify · Done · Wake'], ['Enter', 'Confirm route'], ['Esc', 'Cancel, then deselect'], ['E', 'End turn'], ['+ − arrows C', 'Zoom, scroll, centre'], ['M', 'Small map on or off']] },
];

const FACE = { '': 'advisor', warn: 'advisor_warn', happy: 'advisor_happy' };
const portrait = (cls = '', mood = '') => h('img', { class: 'adv-face ' + cls, src: `play/assets/ui/${FACE[mood] ?? 'advisor'}.webp`, alt: ADVISOR.name });

function chapterPage(ch, i, go) {
  const body = [];
  if (ch.img) body.push(h('div', { class: 'gd-hero', style: { backgroundImage: `url(${ch.img})` } }, h('div', { class: 'gd-num' }, `Chapter ${i + 1}`), h('h3', {}, ch.title)));
  else body.push(h('div', { class: 'gd-plainhead' }, h('div', { class: 'gd-num' }, `Chapter ${i + 1}`), h('h3', {}, ch.title)));
  if (ch.lead) body.push(h('div', { class: 'gd-lead' }, portrait('sm', ch.mood ?? ''), h('p', {}, h('q', {}, ch.lead), h('span', {}, `${ADVISOR.name}, ${ADVISOR.role}`))));
  if (ch.points) body.push(h('div', { class: 'gd-points' }, ch.points.map(([i2, b, t]) => h('div', { class: 'gd-pt' }, h('span', { class: 'gi' }, ic(i2)), h('div', {}, h('b', {}, b), h('span', {}, t))))));
  if (ch.steps) body.push(h('ol', { class: 'gd-steps' }, ch.steps.map(([b, t], k) => h('li', {}, h('em', {}, String(k + 1)), h('div', {}, h('b', {}, b), h('span', {}, t))))));
  if (ch.places) body.push(h('div', { class: 'gd-places' }, ch.places.map(([img, b, t]) => h('div', { class: 'gd-place' }, h('img', { src: `play/assets/site/${img}.webp`, alt: '' }), h('div', {}, h('b', {}, b), h('span', {}, t))))));
  if (ch.buttons) body.push(h('div', { class: 'gd-btns' }, ch.buttons.map(([i2, b, t]) => h('div', { class: 'gd-bt' }, h('span', { class: 'gi sq' }, ic(i2)), h('div', {}, h('b', {}, b), h('span', {}, t))))));
  if (ch.gestures) body.push(h('div', { class: 'gd-points' }, ch.gestures.map(([b, t]) => h('div', { class: 'gd-pt' }, h('span', { class: 'gi' }, ic('play')), h('div', {}, h('b', {}, b), h('span', {}, t))))),
    h('details', { class: 'gd-keys' }, h('summary', {}, 'Playing with a keyboard'), h('div', {}, ch.keys.map(([k, t]) => h('div', { class: 'gd-key' }, h('kbd', {}, k), h('span', {}, t))))));
  if (ch.tip) body.push(h('div', { class: 'gd-tip' }, h('b', {}, 'Steward’s tip'), h('span', {}, ch.tip)));
  const nav = h('div', { class: 'gd-nav' },
    h('button', { class: 'btn', disabled: i === 0, onclick: () => go(i - 1) }, '‹ Back'),
    h('button', { class: 'btn ghost', onclick: () => go(-1) }, 'All chapters'),
    i < CHAPTERS.length - 1 ? h('button', { class: 'btn pri', onclick: () => go(i + 1) }, 'Next ›') : h('button', { class: 'btn pri', onclick: () => go('close') }, 'Done'));
  return [h('div', { class: 'gd-page' }, body), nav];
}

function contents(go, onLessons) {
  return [h('div', { class: 'gd-welcome' }, portrait(), h('div', {}, h('div', { class: 'eyebrow' }, 'How to play'), h('h2', {}, 'Heroes Quest'),
      h('p', {}, 'Welcome, my liege. Start with ', h('b', {}, 'Your turn'), '. It is all you need to play. Everything else is here when you want it.'))),
    h('div', { class: 'gd-start' }, h('button', { class: 'btn pri big', onclick: () => go(1) }, ic('play'), 'Start here: your turn'), onLessons ? h('button', { class: 'btn', onclick: onLessons }, ic('undo'), 'Replay the lessons') : null),
    h('div', { class: 'gd-grid' }, CHAPTERS.map((c, i) => h('button', { class: 'gd-tile' + (c.id === 'turn' ? ' first' : ''), onclick: () => go(i) }, h('span', { class: 'gi' }, ic(c.icon)), h('b', {}, c.title), h('span', {}, c.line))))];
}

/** The guide window. `at` is a chapter id or index to open straight onto, or nothing for the contents. */
export function openGuide(at = null, { onLessons = null } = {}) {
  let m; const box = h('div', { class: 'gd-box' }); let cur = -1;
  const go = (i) => { if (i === 'close') { m.close(); return; } cur = i; box.replaceChildren(...(i < 0 ? [h('div', { class: 'gd-page' }, contents(go, onLessons && (() => { m.close(); onLessons(); })))] : chapterPage(CHAPTERS[i], i, go))); box.querySelector('.gd-page').scrollTop = 0; };
  // swipe between chapters
  let sx = null, sy = 0; box.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  box.addEventListener('pointerup', (e) => { if (sx == null || cur < 0) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) { const n = cur + (dx < 0 ? 1 : -1); if (n >= 0 && n < CHAPTERS.length) go(n); } });
  m = openModal(frame([box], { width: 820, cls: 'guide', onClose: () => m.close() }));
  go(at == null ? -1 : typeof at === 'number' ? at : Math.max(0, CHAPTERS.findIndex((c) => c.id === at)));
  return m;
}

// ===== the advisor's speech bubble ===============================================================================================
let bubble = null, ring = null;
const CW = () => (document.body.classList.contains('pl') ? 500 : 560);
/**
 * Show the advisor saying something. `step`/`of` draw progress dots; `target` is a DOM element (or a function giving screen {x,y,r})
 * that gets a pulsing ring. Buttons: [{label, pri, fn}]. Returns the bubble element.
 */
export function coachSay({ text, title = null, mood = '', step = null, of = null, target = null, buttons = [], onSkip = null, where = 'top', dock = false }) {
  coachHide();
  let r = null; if (target) { if (typeof target === 'function') r = target(); else { const b = target.getBoundingClientRect(); r = { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width + 10, hgt: b.height + 10 }; } }
  const skip = onSkip ? h('button', { class: 'lnk', onclick: onSkip }, 'Skip') : null;
  bubble = h('div', { class: `coach ${mood}${dock ? ' dock' : ''}`, role: 'status' }, portrait('', mood),
    h('div', { class: 'cb' }, h('div', { class: 'who' }, h('b', {}, ADVISOR.name), h('span', { class: 'role' }, ` · ${ADVISOR.role}`), step != null ? h('span', { class: 'dots' }, Array.from({ length: of }, (_, k) => h('i', { class: k < step ? 'on' : k === step ? 'cur' : '' }))) : null, skip),
      title ? h('div', { class: 'ct' }, title) : null, h('p', {}, text),
      buttons.length ? h('div', { class: 'cbtn' }, ...buttons.map((b) => h('button', { class: 'btn sm' + (b.pri ? ' pri' : ''), onclick: b.fn }, b.label))) : null));
  // sit over the big map, on the side away from whatever the advisor points at (the small map and the buttons stay clear)
  const map = document.querySelector('#map') ?? document.querySelector('#stage canvas'); const mr = map?.getBoundingClientRect();
  if (!dock && mr && mr.height > 120) { const low = r ? r.y > mr.top + mr.height * 0.5 : where === 'bottom';
    Object.assign(bubble.style, { left: `${mr.left + 8}px`, right: 'auto', width: `${Math.min(CW(), mr.width - 16)}px`, marginLeft: `${Math.max(0, (mr.width - 16 - Math.min(CW(), mr.width - 16)) / 2)}px` });
    const vis = (sel) => { const e = document.querySelector(sel); const b = e?.getBoundingClientRect(); return b && b.width && b.height && getComputedStyle(e).display !== 'none' ? b : null; };
    const pt = vis('#ptop'), bt = vis('#bottom'); let top = mr.top + 8, bot = mr.bottom - 8;
    if (pt && pt.bottom > top && pt.top < mr.top + 80) top = pt.bottom + 8; if (bt && bt.top < bot && bt.bottom > mr.bottom - 80) bot = bt.top - 8;
    bubble._side = (lo) => { if (lo) { bubble.style.top = `${top}px`; bubble.style.bottom = 'auto'; } else { bubble.style.top = 'auto'; bubble.style.bottom = `${innerHeight - bot}px`; } bubble._low = lo; };
    bubble._side(r && r.x > -900 ? low : where === 'bottom'); }
  document.body.append(bubble);
  if (r) { ring = h('div', { class: 'coach-ring' + (r.r ? ' round' : ''), style: r.r ? { left: `${r.x - r.r}px`, top: `${r.y - r.r}px`, width: `${r.r * 2}px`, height: `${r.r * 2}px` } : { left: `${r.x - r.w / 2}px`, top: `${r.y - r.hgt / 2}px`, width: `${r.w}px`, height: `${r.hgt}px` } });
    document.body.append(ring); }
  return bubble;
}
export function coachHide() { bubble?.remove(); ring?.remove(); bubble = ring = null; document.body.classList.remove('coached'); }
function docked() { if (!bubble) return; document.body.classList.add('coached'); document.body.style.setProperty('--coachH', `${bubble.offsetHeight + 24}px`); }
export const coachShowing = () => !!bubble;

// ===== remembered progress ======================================================================================================
const KEY = 'hq-coach';
function load() { try { return { lessons: 'todo', seen: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { lessons: 'todo', seen: {} }; } }
let MEM = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(MEM)); } catch { /* private mode */ } };
export const lessonsWanted = () => MEM.lessons === 'todo';
export function resetLessons() { MEM = { lessons: 'todo', seen: {} }; save(); }

// keep the pulsing ring on its target while the map moves; hide it when the target leaves the map
let ringFn = null;
function placeRing() {
  if (!ring || !ringFn) return; const r = ringFn(); if (!r) { ring.style.display = 'none'; return; } ring.style.display = '';
  if (r.r) Object.assign(ring.style, { left: `${r.x - r.r}px`, top: `${r.y - r.r}px`, width: `${r.r * 2}px`, height: `${r.r * 2}px` });
  else Object.assign(ring.style, { left: `${r.x - r.w / 2}px`, top: `${r.y - r.hgt / 2}px`, width: `${r.w}px`, height: `${r.hgt}px` });
  // never sit on top of what the advisor points at: move to the other half of the map
  if (bubble?._side) { const bb = bubble.getBoundingClientRect(), rr = ring.getBoundingClientRect(); if (rr.bottom > bb.top && rr.top < bb.bottom && rr.right > bb.left && rr.left < bb.right) bubble._side(!bubble._low); }
}
const elTarget = (sel) => () => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); if (!b.width) return null; return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width + 10, hgt: b.height + 10 }; };
function say(o) { ringFn = typeof o.target === 'function' ? o.target : o.target ? elTarget(o.target) : null; coachSay({ ...o, target: ringFn ? () => ringFn() ?? { x: -999, y: -999, r: 1 } : null }); if (o.dock) docked(); placeRing(); }

// ===== the first-turn lessons ===================================================================================================
// `api` comes from the game: { S, waiting(), myCities(), heroGroup(), stackAt(x,y) -> screen circle, cityLabel(id) -> screen box,
//   deselect(), openGuide(ch), modalOpen(), cityWindowOpen(), suggest() -> {x,y,what} or null }
let L = null, timer = null;
export const lessonsActive = () => !!L;
export function startLessons(api) {
  stopLessons(); const S = api.S; const g = S.g; const grp = api.heroGroup(); if (!grp) return;
  const cap = api.myCities()[0];
  L = { api, step: 'select', shown: null, turn: g.turn, hero: grp.hero, from: { x: grp.hero.x, y: grp.hero.y }, cap, nexts: 0, n: grp.count, where: grp.where };
  api.deselect(); timer = setInterval(tick, 300); tick();
}
export function stopLessons(done = false) { if (timer) clearInterval(timer); timer = null; L = null; coachHide(); ringFn = null; if (done) { MEM.lessons = 'done'; save(); } }
export const lessonNote = (what) => { if (L && what === 'next') L.nexts++; };
const ORDER = ['select', 'route', 'march', 'city', 'build', 'next', 'end', 'wrap'];
function skip() { stopLessons(true); coachSay({ text: 'As you wish, my liege. The full guide is always under Menu, How to play. I will speak up when something new happens.', buttons: [{ label: 'Got it', pri: true, fn: () => coachHide() }] }); setTimeout(() => { if (!L) coachHide(); }, 9000); }
function tick() {
  if (!L) return; const { api } = L; const S = api.S; const g = S.g; if (!g) { stopLessons(); return; }
  const hero = g.armies.get(L.hero.id); const sel = S.sel; const busy = S.busy;
  const city = L.cap && g.cities.get(L.cap.id); const cityOpen = api.cityWindowOpen();
  // work out where the player really is (they may do things out of order)
  let step = L.step;
  if (step === 'select' && sel?.ids.includes(L.hero.id)) step = 'route';
  if (step === 'route' && !sel) step = 'select';
  if (step === 'route' && S.path) step = 'march';
  if (step === 'march' && !S.path && !busy) step = sel ? 'route' : 'select';
  if (['select', 'route', 'march'].includes(step) && (!hero || hero.x !== L.from.x || hero.y !== L.from.y || hero.goal)) step = 'city';
  if (step === 'city' && (!city || city.owner !== S.me || city.building)) step = cityOpen ? 'build' : 'next';
  if (step === 'city' && cityOpen) step = 'build';
  if (step === 'build' && !cityOpen) step = city?.building ? 'next' : 'city';
  if (step === 'next' && (L.nexts > 0 || L.nextSeen)) step = 'end';
  if (step === 'end' && (busy || g.turn > L.turn)) step = 'wrap';
  if (step !== L.step) { L.step = step; L.shown = null; }
  // stay out of the way while a window is open, except in the city lessons
  const modal = api.modalOpen();
  if (modal && step !== 'build') { if (L.shown !== 'hidden') { coachHide(); L.shown = 'hidden'; } return; }
  if (step === 'wrap' && (busy || g.turn === L.turn)) { if (L.shown !== 'hidden') { coachHide(); L.shown = 'hidden'; } return; }
  const key = step + (step === 'build' ? (city?.building ? ':done' : ':pick') : '');
  if (L.shown === key) { placeRing(); return; }
  L.shown = key; const i = ORDER.indexOf(step); const dots = { step: Math.min(i, 6), of: 7, onSkip: skip };
  const hn = hero?.name ?? 'your hero', cn = city?.name ?? 'your city';
  if (step === 'select') say({ ...dots, title: 'Your first turn', text: `Welcome, my liege. ${hn}, your hero, ${L.where ? `waits in ${L.where}` : 'stands ready'}${L.n > 1 ? ` with ${L.n - 1 === 1 ? 'one company' : `${L.n - 1} companies`} of soldiers` : ''}. Tap ${L.n > 1 ? 'them' : 'your hero'} to take command.`, target: () => hero && api.stackAt(hero.x, hero.y) });
  else if (step === 'route') { const s = api.suggest(); say({ ...dots, text: `The bright outline is how far they can go this turn. Tap any square inside it to see the way there.${s ? ` Try the ${s.what}: ${s.why}` : ''}`, target: s ? () => api.tileAt(s.x, s.y) : null }); }
  else if (step === 'march') say({ ...dots, text: 'That line is the route, and the label says how long it takes. Tap the same square again to march. Tap anywhere else to choose again.', target: () => S.path ? api.tileAt(S.path.steps.at(-1).x, S.path.steps.at(-1).y) : null });
  else if (step === 'city') say({ ...dots, text: `Now ${cn}. A city should always be building something. Tap its name on the map to open it.`, target: () => city && api.cityLabel(city.id) });
  else if (step === 'build') say({ ...dots, dock: true, mood: city?.building ? 'happy' : '', text: city?.building ? 'Splendid. It will march out of the city when it is ready, and the next one starts by itself. Close the window when you are done.' : 'Choose an army and tap Build this. Cheap armies are ready in a turn or two; strong ones take longer.', target: city?.building ? '.back .frame > .x' : null });
  else if (step === 'next') {
    if (api.waiting().length) say({ ...dots, text: 'Some armies still wait for orders. Tap Next to jump to each of them in turn.', target: '#cmdnext' });
    else say({ ...dots, text: 'When you have more armies, the Next button takes you to each one that still waits for orders.', target: '#cmdnext', buttons: [{ label: 'Got it', pri: true, fn: () => { L.nextSeen = true; L.shown = null; } }] });
  } else if (step === 'end') say({ ...dots, text: 'That is a whole turn. Tap End turn. The other realms move next; you can watch them, or tap Skip.', target: '#endbtn' });
  else if (step === 'wrap') { stopLessons(true); say({ mood: 'happy', title: 'You know the rhythm', text: 'Armies, cities, End turn: that is the whole game, my liege. I will speak up when something new happens. The full guide is under Menu, How to play.', buttons: [{ label: 'Open the guide', fn: () => { coachHide(); api.openGuide(null); } }, { label: 'Got it', pri: true, fn: () => coachHide() }] }); }
}

// ===== one-time tips ===========================================================================================================
// Shown the first time something happens, never again (Replay the lessons brings them back). Never during the lessons.
export const TIPS = {
  'enemy-reach': { mood: 'warn', title: 'An enemy within reach', text: 'See the red ring? You can attack it this turn. Tap it once to see your chance of winning before you commit.', ch: 'fight' },
  'free-city': { mood: 'happy', title: 'A free city', text: 'Light beige cities belong to no realm and are lightly guarded. Tap one to see your chance, then tap again to take it.', ch: 'goal' },
  'site-ruin': { title: 'A ruin nearby', text: 'Ruins hide gold, treasure and allies, but a guardian waits inside. Only heroes can search, and every army along raises the odds.', ch: 'places' },
  'site-temple': { title: 'A temple nearby', text: 'March in with your armies: every one is blessed with +1 strength, once per temple. The priests may give your hero a quest.', ch: 'places' },
  'site-library': { title: 'A library nearby', text: 'Bring your hero here to study once for experience.', ch: 'places' },
  'site-tower': { title: 'A Mage Tower nearby', text: 'For 200 gold the mages teach your hero one ability of three. It lasts all game.', ch: 'places' },
  battle: { title: 'Your first battle', text: 'Armies fight in pairs until one side is gone. A red cross marks the fallen. Wounds heal one pip a turn while armies rest in your cities.', ch: 'fight' },
  capture: { mood: 'happy', title: 'The city is yours', text: 'Choose its fate. Occupy keeps it paying you every turn. Pillage and Sack take gold now. Raze burns it to the ground.', ch: 'capture', over: true },
  levelup: { mood: 'happy', title: 'Your hero grew stronger', text: 'Pick one ability. It lasts all game, so choose what fits how you play.', ch: 'heroes', over: true },
  'hero-offer': { mood: 'happy', title: 'A hero offers to join', text: 'Heroes come rarely. A second hero can explore and lead another army. Take one when you can afford it.', ch: 'heroes', over: true },
  'enemy-turn': { title: 'Your rivals have moved', text: 'Anything important that happened is under the bell. In Options you can watch their moves, see them quickly, or hide them.', ch: 'enemy', target: '#pbell' },
  'low-gold': { mood: 'warn', title: 'Gold is running low', text: 'Your armies cost more each turn than your cities pay. Take more cities, or disband weak armies, before your cities stop building.', ch: 'cities' },
};
let tipOpen = null;
/** Show tip `id` once. `target` overrides the tip's own (a selector or a function giving a screen circle/box). */
export function tipOnce(id, { target = null, openGuide: og = null } = {}) {
  const t = TIPS[id]; if (!t || MEM.seen[id] || L) return false;
  if (bubble) return false;      // one bubble at a time: a tip waits for its next chance
  MEM.seen[id] = 1; save(); tipOpen = id; let watch = null;
  const close = () => { clearInterval(watch); tipOpen = null; coachHide(); };
  // a map tip belongs to the map: it goes when any window opens over it
  if (!t.over) { const mine = () => tipOpen === id; watch = setInterval(() => { if (!mine()) { clearInterval(watch); return; } if (document.querySelector('#modals .back')) close(); }, 300); }
  say({ mood: t.mood ?? '', title: t.title, text: t.text, target: target ?? t.target ?? null, dock: !!t.over,
    buttons: [og ? { label: 'Tell me more', fn: () => { close(); og(t.ch); } } : null, { label: 'Got it', pri: true, fn: close }].filter(Boolean) });
  return true;
}
export const tipShowing = () => tipOpen;
export function tipClose() { if (tipOpen) { tipOpen = null; coachHide(); } }
