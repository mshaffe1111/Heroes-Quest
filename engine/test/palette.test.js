import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.js';
import { generateMap } from '../src/mapgen/index.js';

test('24 owner colours: 8 realm colours, 15 spares, beige neutral', () => {
  assert.equal(Object.keys(E.PALETTE).length, 24);
  assert.equal(E.PALETTE.beige, null);
  for (const [k, v] of Object.entries(E.PALETTE)) if (k !== 'beige') assert.match(v, /^#[0-9a-f]{6}$/, k);
  assert.equal(new Set(Object.values(E.PALETTE).filter(Boolean)).size, 23);
});
test('every realm has its own ship, and the realms of a generated game carry colour and ship', () => {
  assert.equal(new Set(Object.values(E.REALM_SHIPS)).size, 8);
  const { game: g } = E.mapToGame(generateMap({ shape: 'continent', seed: 2 }));
  for (const r of g.realms.values()) { assert.ok(E.PALETTE[r.color], r.id); assert.equal(r.ship, E.REALM_SHIPS[r.id]); }
});
test('tintRing recolours only the ring band and keeps its light and dark', () => {
  const S = 232; const d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; const r = Math.hypot(x - 115.5, y - 115.5); const v = r < 96 ? 90 : r < 116 ? (x < 116 ? 200 : 120) : 60; d.set([v, v - 12, v - 30, 255], i); }
  const orig = Uint8ClampedArray.from(d);
  E.tintRing(d, S, E.PALETTE.blue);
  const at = (x, y) => (y * S + x) * 4;
  assert.deepEqual([...d.slice(at(115, 115), at(115, 115) + 4)], [...orig.slice(at(115, 115), at(115, 115) + 4)]);      // centre untouched
  assert.deepEqual([...d.slice(at(2, 2), at(2, 2) + 4)], [...orig.slice(at(2, 2), at(2, 2) + 4)]);                          // outside untouched
  const lit = at(10, 115), dim = at(222, 115);                                                                               // ring, bright side and dark side
  assert.ok(d[lit + 2] > d[lit] && d[dim + 2] > d[dim], 'blue dominates the ring');
  assert.ok(d[lit + 2] > d[dim + 2], 'the bevel light survives');
  const keep = Uint8ClampedArray.from(orig); E.tintRing(keep, S, E.PALETTE.beige); assert.deepEqual([...keep], [...orig]);   // neutral = as painted
});
