// Sound for Heroes Quest.
//  * Music: eight original compositions (menu, new game, two map themes, battle, victory, defeat, title) streamed from play/audio/music.
//  * Effects and stings: short recorded sounds from play/audio/sfx and play/audio/stings, decoded once and played through Web Audio.
//  * If a recorded sound cannot be loaded, a small synthesised version stands in, so the game is never silent by accident.
// Browsers keep audio silent until the player has tapped or clicked, so everything starts on the first gesture.
// Options read from S.opts: sound, music, musicVol (0-100), fxVol (0-100), quietHidden.

import { S } from './state.js';

let ctx = null, master = null, fxBus = null, stingBus = null, musBus = null, verb = null, noiseBuf = null;
let unlocked = false, lastStep = 0, lastUi = 0;
const buffers = new Map(), loading = new Map(), lastPlayed = new Map();
let voices = 0;

const probe = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; } catch { return 'mp3'; } })();
const BASE = (() => { try { return new URL('play/audio/', document.baseURI).href; } catch { return 'play/audio/'; } })();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- levels ---------------------------------------------------------------------------------------------------------
const optOn = (k) => S.opts[k] !== false;
const vol = (k, d) => { const v = Number.isFinite(S.opts[k]) ? S.opts[k] : d; return Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6); };
const MUSIC_LEVEL = 0.42, FX_LEVEL = 1.0, STING_LEVEL = 0.42;       // loudness trims: the recorded music and stings are mastered hot, the UI sounds quiet
function applyLevels() {
  if (!ctx) return; const t = ctx.currentTime;
  musBus.gain.cancelScheduledValues(t); musBus.gain.setTargetAtTime(optOn('music') ? MUSIC_LEVEL * vol('musicVol', 70) : 0.0001, t, 0.08);
  fxBus.gain.setTargetAtTime(optOn('sound') ? FX_LEVEL * vol('fxVol', 85) : 0.0001, t, 0.03);
  stingBus.gain.setTargetAtTime(optOn('sound') ? STING_LEVEL * vol('fxVol', 85) : 0.0001, t, 0.03);
}

// ---- the context ------------------------------------------------------------------------------------------------------
function build() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 1;
  const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  master.connect(limiter); limiter.connect(ctx.destination);
  fxBus = ctx.createGain(); fxBus.connect(master); stingBus = ctx.createGain(); stingBus.connect(master); musBus = ctx.createGain(); musBus.connect(master);
  const len = Math.floor(ctx.sampleRate * 1.8); const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.3; verb.connect(wet); wet.connect(fxBus);
  const nl = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, nl, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  applyLevels();
  ctx.addEventListener?.('statechange', () => { if (ctx.state !== 'running') unlocked = false; });
  return true;
}

/** Call once at start. Audio is unlocked by the first click, tap or key press (touchend and click count as real gestures on phones). */
export function initAudio() {
  const unlock = () => {
    try { if (!ctx && !build()) return; } catch (e) { console.warn('audio unavailable', e); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older browsers */ }   // iPhone: play even with the silent switch on
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!unlocked) { try { const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch { /* ignore */ } unlocked = true; loadAll(); scenePending(); }
  };
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { if (optOn('quietHidden')) { pauseMusic(true); ctx.suspend().catch(() => {}); } }
    else { ctx.resume().catch(() => {}); pauseMusic(false); }
  });
}

// ---- recorded effects ----------------------------------------------------------------------------------------------
// logical name -> files (one is picked at random), a loudness trim, and which bus.  `cut` fades a long file out after that many seconds.
const SAMPLES = {
  click: { f: ['sfx/ui_click'], g: 2.4 }, select: { f: ['sfx/ui_select_army'], g: 1.8 }, order: { f: ['sfx/ui_confirm'], g: 2.6 },
  error: { f: ['sfx/ui_error'], g: 2.6 }, open: { f: ['sfx/ui_open'], g: 3.2 }, close: { f: ['sfx/ui_close'], g: 2.6 }, cancel: { f: ['sfx/ui_cancel'], g: 1.8 }, page: { f: ['sfx/ui_page'], g: 2 },
  step: { f: ['sfx/move_infantry'], g: 1.9, cut: 0.7 }, stepCav: { f: ['sfx/move_cavalry'], g: 1.4, cut: 0.8 }, march: { f: ['sfx/move_march_long'], g: 1.4, cut: 1.4 },
  horn: { f: ['sfx/war_horn'], g: 0.8, cut: 3.2 }, battle: { f: ['sfx/battle_begin'], g: 0.85, cut: 3.5 }, cry: { f: ['sfx/battle_cry'], g: 0.8 },
  clash: { f: ['sfx/sword_clash_1', 'sfx/sword_clash_2', 'sfx/sword_clash_3', 'sfx/sword_clash_4'], g: 1.0, gap: 0.07 }, swing: { f: ['sfx/sword_swing_1', 'sfx/sword_swing_2', 'sfx/sword_swing_3', 'sfx/sword_swing_4'], g: 1.2, gap: 0.07 },
  hit: { f: ['sfx/hit_heavy', 'sfx/hit_light'], g: 1.1, gap: 0.07 }, fall: { f: ['sfx/army_falls'], g: 1.2, gap: 0.12 }, block: { f: ['sfx/shield_block'], g: 1.1, gap: 0.08 }, arrows: { f: ['sfx/arrows_volley'], g: 1.2 },
  coin: { f: ['sfx/coins'], g: 2.2 }, coinBig: { f: ['sfx/coins_big'], g: 2 }, gong: { f: ['sfx/end_turn'], g: 2.4 }, gate: { f: ['sfx/gate_open'], g: 1.7 }, gateShut: { f: ['sfx/gate_close'], g: 1.7 },
  cheer: { f: ['sfx/city_cheer'], g: 1.2, cut: 3.5 }, built: { f: ['sfx/army_built'], g: 2 },
  chime: { f: ['stings/turn_start'], g: 1, sting: true }, victory: { f: ['stings/battle_won'], g: 1, sting: true }, defeat: { f: ['stings/battle_lost'], g: 1, sting: true },
  capture: { f: ['stings/city_captured'], g: 1, sting: true }, hero: { f: ['stings/hero_recruited'], g: 1, sting: true }, levelup: { f: ['stings/hero_level_up'], g: 1, sting: true },
  build: { f: ['stings/unit_built'], g: 1, sting: true }, ruin: { f: ['stings/ruin_discovered'], g: 1, sting: true }, temple: { f: ['stings/temple_blessing'], g: 1, sting: true },
  lost: { f: ['stings/battle_lost'], g: 0.8, sting: true },
};
async function loadOne(path) {
  if (buffers.has(path)) return buffers.get(path); if (loading.has(path)) return loading.get(path);
  const p = (async () => {
    try { const r = await fetch(`${BASE}${path}.${probe}`); if (!r.ok) throw new Error(r.status); const data = await r.arrayBuffer(); const buf = await new Promise((res, rej) => { const p2 = ctx.decodeAudioData(data, res, rej); if (p2?.then) p2.then(res, rej); }); buffers.set(path, buf); return buf; }
    catch (e) { buffers.set(path, null); return null; }
  })(); loading.set(path, p); return p;
}
function loadAll() { const files = new Set(); for (const v of Object.values(SAMPLES)) v.f.forEach((f) => files.add(f)); for (const f of files) loadOne(f); }

function playSample(name, { rate = 1, delay = 0, gain = 1 } = {}) {
  const def = SAMPLES[name]; if (!def) return false; const path = pick(def.f); const buf = buffers.get(path); if (!buf) return false;
  const now = performance.now(); if (def.gap && now - (lastPlayed.get(name) ?? -1e9) < def.gap * 1000) return true; lastPlayed.set(name, now);
  if (voices >= 14) return true;                                  // never stack an avalanche of sounds
  const t0 = ctx.currentTime + delay; const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate * (def.f.length > 1 ? rnd(0.96, 1.04) : 1);
  const g = ctx.createGain(); const lvl = (def.g ?? 1) * gain; g.gain.setValueAtTime(lvl, t0);
  let dur = buf.duration / src.playbackRate.value; if (def.cut && def.cut < dur) { g.gain.setValueAtTime(lvl, t0 + def.cut * 0.7); g.gain.linearRampToValueAtTime(0.0001, t0 + def.cut); dur = def.cut; }
  src.connect(g); g.connect(def.sting ? stingBus : fxBus); src.start(t0, 0, Math.min(buf.duration, dur + 0.05)); voices++; src.onended = () => { voices--; try { g.disconnect(); } catch { /* done */ } };
  if (def.sting) duck(Math.min(dur, 4.5));
  return true;
}
/** Lower the music while a jingle plays. */
function duck(seconds) { if (!ctx) return; const t = ctx.currentTime; const base = optOn('music') ? MUSIC_LEVEL * vol('musicVol', 70) : 0.0001; musBus.gain.cancelScheduledValues(t); musBus.gain.setTargetAtTime(base * 0.35, t, 0.1); musBus.gain.setTargetAtTime(base, t + seconds, 0.6); }

// ---- synthesised stand-ins (only used if a recording is missing) -----------------------------------------------------------
function tone({ f, type = 'sine', t = 0, a = 0.005, d = 0.2, r = 0.1, g = 0.3, lp = 0, glide = 0 }) {
  const t0 = ctx.currentTime + t; const o = ctx.createOscillator(); const v = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * glide), t0 + a + d);
  v.gain.setValueAtTime(0.0001, t0); v.gain.linearRampToValueAtTime(g, t0 + a); v.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  let n = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; } n.connect(v); v.connect(fxBus); o.start(t0); o.stop(t0 + a + d + r + 0.05);
}
function noise({ t = 0, d = 0.1, g = 0.4, f = 1000, q = 1, type = 'bandpass' }) {
  const t0 = ctx.currentTime + t; const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const v = ctx.createGain(); v.gain.setValueAtTime(0.0001, t0); v.gain.linearRampToValueAtTime(g, t0 + 0.003); v.gain.exponentialRampToValueAtTime(0.0001, t0 + d); s.connect(fl); fl.connect(v); v.connect(fxBus); s.start(t0); s.stop(t0 + d + 0.05);
}
const SYNTH = {
  click() { tone({ f: 900, type: 'triangle', d: 0.05, g: 0.3, glide: 0.8 }); }, select() { tone({ f: 600, type: 'triangle', d: 0.07, g: 0.3 }); tone({ f: 900, type: 'triangle', t: 0.06, d: 0.08, g: 0.3 }); },
  order() { tone({ f: 440, type: 'triangle', d: 0.08, g: 0.35 }); tone({ f: 330, type: 'triangle', t: 0.07, d: 0.12, g: 0.35 }); }, error() { tone({ f: 190, type: 'square', d: 0.12, g: 0.2, lp: 900 }); },
  step() { noise({ d: 0.07, g: 0.5, f: 1800, q: 1 }); tone({ f: 120, d: 0.06, g: 0.4, glide: 0.6 }); }, clash() { noise({ d: 0.12, g: 0.7, f: 3000, q: 1.5 }); tone({ f: 1500, d: 0.25, g: 0.2 }); },
  fall() { tone({ f: 260, type: 'triangle', d: 0.3, g: 0.3, glide: 0.4 }); }, victory() { [262, 330, 392, 523].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.15, d: 0.4, g: 0.35 })); },
  defeat() { [330, 294, 262, 196].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.3, d: 0.5, g: 0.3, lp: 1400 })); }, capture() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.13, d: 0.8, g: 0.25 })); },
  gong() { tone({ f: 110, d: 1.4, g: 0.5 }); tone({ f: 220, d: 1, g: 0.25 }); }, chime() { tone({ f: 659, d: 0.9, g: 0.3 }); tone({ f: 988, t: 0.18, d: 1, g: 0.25 }); }, coin() { tone({ f: 1318, type: 'square', d: 0.06, g: 0.15, lp: 4000 }); tone({ f: 1760, type: 'square', t: 0.07, d: 0.16, g: 0.15, lp: 4500 }); },
};

/** Play one effect by name. Quietly does nothing if sound is off, or the browser has not allowed audio yet. */
export function sfx(name, arg) {
  if (!ctx || ctx.state !== 'running' || !optOn('sound')) return;
  const now = performance.now();
  if (name === 'click') lastUi = now; else if ((name === 'order' || name === 'select') && now - lastUi < 60) return;     // the button's own click already made a sound
  try {
    if (name === 'clash' && arg === true && playSample('hit')) { /* heavy fight: a thud under the steel */ }
    if (!playSample(name)) SYNTH[name]?.(arg);
  } catch (e) { console.warn('sound', name, e); }
}
/** One footstep per few squares of a march: infantry tick, or hooves if the stack rides. */
export function stepSound(mounted = false) { if (!ctx || ctx.state !== 'running' || !optOn('sound')) return; const t = performance.now(); if (t - lastStep < 260) return; lastStep = t; sfx(mounted ? 'stepCav' : 'step'); }
/** Plays a few sounds so the player can judge the volume (the Test button in Options). */
export function testSound() { sfx('click'); setTimeout(() => sfx('clash', true), 250); setTimeout(() => sfx('coin'), 600); setTimeout(() => sfx('chime'), 900); }

// ---- the music ------------------------------------------------------------------------------------------------------
// Scenes: title (plays once, then the menu theme), menu, newgame, map (the two map themes in turn), victory / defeat (once, then the menu theme).
// Battle is laid over whatever is playing and lifted again afterwards.
const ONE_SHOT = { title: 'title_ashes_to_crown', victory: 'victory', defeat: 'defeat' };
const LOOPS = { menu: 'menu', newgame: 'newgame' };
const TITLES = { title_ashes_to_crown: 'Ashes to Crown', menu: 'Menu theme', newgame: 'New game theme', map1: 'Roads of the Realm', map2: 'Map theme II', battle: 'Battle theme', victory: 'Victory', defeat: 'Defeat' };
let scene = null, base = null, over = null, mapIdx = 0, wanted = null, paused = false, nowPlaying = '';
export const trackTitle = () => nowPlaying;

function makeTrack(name, loop, onEnd) {
  const el = new Audio(); el.src = `${BASE}music/${name}.${probe}`; el.loop = loop; el.preload = 'auto'; el.crossOrigin = 'anonymous';
  const g = ctx.createGain(); g.gain.value = 0.0001; let src = null; try { src = ctx.createMediaElementSource(el); src.connect(g); g.connect(musBus); } catch (e) { return null; }
  const tr = { name, el, g, src, dead: false }; if (onEnd) el.addEventListener('ended', () => { if (!tr.dead) onEnd(); }); el.addEventListener('error', () => { if (!tr.dead) console.warn('music failed to load', name); }); return tr;
}
function fadeIn(tr, s = 1.6) { if (!tr) return; const t = ctx.currentTime; tr.el.play().catch(() => {}); tr.g.gain.cancelScheduledValues(t); tr.g.gain.setValueAtTime(Math.max(0.0001, tr.g.gain.value), t); tr.g.gain.linearRampToValueAtTime(1, t + s); }
function fadeOut(tr, s = 1.2, kill = true) {
  if (!tr) return; const t = ctx.currentTime; tr.g.gain.cancelScheduledValues(t); tr.g.gain.setValueAtTime(Math.max(0.0001, tr.g.gain.value), t); tr.g.gain.linearRampToValueAtTime(0.0001, t + s);
  setTimeout(() => { if (kill) { tr.dead = true; tr.el.pause(); tr.el.removeAttribute('src'); try { tr.el.load(); tr.src.disconnect(); tr.g.disconnect(); } catch { /* gone */ } } else tr.el.pause(); }, s * 1000 + 80);
}
function startBase(name, loop, onEnd) { const old = base; base = makeTrack(name, loop, onEnd); if (old) fadeOut(old, 1.4); if (base) { nowPlaying = TITLES[name] ?? name; if (!over && !paused) fadeIn(base, 1.8); } }
function playScene(s) {
  if (s === 'title') startBase(ONE_SHOT.title, false, () => setScene('menu'));
  else if (s === 'victory' || s === 'defeat') startBase(ONE_SHOT[s], false, () => setScene('menu'));
  else if (s === 'map') { const next = () => { mapIdx = (mapIdx + 1) % 2; startBase(`map${mapIdx + 1}`, false, next); }; startBase(`map${mapIdx + 1}`, false, next); }
  else if (LOOPS[s]) startBase(LOOPS[s], true);
}
/** Choose what music suits the screen. Safe to call before audio is unlocked: it starts on the first tap. */
export function setScene(s) { wanted = s; if (!unlocked || !ctx) return; if (s === scene && base) return; scene = s; if (!optOn('music')) { scene = s; return; } playScene(s); }
function scenePending() { if (wanted && optOn('music')) { const s = wanted; scene = null; setScene(s); } }
export function pushBattle() {
  if (!ctx || !unlocked || !optOn('music') || over) return; if (base) { const t = ctx.currentTime; base.g.gain.cancelScheduledValues(t); base.g.gain.setValueAtTime(Math.max(0.0001, base.g.gain.value), t); base.g.gain.linearRampToValueAtTime(0.0001, t + 1.0); const b = base; setTimeout(() => { if (over) b.el.pause(); }, 1100); }
  over = makeTrack('battle', true); if (over) { nowPlaying = TITLES.battle; fadeIn(over, 1.2); }
}
export function popBattle() {
  if (!ctx || !over) return; const o = over; over = null; fadeOut(o, 1.4);
  if (base && optOn('music') && !paused) { nowPlaying = TITLES[base.name] ?? ''; fadeIn(base, 2); }
}
function pauseMusic(p) { paused = p; for (const t of [base, over]) { if (!t) continue; if (p) t.el.pause(); else if (t === (over ?? base)) t.el.play().catch(() => {}); } }
/** The player changed an option: apply it now. */
export function applyOptions() {
  if (!ctx) return; applyLevels();
  if (!optOn('music')) { for (const t of [base, over]) if (t) t.el.pause(); }
  else if (base || over) { (over ?? base).el.play().catch(() => {}); if (!over && base) fadeIn(base, 1); }
  else if (wanted) { scene = null; setScene(wanted); }
}
/** Skip to the other map theme (only while the map music is playing). dir = +1 / -1. Returns the new title. */
export function skipTrack(dir = 1) { if (!ctx || !unlocked || scene !== 'map' || over || !optOn('music')) return nowPlaying; mapIdx = (mapIdx + (dir > 0 ? 1 : 1)) % 2; const next = () => { mapIdx = (mapIdx + 1) % 2; startBase(`map${mapIdx + 1}`, false, next); }; startBase(`map${mapIdx + 1}`, false, next); return nowPlaying; }
export const startMusic = () => applyOptions();
export const stopMusic = () => applyOptions();
export const syncMusic = () => applyOptions();
export function status() { return { state: ctx?.state ?? 'none', format: probe, scene, nowPlaying, samples: [...buffers.values()].filter(Boolean).length, missing: [...buffers].filter(([, v]) => !v).map(([k]) => k), base: base?.name ?? null, over: over?.name ?? null, baseTime: base?.el.currentTime ?? 0, basePaused: base?.el.paused ?? null }; }
