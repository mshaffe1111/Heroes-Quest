import * as C from './coach.js';
import { S } from './state.js';
import { loadAssets } from './view.js';
import { setup } from './game.js';
import { showTitle } from './newgame.js';
import { h, $, fsButton, canFullscreen, isFullscreen, toggleFullscreen } from './ui.js';

const bar = $('#loadbar'); const assets = await loadAssets('play/assets/', (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
setup(assets); $('#loading')?.remove(); showTitle();
const fsFloat = fsButton('float'); if (fsFloat) { fsFloat.id = 'fsfloat'; document.body.append(fsFloat); }
// Full screen is locked in (Matt, 22 Oct): browsers only allow it from a tap or a key, so every tap or key puts it back if the phone dropped
// out of it (a swipe, the back gesture, a call). It stays off only when the player switches it off with the full-screen button or in Options.
const saveOpts = () => { try { localStorage.setItem('hq-opts', JSON.stringify(S.opts)); } catch { /* private mode */ } };
const goFull = () => { if (S.opts.autoFull === false || !canFullscreen() || isFullscreen()) return; toggleFullscreen(); };
addEventListener('pointerup', goFull, true); addEventListener('keydown', (e) => { if (e.key !== 'Escape' && e.key !== 'F11') goFull(); }, true);
addEventListener('hq-fs-off', () => { S.opts.autoFull = false; saveOpts(); });      // the player's own choice, from the button
addEventListener('hq-fs-on', () => { S.opts.autoFull = true; saveOpts(); });
S.goFull = goFull;
import * as E from '../../engine/src/index.js';
window.HQ = S; S.E = E; S.C = C; import('./audio.js').then((m) => { S.AU = m; });
