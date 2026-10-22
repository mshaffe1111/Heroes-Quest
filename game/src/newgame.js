// The title screen and the new-game steps (Realm, Hero, World, Difficulty).
import * as E from '../../engine/src/index.js';
import { generateMap } from '../../engine/src/mapgen/index.js';
import { S, hooks } from './state.js';
import { MapView, realmHex, medalURL } from './view.js';
import { Painter, TP, CH } from './paint.js';
import { h, $, crest, REALM_LOOK, toast, closeAllModals, sleep } from './ui.js';
import { newGame, enterGame, SIZES } from './game.js';
import * as D from './dialogs.js';
import { setScene } from './audio.js';

const SHAPES = [['continent', 'One continent', 'One big land with every realm on it. The classic war.'], ['river_split', 'Great river', 'A wide river splits the land. Bridges are the places to fight.'], ['split', 'Split by sea', 'Two lands joined by narrow necks and bridges.'], ['islands', 'Big islands', 'Several large islands. Ships matter more.'], ['archipelago', 'Archipelago', 'Many islands. Ships matter and some islets can only be reached by boat.']];
const HERO_NAMES = ['Aldric', 'Brenna', 'Cassian', 'Dara', 'Edric', 'Fenna', 'Gareth', 'Hilde', 'Ivor', 'Jora', 'Kell', 'Lyra'];
const DIFFS = [['easy', 'Easy', 'The computer realms are slow, make mistakes and rarely press you.'], ['medium', 'Medium', 'A fair fight. The realms mostly look after themselves.'], ['hard', 'Hard', 'Sharper odds, bigger armies on the move, and a grudge against you.'], ['expert', 'Expert', 'They press on thin odds and hunt you first. Expect a siege by turn twenty.']];

let titleView = null, titleTimer = null;
function root() { let t = $('#title'); if (!t) { t = h('div', { id: 'title', class: 'title' }); $('#app').prepend(t); } t.classList.remove('hidden'); return t; }
function stopTitleMap() { if (titleView) { titleView.destroy(); titleView = null; } if (titleTimer) cancelAnimationFrame(titleTimer); titleTimer = null; }
hooks.stopTitle = stopTitleMap;

async function backdrop(host) {
  const canvas = h('canvas'); host.prepend(canvas);
  const seed = 100 + Math.floor(Math.random() * 800);
  const map = generateMap({ shape: 'continent', seed, width: 110, height: 72, cities: 30, realms: 8 }); const { game: g } = E.mapToGame(map); const me = [...g.realms.keys()][0];
  await sleep(20);
  titleView = new MapView(canvas, g, S.assets, { me }); titleView.centerOn(40 + Math.random() * 30, 26 + Math.random() * 20, 0.85);
  let dir = Math.random() < 0.5 ? 1 : -1; const drift = () => { if (!titleView) return; titleView.cam.x += 0.35 * dir; titleView.cam.y += 0.08; titleView.clamp(); titleView.dirty = true; titleTimer = requestAnimationFrame(drift); }; drift();
}

let titleShown = false;
export async function showTitle() {
  setScene(titleShown ? 'menu' : 'title'); titleShown = true;
  stopTitleMap(); closeAllModals(); const t = root(); t.replaceChildren();
  const saves = E.listSaves(D.saveStore).filter((s) => !s.empty); const newest = saves.sort((a, b) => b.savedAt - a.savedAt)[0];
  t.append(h('div', { class: 'vig' }), h('div', { class: 'c' }, h('h1', {}, 'Heroes Quest'), h('div', { class: 'tag' }, 'A war for the crown of the broken land'),
    h('div', { class: 'btns' }, newest ? h('button', { class: 'btn pri big', onclick: () => hooks.loadSlot(newest.slot) }, 'Continue') : null,
      h('button', { class: 'btn big' + (newest ? '' : ' pri'), onclick: () => showWizard() }, 'New game'), saves.length ? h('button', { class: 'btn big', onclick: () => D.openSaveLoad('load') }, 'Load game') : null, h('button', { class: 'btn big', onclick: () => D.openHelp() }, 'How to play'))),
    h('div', { class: 'small' }, 'Early test build · your saves live in this browser · ', h('a', { href: 'https://github.com/mshaffe1111/Heroes-Quest', style: { color: '#9fc2e6' } }, 'the code is on GitHub')));
  backdrop(t).catch((e) => console.warn('title map failed', e));
}

export function showWizard() {
  setScene('newgame');
  stopTitleMap(); const t = root(); t.replaceChildren();
  const st = { step: 1, realm: 'verdant', heroName: '', shape: 'continent', cities: 60, seed: 1000 + Math.floor(Math.random() * 9000), difficulty: 'medium', fog: false, classic: false };
  const names = ['Realm', 'Hero', 'World', 'Difficulty']; const ids = ['ivory', 'gold', 'ember', 'crimson', 'verdant', 'azure', 'tidewatch', 'ashen']; const colors = ['white', 'gold', 'orange', 'red', 'green', 'blue', 'cyan', 'black'];
  const wiz = h('div', { class: 'wiz' }); t.append(wiz);
  let previewG = null, previewKey = '';
  const draw = () => {
    const titleOf = ['', 'Choose your realm', 'Name your hero', 'Shape the world', 'How hard a war?'][st.step];
    const steps = h('div', { class: 'steps' }, names.flatMap((n, i) => { const k = i + 1; const cls = k === st.step ? 'on' : k < st.step ? 'done' : ''; const el = h('div', { class: 'st ' + cls }, h('span', { class: 'dm' }, h('span', {}, k < st.step ? '✓' : k)), n); return i < names.length - 1 ? [el, h('span', { class: 'ln' })] : [el]; }));
    const head = h('div', { class: 'head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'NEW GAME'), h('h2', {}, titleOf)), steps);
    let body;
    if (st.step === 1) {
      const idx = ids.indexOf(st.realm); const L = REALM_LOOK[colors[idx]]; const castle = S.assets.castle[colors[idx]];
      const banners = h('div', { class: 'banners' }, ids.map((id, i) => { const l = REALM_LOOK[colors[i]]; const name = E.REALMS[i].name.split(' ');
        return h('button', { class: 'banner' + (id === st.realm ? ' sel' : ''), style: { background: l.fill, color: l.text }, onclick: () => { st.realm = id; draw(); } }, crest(colors[i], 44), h('span', {}, name[0], h('br'), name.slice(1).join(' '))); }));
      const card = h('div', { class: 'frame', style: { maxWidth: '1100px', margin: '0 auto', width: '100%' } }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })),
        h('div', { class: 'realmcard' }, h('img', { src: castle?.src ?? '' }), h('div', {}, h('div', { class: 'eyebrow' }, 'YOU WILL RULE'), h('h3', {}, E.REALMS[idx].name), h('div', { style: { font: '700 17px var(--display)', color: '#f3dc9a', margin: '4px 0 10px' } }, L.epithet), h('p', { class: 'sub' }, L.blurb)),
          h('div', { class: 'begin' }, h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'YOU BEGIN WITH'), h('div', {}, '◆ One capital castle'), h('div', {}, '◆ Three armies'), h('div', {}, '◆ One hero, named next'), h('div', {}, `◆ ${E.makeRules?.().startGold ?? 1000} gold`))));
      body = h('div', {}, banners, card);
    } else if (st.step === 2) {
      const ph = HERO_NAMES[(st.seed + ids.indexOf(st.realm)) % HERO_NAMES.length];
      const inp = h('input', { type: 'text', maxlength: 20, placeholder: ph, value: st.heroName, oninput: (e) => { st.heroName = e.target.value; } });
      body = h('div', { class: 'frame', style: { maxWidth: '760px', margin: '30px auto', width: '100%' } }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })),
        h('div', { style: { display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' } }, h('img', { src: medalURL(S.assets, 'hero', realmHex({ color: colors[ids.indexOf(st.realm)] }), 160), style: { width: '120px' } }),
          h('div', { style: { flex: 1, minWidth: '240px' } }, h('div', { class: 'eyebrow' }, 'YOUR HERO'), h('p', { class: 'sub', style: { margin: '6px 0 14px' } }, 'Your first hero leads your first army. Heroes grow stronger in every battle, can carry the realm’s Standard, and lead the armies around them. Leave this empty and one will be chosen for you.'), inp)));
    } else if (st.step === 3) {
      const cv = h('canvas', { class: 'prev', width: 300, height: 200 });
      const shapeBtns = h('div', { class: 'opts', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' } }, SHAPES.map(([k, n]) => h('button', { class: 'opt' + (st.shape === k ? ' on' : ''), onclick: () => { st.shape = k; draw(); } }, h('b', {}, n))));
      const cityBtns = h('div', { class: 'opts' }, [[60, 'Small', 'A quick war. About 60 castles.'], [100, 'Medium', 'About 100 castles.'], [140, 'Large', 'A long campaign. About 140 castles.']].map(([n, l, d]) => h('button', { class: 'opt' + (st.cities === n ? ' on' : ''), onclick: () => { st.cities = n; draw(); } }, h('b', {}, `${n} cities`), h('span', {}, d))));
      const seedIn = h('input', { type: 'number', value: st.seed, min: 1, max: 99999, style: { width: '140px' }, onchange: (e) => { st.seed = Math.max(1, Math.min(99999, +e.target.value || 1)); draw(); } });
      const info = SHAPES.find((s) => s[0] === st.shape);
      body = h('div', { class: 'two' }, h('div', { class: 'frame' }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })), cv, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' } }, h('div', { style: { font: '700 26px var(--display)', color: '#f3dc9a' } }, info[1]), h('div', { class: 'eyebrow' }, 'MAP ' + st.seed)), h('p', { class: 'sub' }, info[2])),
        h('div', { class: 'frame' }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })), h('div', { class: 'sec', style: { marginTop: 0 } }, 'Pick a shape'), shapeBtns, h('div', { class: 'sec' }, 'Cities on the map'), cityBtns, h('div', { class: 'sec' }, 'Map number'), h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, seedIn, h('button', { class: 'btn sm', onclick: () => { st.seed = 1000 + Math.floor(Math.random() * 9000); draw(); } }, 'Roll'))));
      setTimeout(() => paintPreview(cv), 30);
    } else {
      const tog = (key, title, text) => { const b = h('button', { class: 'sw' + (st[key] ? ' on' : ''), onclick: () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); } }); return h('div', { class: 'toggle' }, h('div', {}, h('b', {}, title), h('span', {}, text)), b); };
      body = h('div', { style: { maxWidth: '900px', margin: '0 auto' } }, h('div', { class: 'opts', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' } }, DIFFS.map(([k, n, d]) => h('button', { class: 'opt' + (st.difficulty === k ? ' on' : ''), onclick: () => { st.difficulty = k; draw(); } }, h('b', {}, n), h('span', {}, d)))),
        h('div', { class: 'sec' }, 'Rules'), tog('fog', 'Fog of war', 'The map starts covered and clears as you explore. Enemies and who owns a city show only when your armies and cities are near. The computer plays by the same rules.'),
        tog('classic', 'Classic rules', 'Classic two-hit duels: every army dies after two hits, no lasting wounds, no counters, no doctrines of rank. Leave this off for the full Heroes Quest.'));
    }
    const foot = h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => (st.step === 1 ? showTitle() : (st.step--, draw())) }, st.step === 1 ? 'Back' : 'Back'),
      st.step < 4 ? h('button', { class: 'btn pri big', onclick: () => { st.step++; draw(); } }, `Next: ${['', 'your hero', 'the world', 'difficulty'][st.step]}`) : h('button', { class: 'btn pri big', onclick: () => begin() }, 'Begin the war'));
    wiz.replaceChildren(head, h('div', { class: 'body' }, body), foot);
  };
  let previewToken = 0, previewPainter = null;
  function paintPreview(cv) {
    const [W, H] = SIZES[st.cities]; const key = `${st.shape}|${st.seed}|${st.cities}`;
    if (key !== previewKey) { try { const map = generateMap({ shape: st.shape, seed: st.seed, width: W, height: H, cities: st.cities, realms: 8 }); previewG = E.mapToGame(map).game; previewKey = key; previewPainter = null; } catch (e) { console.warn(e); return; } }
    const g = previewG; const token = ++previewToken;
    const w = 640, hh = Math.round(w * g.height / g.width); cv.width = w; cv.height = hh; cv.style.aspectRatio = `${g.width} / ${g.height}`;
    const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    // first a quick flat colour map so the box is never empty, then the painted map fills in chunk by chunk
    const c = document.createElement('canvas'); c.width = g.width; c.height = g.height; const x = c.getContext('2d'); const d = x.createImageData(g.width, g.height);
    const col = { open: [128, 160, 84], woods: [50, 100, 56], hills: [150, 160, 92], mountain: [136, 126, 112], water: [58, 124, 170], swamp: [90, 110, 70] };
    for (let y = 0; y < g.height; y++) for (let xx = 0; xx < g.width; xx++) { const t = E.tileAt(g, xx, y); const k = col[t.terrain] ?? col.open; const i = (y * g.width + xx) * 4; d.data[i] = k[0]; d.data[i + 1] = k[1]; d.data[i + 2] = k[2]; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); cx.drawImage(c, 0, 0, w, hh);
    const dots = () => { const sx = w / g.width, sy = hh / g.height;
      for (const city of g.cities.values()) { const realm = city.owner ? g.realms.get(city.owner) : null; const isMe = city.owner === st.realm && g.map.caps.includes(city.id); cx.fillStyle = realmHex(realm) ?? '#e6dcc0'; const r = realm ? 4 : 2.5; cx.beginPath(); cx.arc((city.x + 0.5) * sx, (city.y + 0.5) * sy, isMe ? 7 : r, 0, 7); cx.fill(); cx.strokeStyle = isMe ? '#fff' : '#0b1320'; cx.lineWidth = isMe ? 2.5 : 1; cx.stroke(); } };
    dots();
    if (!S.assets) return;
    const P = previewPainter ?? (previewPainter = new Painter(g, S.assets)); P.chunks.clear();
    const k = w / (g.width * TP); const list = []; for (let cy = 0; cy < P.ch; cy++) for (let cxx = 0; cxx < P.cw; cxx++) list.push([cxx, cy]);
    let i = 0; const step = () => {
      if (token !== previewToken || !cv.isConnected) return; const t0 = performance.now();
      while (i < list.length && performance.now() - t0 < 14) { const [a, b] = list[i++]; const ch = P.get(a, b, 2); cx.drawImage(ch, a * CH * TP * k, b * CH * TP * k, CH * TP * k + 0.6, CH * TP * k + 0.6); P.chunks.clear(); }
      if (i < list.length) requestAnimationFrame(step); else dots();
    };
    requestAnimationFrame(step);
  }
  async function begin() {
    const ov = h('div', { class: 'load' }, h('div', {}, 'Painting the world…'), h('div', { class: 'lb' }, h('i', { style: { width: '35%', transition: 'width 2s' } }))); $('#app').append(ov); await sleep(60);
    try { const g = newGame({ realm: st.realm, heroName: st.heroName || HERO_NAMES[(st.seed + ids.indexOf(st.realm)) % HERO_NAMES.length], shape: st.shape, cities: st.cities, seed: st.seed, difficulty: st.difficulty, fog: st.fog, classic: st.classic });
      ov.querySelector('i').style.width = '90%'; await sleep(30); stopTitleMap(); hooks.ready = () => ov.remove(); await enterGame(g); } catch (e) { console.error(e); toast('The world could not be made: ' + e.message, 'bad'); } ov.remove(); hooks.ready = null;
  }
  draw();
}
