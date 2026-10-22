// The title screen and the new-game steps (Realm, Hero, World, Difficulty).
import * as E from '../../engine/src/index.js';
import { generateMap } from '../../engine/src/mapgen/index.js';
import { S, hooks } from './state.js';
import { MapView, realmHex, medalURL } from './view.js';
import { Painter, TP, CH } from './paint.js';
import { h, $, crest, REALM_LOOK, toast, closeAllModals, sleep, modalOpen, topModal } from './ui.js';
import { newGame, enterGame, SIZES } from './game.js';
import * as D from './dialogs.js';
import { setScene } from './audio.js';

const SHAPES = [['continent', 'One continent', 'One big land with every realm on it. The classic war.'], ['river_split', 'Great river', 'A wide river splits the land. Bridges are the places to fight.'], ['split', 'Split by sea', 'Two lands joined by narrow necks and bridges.'], ['islands', 'Big islands', 'Several large islands. Ships matter more.'], ['archipelago', 'Archipelago', 'Many islands. Ships matter and some islets can only be reached by boat.']];
const TIPS = ['Only heroes can search ruins. Bring a few armies along: they help the hero face the guardian.', 'The slowest army in a group sets how far it moves.', 'Wounds heal only while an army rests in one of your cities.', 'A city holds at most eight armies. Send the rest where they are needed.', 'Taking more than half of all the cities wins the war.', 'Fortified armies wake by themselves when an enemy comes near.'];
const SIG = { ivory: 'pike', gold: 'hcav', ember: 'dwarf', crimson: 'orc', verdant: 'elf', azure: 'grif', tidewatch: 'lcav', ashen: 'undead' };
const PORTRAITS = ['paladin', 'knight', 'ranger', 'barbarian', 'elf_captain', 'dwarf_lord', 'battle_mage', 'sorceress', 'priestess', 'rogue', 'duelist', 'orc_warlord'];
const HERO_NAMES = ['Aldric', 'Brenna', 'Cassian', 'Dara', 'Edric', 'Fenna', 'Gareth', 'Hilde', 'Ivor', 'Jora', 'Kell', 'Lyra'];
const UNSWORN = [['normal', 'Normal', 'Each free city holds its weakest army. Easy pickings early on.'], ['strong', 'Strong', 'Each free city holds one of its better armies. Taking them costs something.'], ['active', 'Active', 'As strong, and a free city that beats off an attack raises more defenders, up to five.']];
const DIFFS = [['easy', 'Easy', 'The computer realms are slow, make mistakes and rarely press you.'], ['medium', 'Medium', 'A fair fight. The realms mostly look after themselves.'], ['hard', 'Hard', 'Sharper odds, bigger armies on the move, and a grudge against you.'], ['expert', 'Expert', 'They press on thin odds and hunt you first. Expect a siege by turn twenty.']];

let titleView = null, titleTimer = null;
function root() { let t = $('#title'); if (!t) { t = h('div', { id: 'title', class: 'title' }); $('#app').prepend(t); } t.classList.remove('hidden'); return t; }
function stopTitleMap() { if (titleView) { titleView.destroy(); titleView = null; } if (titleTimer) cancelAnimationFrame(titleTimer); titleTimer = null; }
hooks.stopTitle = stopTitleMap;
// Esc closes the top window outside a game too (the game's own key handler only runs in play)
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || !modalOpen()) return; const game = document.getElementById('game'); if (game && !game.classList.contains('hidden')) return; const t = topModal(); if (t.dismiss !== false) t.close(); else t.onEsc?.(); });

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
  const sum = newest?.summary; const ago = newest ? agoText(newest.savedAt) : '';
  const nav = h('nav', { class: 'tmenu' },
    newest ? h('button', { class: 'btn pri big tcont', onclick: () => hooks.loadSlot(newest.slot) }, h('span', {}, 'Continue'), h('small', {}, [sum?.turn ? `Turn ${sum.turn}` : '', sum?.realmName ?? '', ago].filter(Boolean).join(' · '))) : null,
    h('button', { class: 'btn big' + (newest ? '' : ' pri'), onclick: () => showWizard() }, 'New game'),
    h('button', { class: 'btn big', onclick: () => D.openSaveLoad('load') }, 'Load a game'),
    h('div', { class: 'trow' }, h('button', { class: 'btn', onclick: () => D.openOptions() }, 'Options'), h('button', { class: 'btn', onclick: () => D.openHelp() }, 'How to play'), h('button', { class: 'btn', onclick: () => D.openCredits() }, 'Credits')));
  t.append(h('img', { class: 'tbg', src: 'play/assets/scenes/title.webp', alt: '' }), h('div', { class: 'tshade' }),
    h('div', { class: 'tleft' }, h('h1', {}, 'Heroes Quest'), h('div', { class: 'tag' }, 'A war for the crown of the broken land'), nav),
    h('div', { class: 'built' }, builtText()), h('div', { class: 'small' }, D.persistent ? 'Early test build · your saves live in this browser · Created by Matt Shaffer · ' : 'This browser is not letting the game keep saves: they will be lost when you close the page. Use Save to a file. · ', h('a', { href: 'https://github.com/mshaffe1111/Heroes-Quest' }, 'the code is on GitHub')));
}
/** When this version of the game was built (stamped by build.mjs), so a fresh push is easy to spot. */
function builtText() { try { const d = new Date(__BUILT__); return 'Updated ' + d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }
function agoText(t) { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'saved just now' : m < 60 ? `saved ${m} minute${m === 1 ? '' : 's'} ago` : m < 1440 ? `saved ${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? '' : 's'} ago` : `saved ${new Date(t).toLocaleDateString()}`;
}

export function showWizard() {
  setScene('newgame');
  stopTitleMap(); const t = root(); t.replaceChildren();
  const st = { step: 1, realm: 'verdant', heroName: '', shape: 'continent', cities: 60, seed: 1000 + Math.floor(Math.random() * 9000), difficulty: 'medium', fog: false, classic: false, rivals: 7, unsworn: 'strong' };
  const names = ['Realm', 'Hero', 'World', 'Rivals', 'Difficulty']; const ids = ['ivory', 'gold', 'ember', 'crimson', 'verdant', 'azure', 'tidewatch', 'ashen']; const colors = ['white', 'gold', 'orange', 'red', 'green', 'blue', 'cyan', 'black'];
  const wiz = h('div', { class: 'wiz' }); t.append(wiz);
  // the rivals: the other realms in an order fixed by the map number, so the same map number always brings the same rivals
  const rivalIds = () => { const o = ids.filter((id) => id !== st.realm); let x = st.seed * 9301 + 49297; for (let i = o.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = Math.floor((x / 233280) * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o.slice(0, st.rivals); };
  const realmIds = () => [st.realm, ...rivalIds()];
  let previewG = null, previewKey = '';
  const draw = () => {
    const titleOf = ['', 'Choose your realm', 'Name your hero', 'Shape the world', 'Who stands against you?', 'How hard a war?'][st.step];
    const steps = h('div', { class: 'steps' }, names.flatMap((n, i) => { const k = i + 1; const cls = k === st.step ? 'on' : k < st.step ? 'done' : ''; const el = h('div', { class: 'st ' + cls }, h('span', { class: 'dm' }, h('span', {}, k < st.step ? '✓' : k)), n); return i < names.length - 1 ? [el, h('span', { class: 'ln' })] : [el]; }));
    const head = h('div', { class: 'head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'NEW GAME', h('span', { class: 'stepof' }, ` · Step ${st.step} of ${names.length}: ${names[st.step - 1]}`)), h('h2', {}, titleOf)), steps);
    let body;
    if (st.step === 1) {
      const idx = ids.indexOf(st.realm); const L = REALM_LOOK[colors[idx]]; const castle = S.assets.castle[colors[idx]];
      const cards = h('div', { class: 'rcards' }, ids.map((id, i) => { const l = REALM_LOOK[colors[i]]; const sig = E.ARMIES[SIG[id]];
        return h('button', { class: 'rcard' + (id === st.realm ? ' sel' : ''), onclick: () => { st.realm = id; draw(); } }, crest(colors[i], 54), h('b', {}, E.REALMS[i].name), h('span', {}, l.epithet), h('em', {}, 'Signature army'), h('img', { class: 'sig', src: medalURL(S.assets, SIG[id], realmHex({ color: colors[i] }), 96), alt: '' }), h('small', {}, sig?.name ?? '')); }));
      const sig = E.ARMIES[SIG[st.realm]];
      const card = h('div', { class: 'frame rside' }, h('div', { class: 'eyebrow' }, 'You will rule'), h('div', { class: 'rhead' }, crest(colors[idx], 46), h('h3', {}, E.REALMS[idx].name)),
        h('div', { class: 'ep' }, L.epithet), h('p', { class: 'sub' }, L.blurb), h('div', { class: 'sec' }, 'You begin with'),
        h('div', { class: 'begin2' }, h('div', {}, '◆ ', h('b', {}, 'Your capital castle')), h('div', {}, '◆ ', h('b', {}, 'Your hero'), ', named next'), (E.SIGNATURE_ARMIES ? h('div', {}, '◆ ', h('b', {}, `Two ${sig?.name ?? 'armies'}`), ', the realm’s signature army') : h('div', {}, '◆ ', h('b', {}, 'Three armies'), ` (soon: two ${sig?.name ?? 'signature armies'})`)), h('div', {}, `◆ ${E.makeRules?.().startGold ?? 1000} gold`)),
        h('img', { class: 'rcastle', src: castle?.src ?? '', alt: '' }));
      body = h('div', { class: 'realmstep' }, cards, card);
    } else if (st.step === 2) {
      const ph = HERO_NAMES[(st.seed + ids.indexOf(st.realm)) % HERO_NAMES.length];
      const inp = h('input', { type: 'text', maxlength: 20, placeholder: ph, value: st.heroName, oninput: (e) => { st.heroName = e.target.value; } });
      st.portrait ??= PORTRAITS[0];
      const pick = h('div', { class: 'portraits' }, PORTRAITS.map((pid) => h('button', { class: 'pt' + (st.portrait === pid ? ' sel' : ''), 'aria-label': pid.replace('_', ' '), onclick: () => { st.portrait = pid; draw(); } }, h('img', { src: `play/assets/heroes/${pid}.webp`, alt: '' }))));
      body = h('div', { class: 'herostep' }, h('div', { class: 'frame hleft' }, h('img', { class: 'hbig', src: `play/assets/heroes/${st.portrait}.webp`, alt: '' }), h('div', { class: 'hname' }, st.heroName || ph), h('p', { class: 'sub' }, 'Your first hero leads your first army. Heroes grow stronger with every battle, can carry the realm’s Standard and lead the armies around them.')),
        h('div', { class: 'hright' }, h('div', { class: 'frame' }, h('div', { class: 'sec', style: { marginTop: 0 } }, 'Choose a face'), pick), h('div', { class: 'frame' }, h('div', { class: 'sec', style: { marginTop: 0 } }, 'Your hero’s name'), h('label', { class: 'sub', for: 'heroname', style: { display: 'block', marginBottom: '8px' } }, 'Leave it empty and one will be chosen for you.'), inp)));
      inp.id = 'heroname'; inp.addEventListener('input', () => { const n = body.querySelector('.hname'); if (n) n.textContent = inp.value || ph; });
    } else if (st.step === 3) {
      const cv = h('canvas', { class: 'prev', width: 300, height: 200 });
      const shapeBtns = h('div', { class: 'opts', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' } }, SHAPES.map(([k, n]) => h('button', { class: 'opt' + (st.shape === k ? ' on' : ''), onclick: () => { st.shape = k; draw(); } }, h('b', {}, n))));
      const cityBtns = h('div', { class: 'opts' }, [[60, 'Small', 'A quick war. About 60 castles.'], [100, 'Medium', 'About 100 castles.'], [140, 'Large', 'A long campaign. About 140 castles.']].map(([n, l, d]) => h('button', { class: 'opt' + (st.cities === n ? ' on' : ''), onclick: () => { st.cities = n; draw(); } }, h('b', {}, `${n} cities`), h('span', {}, d))));
      const seedIn = h('input', { type: 'number', value: st.seed, min: 1, max: 99999, style: { width: '140px' }, onchange: (e) => { st.seed = Math.max(1, Math.min(99999, +e.target.value || 1)); draw(); } });
      const info = SHAPES.find((s) => s[0] === st.shape);
      body = h('div', { class: 'two' }, h('div', { class: 'frame' }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })), cv, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' } }, h('div', { style: { font: '700 26px var(--display)', color: '#f3dc9a' } }, info[1]), h('div', { class: 'eyebrow' }, 'MAP ' + st.seed)), h('p', { class: 'sub' }, info[2])),
        h('div', { class: 'frame' }, ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })), h('div', { class: 'sec', style: { marginTop: 0 } }, 'Pick a shape'), shapeBtns, h('div', { class: 'sec' }, 'Cities on the map'), cityBtns, h('div', { class: 'sec' }, 'Map number'), h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, seedIn, h('button', { class: 'btn sm', onclick: () => { st.seed = 1000 + Math.floor(Math.random() * 9000); draw(); } }, 'Roll'))));
      setTimeout(() => paintPreview(cv), 30);
    } else if (st.step === 4) {
      const rivals = rivalIds(); const rbtns = h('div', { class: 'opts', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))' } }, [1, 2, 3, 4, 5, 6, 7].map((n) => h('button', { class: 'opt' + (st.rivals === n ? ' on' : ''), onclick: () => { st.rivals = n; draw(); } }, h('b', {}, String(n)), h('span', {}, n === 1 ? 'One rival' : n === 7 ? 'Every realm' : `${n} rivals`))));
      const who = h('div', { class: 'rivals' }, rivals.map((id) => { const i = ids.indexOf(id); return h('div', { class: 'rv' }, crest(colors[i], 40), h('b', {}, E.REALMS[i].name)); }));
      const un = h('div', { class: 'opts', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' } }, UNSWORN.map(([k, n, d]) => h('button', { class: 'opt' + (st.unsworn === k ? ' on' : ''), onclick: () => { st.unsworn = k; draw(); } }, h('b', {}, n), h('span', {}, d))));
      body = h('div', { style: { maxWidth: '900px', margin: '0 auto' } }, h('div', { class: 'sec', style: { marginTop: 0 } }, 'How many rival realms'), rbtns, h('p', { class: 'sub', style: { margin: '10px 0' } }, 'Fewer rivals leaves more free cities to take. The castles of realms left out of the war start with the Unsworn.'), who,
        h('div', { class: 'sec' }, 'The Unsworn (free cities)'), un);
    } else {
      const tog = (key, title, text) => { const b = h('button', { class: 'sw' + (st[key] ? ' on' : ''), onclick: () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); } }); return h('div', { class: 'toggle' }, h('div', {}, h('b', {}, title), h('span', {}, text)), b); };
      body = h('div', { style: { maxWidth: '900px', margin: '0 auto' } }, h('div', { class: 'opts', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' } }, DIFFS.map(([k, n, d]) => h('button', { class: 'opt' + (st.difficulty === k ? ' on' : ''), onclick: () => { st.difficulty = k; draw(); } }, h('b', {}, n), h('span', {}, d)))),
        h('div', { class: 'sec' }, 'Rules'), tog('fog', 'Fog of war', 'The map starts covered and clears as you explore. Enemies and who owns a city show only when your armies and cities are near. The computer plays by the same rules.'),
        tog('classic', 'Classic rules', 'Classic two-hit duels: every army dies after two hits, no lasting wounds, no counters, no doctrines of rank. Leave this off for the full Heroes Quest.'));
    }
    const foot = h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => (st.step === 1 ? showTitle() : (st.step--, draw())) }, st.step === 1 ? 'Back' : 'Back'),
      st.step < 5 ? h('button', { class: 'btn pri big', onclick: () => { st.step++; draw(); } }, `Next: ${['', 'your hero', 'the world', 'your rivals', 'difficulty'][st.step]}`) : h('button', { class: 'btn pri big', onclick: () => begin() }, 'Begin the war'));
    wiz.replaceChildren(head, h('div', { class: 'body' }, body), foot);
  };
  let previewToken = 0, previewPainter = null;
  function paintPreview(cv) {
    const [W, H] = SIZES[st.cities]; const key = `${st.shape}|${st.seed}|${st.cities}|${realmIds().join(',')}`;
    if (key !== previewKey) { try { const map = generateMap({ shape: st.shape, seed: st.seed, width: W, height: H, cities: st.cities, realms: 8 }); previewG = E.mapToGame(map, { realmIds: realmIds() }).game; previewKey = key; previewPainter = null; } catch (e) { console.warn(e); return; } }
    const g = previewG; const token = ++previewToken;
    const w = 640, hh = Math.round(w * g.height / g.width); cv.width = w; cv.height = hh; cv.style.aspectRatio = `${g.width} / ${g.height}`;
    const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    // first a quick flat colour map so the box is never empty, then the painted map fills in chunk by chunk
    const c = document.createElement('canvas'); c.width = g.width; c.height = g.height; const x = c.getContext('2d'); const d = x.createImageData(g.width, g.height);
    const col = { open: [128, 160, 84], woods: [50, 100, 56], hills: [150, 160, 92], mountain: [136, 126, 112], water: [58, 124, 170], swamp: [90, 110, 70] };
    for (let y = 0; y < g.height; y++) for (let xx = 0; xx < g.width; xx++) { const t = E.tileAt(g, xx, y); const k = col[t.terrain] ?? col.open; const i = (y * g.width + xx) * 4; d.data[i] = k[0]; d.data[i + 1] = k[1]; d.data[i + 2] = k[2]; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); cx.drawImage(c, 0, 0, w, hh);
    const dots = () => { const sx = w / g.width, sy = hh / g.height;
      for (const city of g.cities.values()) { const realm = city.owner ? g.realms.get(city.owner) : null; const isMe = city.owner === st.realm && g.map.caps[0] === city.id; cx.fillStyle = realmHex(realm) ?? '#e6dcc0'; const r = realm ? 4 : 2.5; cx.beginPath(); cx.arc((city.x + 0.5) * sx, (city.y + 0.5) * sy, isMe ? 7 : r, 0, 7); cx.fill(); cx.strokeStyle = isMe ? '#fff' : '#0b1320'; cx.lineWidth = isMe ? 2.5 : 1; cx.stroke(); } };
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
    S.goFull?.();      // straight from the tap, while the browser still allows it
    const ov = h('div', { class: 'load paint' }, h('div', { class: 'lt' }, 'Painting the world'), h('div', { class: 'ls' }, `${SHAPES.find((x) => x[0] === st.shape)?.[1] ?? ''} · map ${st.seed} · ${st.cities} cities`), h('div', { class: 'lb' }, h('i', { style: { width: '35%', transition: 'width 2s' } })), h('div', { class: 'tip' }, TIPS[st.seed % TIPS.length])); $('#app').append(ov); await sleep(60);
    try { const g = newGame({ realm: st.realm, heroName: st.heroName || HERO_NAMES[(st.seed + ids.indexOf(st.realm)) % HERO_NAMES.length], shape: st.shape, cities: st.cities, seed: st.seed, difficulty: st.difficulty, fog: st.fog, classic: st.classic, portrait: st.portrait, realmIds: realmIds(), neutrals: st.unsworn });
      ov.querySelector('i').style.width = '90%'; await sleep(30); stopTitleMap(); hooks.ready = () => ov.remove(); await enterGame(g); } catch (e) { console.error(e); toast('The world could not be made: ' + e.message, 'bad'); } ov.remove(); hooks.ready = null;
  }
  draw();
}
