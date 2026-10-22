import { S } from './state.js';
import { loadAssets } from './view.js';
import { setup } from './game.js';
import { showTitle } from './newgame.js';
import { h, $ } from './ui.js';

const bar = $('#loadbar'); const assets = await loadAssets('play/assets/', (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
setup(assets); $('#loading')?.remove(); showTitle();
import * as E from '../../engine/src/index.js';
window.HQ = S; S.E = E; import('./audio.js').then((m) => { S.AU = m; });
