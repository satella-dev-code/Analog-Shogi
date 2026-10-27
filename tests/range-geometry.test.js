import test from 'node:test';
import assert from 'node:assert/strict';
import { geometricMoves, kingMoves, containsPoint, pathsToSvg, bounds, GEOMETRY_SCALE } from '../public/range-geometry.js';
import { validateMove } from '../public/engine.js';
const p = (id, type, x, y, side = 'sente', promoted = false) => ({ id, type, x, y, side, promoted });
const position = pieces => ({ pieces, turn: 'sente', hands: { sente: {}, gote: {} }, log: [], nextId: 100, moveNumber: 1 });

test('vector movement agrees with committed move validation across all piece shapes', () => {
  for (const [type, promoted] of [['P', false], ['G', false], ['S', false], ['L', false], ['N', false], ['R', false], ['B', false], ['P', true], ['N', true], ['R', true], ['B', true]]) {
    const mover = p(3, type, 5, 7, 'sente', promoted);
    const state = position([p(1, 'K', 11, 11), p(2, 'K', 11, 0.5, 'gote'), mover, p(4, 'P', 5, 3, 'gote'), p(5, 'G', 5.6, 5.4)]);
    const region = geometricMoves(state, mover);
    for (let x = 0.625; x < 11.7; x += 0.5) for (let y = 0.625; y < 11.7; y += 0.5) {
      assert.equal(containsPoint(region, { x, y }), validateMove(state, mover.id, { x, y }).ok, `${type}/${promoted}: ${x},${y}`);
    }
  }
});

test('continuous king regions agree with resulting-board check validation', () => {
  const cases = [
    [p(2, 'K', 10, 1, 'gote'), p(3, 'R', 4, 5, 'gote')],
    [p(2, 'K', 6, 4.8, 'gote')],
    [p(2, 'K', 10, 1, 'gote'), p(3, 'P', 6, 6.6, 'gote')],
    [p(2, 'K', 10, 1, 'gote'), p(3, 'P', 6, 6.6, 'gote'), p(4, 'R', 6, 3, 'gote')],
    [p(2, 'K', 10, 1, 'gote'), p(3, 'B', 3, 4, 'gote'), p(4, 'G', 5, 7)],
    [p(2, 'K', 10, 1, 'gote'), p(3, 'N', 4.4, 4.8, 'gote')],
  ];
  for (const enemies of cases) {
    const king = p(1, 'K', 6, 8), state = position([king, ...enemies]), before = structuredClone(state);
    const region = kingMoves(state, king);
    for (let dx = -1.875; dx <= 1.875; dx += 0.25) for (let dy = -1.875; dy <= 1.875; dy += 0.25) {
      const to = { x: king.x + dx, y: king.y + dy };
      assert.equal(containsPoint(region, to), validateMove(state, king.id, to).ok, `${JSON.stringify(enemies)}: ${to.x},${to.y}`);
    }
    assert.deepEqual(state, before);
  }
});

test('geometry caches invalidate when a piece or a blocking board changes', () => {
  const king = p(1, 'K', 6, 8), rook = p(3, 'R', 4, 5, 'gote');
  const state = position([king, p(2, 'K', 10, 1, 'gote'), rook]);
  assert.equal(containsPoint(kingMoves(state, king), { x: 4.5, y: 8 }), false);
  rook.x = 1;
  assert.equal(containsPoint(kingMoves(state, king), { x: 4.5, y: 8 }), true);
  king.x = 8;
  assert.equal(containsPoint(kingMoves(state, king), { x: 4.5, y: 8 }), false);
});

test('vector output has closed finite contours, without raster or smoothing commands', () => {
  const mover = p(3, 'R', 5, 7), state = position([mover, p(4, 'G', 5, 5)]);
  const paths = geometricMoves(state, mover), svg = pathsToSvg(paths);
  assert.match(svg, /^M/); assert.match(svg, /Z$/);
  assert.doesNotMatch(svg, /NaN|Infinity|Q/);
  const box = bounds(paths);
  assert.ok(box.left >= 0 && box.right <= 12 * GEOMETRY_SCALE);
});
