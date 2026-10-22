// Small DOM helpers and the shared pieces of the look: crests, framed dialogs, toasts.
import { sfx } from './audio.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const plural = (n, w, many = w + 's') => `${n} ${n === 1 ? w : many}`;
export const num = (n) => Math.round(n).toLocaleString('en-US');

// The eight realms as shown on banners and crests (names and colours match the engine's REALMS list; epithets are ours).
export const REALM_LOOK = {
  white: { fill: '#e9e9f0', text: '#1d2433', ink: '#46465c', epithet: 'Wardens of the white towers', blurb: 'The Order keeps its walls tall and its oaths longer. Its castles hold, its generals wait, and its neighbours have learned to count the cost of a siege.', charge: '<path d="M16 40V22h16v18zM16 22v-5h3.4v2.4h3V17h3.2v2.4h3V17H32v5"/>' },
  gold: { fill: '#e8b81c', text: '#2c1e04', ink: '#5a3d08', epithet: 'Lords of the gilded road', blurb: 'The Dominion grows rich on tolls and trade, and spends it on horsemen. Where its roads go, its banners follow.', charge: '<circle cx="24" cy="28" r="5.5"/><path d="M24 15v4M24 37v4M11 28h4M33 28h4M15 19l3 3M30 34l3 3M15 37l3-3M30 22l3-3"/>' },
  orange: { fill: '#e3801c', text: '#2e1304', ink: '#5a1a08', epithet: 'Hill-forge and hearth-fire', blurb: 'The Clans came down from the high forges with hammers still warm. They fight close, they fight loud, and they do not retreat.', charge: '<path d="M24 14c4 6 9 9 9 16a9 9 0 0 1-18 0c0-4 2-7 5-9 0 3 1 5 3 5-1-5-1-8 1-12z"/>' },
  red: { fill: '#c9342a', text: '#ffffff', ink: '#fbe9e7', epithet: 'Raiders of the red banner', blurb: 'The Horde takes what it wants, then asks what it took. Expect them early, expect them many, and expect them at your gates.', charge: '<path d="M14 16l20 24M34 16L14 40M14 16h4M34 16h-4"/>' },
  green: { fill: '#2f9444', text: '#ffffff', ink: '#e5f4e0', epithet: 'Stewards of the green wood', blurb: 'The Court has held its forests for longer than anyone can say. Its castles are old, its roads are good, and its neighbours have started to look hungry.', charge: '<path d="M15 38c0-12 7-19 19-19 0 12-6 20-18 20M15 38l12-12"/>' },
  blue: { fill: '#2c5ccc', text: '#ffffff', ink: '#e1edff', epithet: 'Merchant-lords of the bright coast', blurb: 'The League is every harbour on the bright coast and every ship that leaves one. It prefers a quick trade to a long war, and wins both.', charge: '<path d="M12 24q4-5 8 0t8 0 8 0M12 32q4-5 8 0t8 0 8 0"/>' },
  cyan: { fill: '#34bcd8', text: '#062a33', ink: '#0a3a44', epithet: 'Sea-wardens of the grey reaches', blurb: 'The Riders learned the grey reaches before anyone drew a map of them. Their galleys come out of the mist and are gone before the bells ring.', charge: '<path d="M24 14v26M24 17c8 4 11 12 11 22H24M24 23c-5 3-8 8-8 16h8"/>' },
  black: { fill: '#46465c', text: '#ffffff', ink: '#d4d4e0', epithet: 'The grey host that never rests', blurb: 'The Legion marches in good order and in all weathers. It does not hurry, and it does not stop.', charge: '<path d="M24 13v22M18 35h12M24 35v7M20 21l4 5"/>' },
};
const SHIELD_OF = { white: 'ivory', gold: 'gold', orange: 'ember', red: 'crimson', green: 'verdant', blue: 'azure', cyan: 'tidewatch', black: 'ashen' };
/** A realm's heraldic shield (Stone & Gilt look); colours without a realm get the Unsworn shield. */
export function crest(color, size = 24) {
  return h('img', { class: 'crest', src: `play/assets/ui/shields/${SHIELD_OF[color] ?? 'unsworn'}.svg`, alt: '', style: { width: size + 'px', height: Math.round(size * 1.12) + 'px', display: 'block', flex: 'none' } });
}


// ---- dialogs ---------------------------------------------------------------------------------------------------------------
const modalsEl = () => document.getElementById('modals');
const stack = [];
export function frame(children, { width = 640, clear = false, onClose = null, closeButton = true, cls = '' } = {}) {
  const f = h('div', { class: 'frame ' + cls, style: { width: `min(${width}px, 100%)` } },
    ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: 'cn ' + p })), closeButton && onClose ? h('button', { class: 'x', title: 'Close', onclick: onClose }, '✕') : null, children);
  return f;
}
export function openModal(content, { clear = false, dismiss = true, onClose = null } = {}) {
  const back = h('div', { class: 'back' + (clear ? ' clear' : '') }, content);
  const m = { el: back, dismiss, onEsc: null, close() { const i = stack.indexOf(m); if (i >= 0) stack.splice(i, 1); back.remove(); if (onClose) onClose(); } };
  if (dismiss) back.addEventListener('pointerdown', (e) => { if (e.target === back) m.close(); });
  modalsEl().append(back); stack.push(m); return m;
}
export const topModal = () => stack[stack.length - 1] ?? null;
export const modalOpen = () => stack.length > 0;
export function closeAllModals() { while (stack.length) stack[stack.length - 1].close(); }
export function toast(text, kind = '', silent = false) {
  if (kind === 'bad' && !silent) sfx('error');
  const el = h('div', { class: 'toast ' + kind }, text); const box = document.getElementById('toast'); box.append(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 420); }, 2600);
  while (box.children.length > 4) box.firstChild.remove();
}
export function confirmBox({ title, text, ok = 'Yes', cancel = 'Cancel', danger = false }) {
  return new Promise((res) => {
    let m; const done = (v) => { res(v); m.close(); };      // FIX: resolve BEFORE close(): close() runs onClose, which resolves false first
    m = openModal(frame([h('h2', { style: { fontSize: '26px' } }, title), h('p', { class: 'sub', style: { marginTop: '12px' } }, text),
      h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => done(false) }, cancel), h('button', { class: 'btn pri' + (danger ? '' : ''), onclick: () => done(true) }, ok))], { width: 480 }), { onClose: () => res(false) });
  });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- full screen -------------------------------------------------------------------------------------------------------
const FS_ROOT = () => document.documentElement;
export const canFullscreen = () => !!(FS_ROOT().requestFullscreen || FS_ROOT().webkitRequestFullscreen);
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
/** Switch full screen on or off (hides the browser's own bars: a big gain on phones in landscape). */
export async function toggleFullscreen() {
  try {
    if (isFullscreen()) { await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.()); return; }
    const el = FS_ROOT(); await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
  } catch (e) { toast('This browser would not go full screen. Try "Add to Home Screen" from its menu.'); }
}
/** The small button that sits in the corner of the title and the wizard (the game has its own in the top bar). */
export function fsButton(cls = '') {
  if (!canFullscreen()) return null;
  const b = h('button', { class: 'fsbtn ' + cls, 'aria-label': 'Full screen', title: 'Full screen', onclick: (e) => { e.stopPropagation(); dispatchEvent(new Event(isFullscreen() ? 'hq-fs-off' : 'hq-fs-on')); toggleFullscreen(); } }, h('span', { html: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/></svg>' }));
  const sync = () => { b.classList.toggle('on', isFullscreen()); b.title = isFullscreen() ? 'Leave full screen' : 'Full screen'; };
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync); sync();
  return b;
}
