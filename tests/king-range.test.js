import test from 'node:test';
import assert from 'node:assert/strict';
import { legalKingRange } from '../public/king-range.js';
import { containsPoint } from '../public/range-geometry.js';
import { captureReach } from '../public/capture-reach.js';
import { movementAllows } from '../public/engine.js';

const p = (id, type, x, y, side = 'sente') => ({ id, type, x, y, side, promoted: false });
const position = extras => ({ pieces: [p(1, 'K', 6, 8), p(2, 'K', 10, 1, 'gote'), ...extras], turn: 'sente', hands: { sente: {}, gote: {} }, log: [], nextId: 100, moveNumber: 1 });
const at = (region, x, y) => Number(containsPoint(region.paths, { x, y }));

test('king overlay excludes enemy attacks even inside its geometric movement radius', () => {
  const state = position([p(3, 'R', 4, 5, 'gote')]);
  assert.ok(movementAllows(state.pieces[0], { x: 4.5, y: 8 }));
  const before = structuredClone(state), mask = legalKingRange(state, state.pieces[0]);
  assert.equal(at(mask, 4.5, 8), 0);
  assert.equal(at(mask, 7.5, 8), 1);
  assert.deepEqual(state, before);
});

test('capturing an attacker is shown only when the resulting board is safe', () => {
  const state = position([p(3, 'P', 6, 6.6, 'gote')]);
  assert.equal(at(legalKingRange(state, state.pieces[0]), 6, 6.6), 1);
  state.pieces.push(p(4, 'R', 6, 3, 'gote'));
  assert.equal(at(legalKingRange(state, state.pieces[0]), 6, 6.6), 0);
});

test('king cannot approach the enemy king or leave the board', () => {
  const state = position([]); state.pieces[1] = p(2, 'K', 6, 4.8, 'gote');
  const mask = legalKingRange(state, state.pieces[0]);
  assert.equal(at(mask, 6, 6.5), 0);
  assert.equal(at(mask, 6, 9.5), 1);
  assert.equal(at(captureReach(state, state.pieces[0]), 6, 6.5), 0, 'future footprint also starts from safe moves');
  state.pieces[0] = p(1, 'K', 0.5, 0.5);
  assert.equal(at(legalKingRange(state, state.pieces[0]), 0.1, 0.5), 0);
});

test('opponent overlays evaluate that king independently of the current turn', () => {
  const state = position([p(3, 'R', 4, 5, 'gote')]); state.turn = 'gote';
  const mask = legalKingRange(state, state.pieces[0]);
  assert.equal(at(mask, 7.5, 8), 1);
  assert.equal(at(mask, 4.5, 8), 0);
  assert.equal(state.turn, 'gote');
  state.winner = 'gote';
  assert.equal(legalKingRange(state, state.pieces[0]).paths.length, 0);
});

test('unobstructed king boundary follows the original circle at subpixel precision', () => {
  const king = p(1, 'K', 6, 6), region = legalKingRange({ pieces: [king] }, king);
  assert.equal(region.paths.length, 1);
  // Boundary vertices lie on the radius-2 circle, not on grid-cell corners.
  for (const vertex of region.paths[0]) {
    assert.ok(Math.abs(Math.hypot(vertex.X / 1e6 - 6, vertex.Y / 1e6 - 6) - 2) < 0.000002);
  }
  for (let degree = 0; degree < 360; degree += 5) {
    const angle = degree * Math.PI / 180;
    assert.ok(containsPoint(region.paths, { x: 6 + Math.cos(angle) * 1.998, y: 6 + Math.sin(angle) * 1.998 }));
    assert.equal(containsPoint(region.paths, { x: 6 + Math.cos(angle) * 2.002, y: 6 + Math.sin(angle) * 2.002 }), false);
  }
});
