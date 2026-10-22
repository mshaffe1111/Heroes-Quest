// Enemy-turn playback (Build D). Records nothing itself: game.js hands it the engine's action events for one
// computer realm, after that realm has finished its turn. The world is already in its end-of-turn state, so the picture is made of
//   - real armies that did not move (drawn as usual),
//   - ghosts that walk a recorded path (the real armies in them are hidden until the ghost arrives),
//   - ghosts of armies that died (drawn where they stood until their fight),
//   - the old owner of a city until the moment it is taken.
// Only what the player could see is shown (fog). Everything else is counted and summed up in one line.
import * as E from '../../engine/src/index.js';
import { S, realmName, colorOf } from './state.js';
import { TP } from './paint.js';
import { h, $, crest, sleep } from './ui.js';
import * as D from './dialogs.js';

export const PB = { mode: 'watch', speed: 55, follow: true, paused: false, skipArmy: false, fast: false, log: [], unseen: 0, active: false, stats: { frames: 0, drawMs: 0, runs: 0, shown: 0 } };
const raf = () => new Promise((r) => requestAnimationFrame(r));
const tileMs = () => { const base = 270 - 2.3 * (S.opts.moveSpeed ?? PB.speed); return PB.mode === 'quick' ? Math.max(28, base / 4.5) : base; };
const strongest = (types) => types.includes('hero') ? 'hero' : types.slice().sort((a, b) => E.ARMIES[b].str - E.ARMIES[a].str)[0];
const nameOf = (types) => { const t = strongest(types); return E.ARMIES[t].name + (types.length > 1 ? ` +${types.length - 1}` : ''); };

// ---- the panel (R15Enemy) ----------------------------------------------------------------------------------------------
let el = null;
function mount() {
  unmount(); const wrap = $('#mapwrap');
  const seg = (k, label) => h('button', { class: 'pbseg' + (PB.mode === k ? ' on' : ''), 'data-mode': k, onclick: () => { PB.mode = k; S.opts.enemyMode = k; try { localStorage.setItem('hq-opts', JSON.stringify(S.opts)); } catch { /* private mode */ } el.querySelectorAll('.pbseg').forEach((b) => b.classList.toggle('on', b.dataset.mode === k)); if (k === 'hidden') PB.fast = true; } }, label);
  el = h('div', { class: 'pb' },
    h('div', { class: 'pbhead' }, h('span', { class: 'pbcrest' }), h('div', { style: { flex: 1 } }, h('div', { class: 'pbeye' }, 'Enemy turn'), h('div', { class: 'pbtxt' }, '…')), h('div', { style: { textAlign: 'right' } }, h('div', { class: 'pbcount' }, ''), h('div', { class: 'pbsub' }, 'armies moved'))),
    h('div', { class: 'pblog' }, h('div', { class: 'pbeye' }, 'This round'), h('div', { class: 'pbrows' })),
    h('div', { class: 'pbbar' }, h('div', { class: 'pbmodes' }, seg('watch', document.body.classList.contains('pl') || document.body.classList.contains('pp') ? 'Watch' : 'Watch every move'), seg('quick', 'Quick'), seg('hidden', 'Hidden')),
      h('button', { class: 'pbico', title: 'Pause', onclick: (e) => { PB.paused = !PB.paused; e.currentTarget.textContent = PB.paused ? '▶' : '❚❚'; } }, '❚❚'),
      h('button', { class: 'pbico', title: 'Skip this army', onclick: () => { PB.skipArmy = true; } }, '⏭'),
      h('button', { class: 'pbrest', onclick: () => { PB.fast = true; PB.skipArmy = true; } }, 'Simulate the rest'),
      h('div', { class: 'pbfoot' }, h('span', {}, 'Pause · skip this army'), h('span', {}, 'Stop watching any time and the rest plays out at once'))));
  wrap.append(el); PB.active = true;
}
function unmount() { el?.remove(); el = null; PB.active = false; }
const setHead = (realm, text, moved, total) => { if (!el) return; const c = el.querySelector('.pbcrest'); c.replaceChildren(crest(colorOf(realm), 30)); el.querySelector('.pbtxt').textContent = `${realmName(realm)} · ${text}`; el.querySelector('.pbsub').textContent = total ? 'armies moved' : ''; if (!total) el.querySelector('.pbsub').textContent = ''; else el.querySelector('.pbsub').textContent = 'armies moved'; el.querySelector('.pbcount').textContent = total ? `${moved} of ${total}` : ''; };
function logLine(text, kind = '') { PB.log.unshift({ text, kind }); if (!el) return; const row = h('div', { class: 'pbrow ' + kind }, h('span', { class: 'pbdot' }), h('span', {}, text)); const box = el.querySelector('.pbrows'); box.prepend(row); while (box.children.length > 9) box.lastChild.remove(); }

// ---- turning one realm's events into things to show -----------------------------------------------------------------------
function plan(g, realm, events, visBefore) {
  const vis = (x, y) => !visBefore || visBefore.has(y * g.width + x);
  const items = []; let ctx = null; let run = null;
  const flush = () => { if (run) { run.seen = run.tiles.map(([x, y]) => vis(x, y)); items.push(run); run = null; } };
  for (const e of events) {
    if (e.t === 'orders') { flush(); ctx = e; continue; }
    if (e.t === 'embark' || e.t === 'disembark') continue;
    if (e.t === 'move') {
      const key = e.ids.join(',');
      if (run && run.key === key && run.last[0] === e.from[0] && run.last[1] === e.from[1]) { run.tiles.push(e.to); run.last = e.to; }
      else { flush(); run = { kind: 'run', key, ids: e.ids, types: e.types, owner: e.realm, tiles: [e.from, e.to], last: e.to, ctx }; }
      continue;
    }
    flush(); items.push({ kind: e.t, e, seen: e.at ? vis(e.at[0], e.at[1]) || (e.from ? vis(e.from[0], e.from[1]) : false) : false });
  }
  flush(); return items;
}

function orderText(run, g) {
  const c = run.ctx; const unit = nameOf(run.types);
  if (c?.kind === 'attack' && c.cityId) return `${unit} marching on ${g.cities.get(c.cityId)?.name ?? 'a city'}`;
  if (c?.kind === 'explore') return `${unit} marching to a ruin`;
  if (c?.kind === 'scout') return `${unit} scouting`;
  if (c?.kind === 'return' && c.cityId) return `${unit} returning to ${g.cities.get(c.cityId)?.name ?? 'its city'}`;
  return `${unit} on the march`;
}

async function walkRun(g, run) {
  const view = S.view; const tiles = run.tiles; const segs = tiles.length - 1; if (segs < 1) return;
  const gh = { type: strongest(run.types), owner: run.owner, count: run.types.length, x: tiles[0][0], y: tiles[0][1], alpha: run.seen[0] ? 1 : 0, trail: tiles };
  view.hide = new Set([...(view.hide ?? []), ...run.ids]); view.ghosts = [gh];
  const t0 = performance.now(); let lost = 0; PB.skipArmy = false;
  const total = segs * tileMs();
  for (;;) {
    if (PB.paused) { await sleep(60); lost += 60; continue; }
    const now = performance.now(); const u = Math.min(1, (now - t0 - lost) / total);
    const f = u * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i;
    gh.x = tiles[i][0] + (tiles[i + 1][0] - tiles[i][0]) * k; gh.y = tiles[i][1] + (tiles[i + 1][1] - tiles[i][1]) * k;
    const a0 = run.seen[i] ? 1 : 0, a1 = run.seen[i + 1] ? 1 : 0; gh.alpha = a0 + (a1 - a0) * k;
    if (S.opts.follow !== false && PB.mode === 'watch' && gh.alpha > 0.4) { const c = view.cam, tx = (gh.x + 0.5) * TP - view.w / 2 / c.z, ty = (gh.y + 0.5) * TP - view.h / 2 / c.z; c.x += (tx - c.x) * 0.2; c.y += (ty - c.y) * 0.2; view.clamp(); }
    view.dirty = true; const d0 = performance.now(); await raf(); PB.stats.frames++; PB.stats.drawMs += performance.now() - d0;
    if (u >= 1 || PB.skipArmy || PB.fast) break;
  }
  PB.skipArmy = false; view.ghosts = []; for (const id of run.ids) view.hide.delete(id); view.dirty = true;
}

/** Show one computer realm's turn. Called with the world already in its end-of-turn state. */
export async function playRealm(g, realm, events, built, visBefore) {
  if (!el) mount();
  const items = plan(g, realm, events, visBefore);
  const runs = items.filter((it) => it.kind === 'run' && it.seen.some(Boolean));
  const unseenRuns = items.filter((it) => it.kind === 'run' && !it.seen.some(Boolean)).length; PB.unseen += unseenRuns;
  const caps = items.filter((it) => it.kind === 'capture'); const view = S.view;
  view.cityOverride = new Map(caps.map((c) => [c.e.cityId, { owner: c.e.prevOwner, razed: false }]));      // the city still wears its old colours until it is taken
  view.ghosts = [];
  let moved = 0; setHead(realm, 'taking its turn', 0, runs.length);
  for (const b of built) { const c = g.cities.get(b.city); if (c && (!visBefore || visBefore.has(c.y * g.width + c.x)) && PB.mode !== 'hidden') logLine(`${realmName(realm)} built ${E.ARMIES[b.armyType].name}`); }
  for (const it of items) {
    const hot = it.kind === 'attack' && it.e.defender === S.me;
    if (it.kind === 'run') {
      if (!it.seen.some(Boolean)) continue;
      moved++; PB.stats.runs++;
      if (PB.mode !== 'hidden' && !PB.fast) {
        setHead(realm, orderText(it, g), moved, runs.length);
        if (S.opts.follow !== false && PB.mode === 'watch') { const p = it.tiles[0]; view.centerOn(p[0], p[1]); }
        await walkRun(g, it); PB.stats.shown++;
      }
      if (it.ctx?.kind === 'attack' && it.ctx.cityId && !it.fastlogged) logLine(`${realmName(realm)} marched toward ${g.cities.get(it.ctx.cityId)?.name}`);
    } else if (it.kind === 'attack') {
      const e = it.e; const place = e.place ?? 'the field'; const loser = e.winner === 'attacker' ? e.defender : e.realm;
      if (it.seen || hot) {
        if (PB.mode !== 'hidden' && !PB.fast) { setHead(realm, `attacking ${place}`, moved, runs.length); view.fx.push({ x: e.at[0], y: e.at[1], t0: (performance.now() - view.t0), ms: 700, color: hot ? '#ff9a8a' : '#ffe9a8' }); await sleep(PB.mode === 'quick' ? 120 : 650); }
        const nLost = e.winner === 'attacker' ? e.lostD : e.lostA;
        logLine(`${realmName(loser)} lost ${nLost} ${nLost === 1 ? 'army' : 'armies'} at ${place}`, 'bad');
        if (hot && S.opts.replay !== false && e.fought) { view.centerOn(e.at[0], e.at[1]); await D.showBattle({ battle: e.battle }, { attacker: e.realm, defender: e.defender, place: e.place, tile: e.tile, theirs: true }); }
      }
    } else if (it.kind === 'capture') {
      const e = it.e; view.cityOverride.delete(e.cityId); view.dirty = true;
      if (it.seen || e.prevOwner === S.me) { logLine(e.razed ? `${realmName(realm)} razed ${e.name}` : `${realmName(realm)} took ${e.name} from ${realmName(e.prevOwner)}`, 'bad'); if (PB.mode === 'watch' && !PB.fast) { view.fx.push({ x: e.at[0], y: e.at[1], t0: performance.now() - view.t0, ms: 900, color: '#f3dc9a' }); await sleep(700); } }
    } else if (it.kind === 'hero' && (it.seen || !E.fogOn(g))) logLine(`${realmName(realm)} hired ${it.e.name ?? 'a hero'}`);
    else if (it.kind === 'doctrine' && !E.fogOn(g)) logLine(`${realmName(realm)} adopted ${it.e.name}`);
  }
  view.cityOverride = null; view.ghosts = []; view.hide = null; view.dirty = true; PB.fast = PB.mode === 'hidden';
  return { moved, unseen: unseenRuns };
}
export function open() { PB.mode = window.__pbmode ?? S.opts.enemyMode ?? 'watch'; PB.log = []; PB.unseen = 0; PB.fast = PB.mode === 'hidden'; PB.stats = { frames: 0, drawMs: 0, runs: 0, shown: 0 }; mount(); }
export function close() { unmount(); }
export function say(realm, text) { setHead(realm, text, 0, 0); }
