import { S } from './state.js';
import { loadAssets } from './view.js';
import { setup } from './game.js';
import { showTitle } from './newgame.js';
import { h, $, fsButton, canFullscreen, isFullscreen, toggleFullscreen } from './ui.js';

const bar = $('#loadbar'); const assets = await loadAssets('play/assets/', (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
setup(assets); $('#loading')?.remove(); showTitle();
const fsFloat = fsButton('float'); if (fsFloat) { fsFloat.id = 'fsfloat'; document.body.append(fsFloat); }
// Open in full screen (Matt, 22 Oct): browsers only allow it from a tap or a key, so the first tap or key of the visit switches it on, and so
// does starting or continuing a game. Leaving full screen mid-game is respected until the next game starts. Options can turn this off.
const goFull = () => { if (S.opts.autoFull === false || !canFullscreen() || isFullscreen()) return; toggleFullscreen(); };
const first = () => { removeEventListener('pointerup', first, true); removeEventListener('keydown', first, true); goFull(); };
addEventListener('pointerup', first, true); addEventListener('keydown', first, true);
S.goFull = goFull;
import * as E from '../../engine/src/index.js';
window.HQ = S; S.E = E; import('./audio.js').then((m) => { S.AU = m; });
