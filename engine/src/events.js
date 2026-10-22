// An action feed. A screen can listen to everything a realm does (moves, boarding, fights, captures, hires, doctrines, sites) while it plays.
// It only listens: the hook gets copies, is never awaited, never touches g.rng, and a listener that throws is ignored, so a game with a
// hook plays exactly the same as one without. Nothing is stored in the game (nothing here is saved).
let hook = null;
export function setActionHook(fn) { hook = fn; }
export const isRecording = () => hook !== null;
/** Build the event only when somebody listens: emit(() => ({ t: 'move', ... })). */
export function emit(make) { if (!hook) return; try { hook(make()); } catch { /* a listener must never change a game */ } }
