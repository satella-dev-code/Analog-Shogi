import test from 'node:test';
import assert from 'node:assert/strict';
import { captureReach } from '../public/capture-reach.js';
import { containsPoint, bounds, GEOMETRY_SCALE, ARC_ERROR } from '../public/range-geometry.js';
import { captureDestination, movementAllows } from '../public/engine.js';

const piece = (id, type, x, y, side = 'sente') => ({ id, type, x, y, side, promoted: false });
const at = (region, x, y) => containsPoint(region.paths, { x, y });

test('pawn footprint is a direct 0.3 rounded rectangle, not a softened grid', () => {
  const p = piece(1, 'P', 6, 6), result = captureReach({ pieces: [p] }, p);
  const box = bounds(result.paths), scale = GEOMETRY_SCALE;
  assert.ok(Math.abs(box.left / scale - 5.1) < ARC_ERROR * 2);
  assert.ok(Math.abs(box.right / scale - 6.9) < ARC_ERROR * 2);
  assert.ok(Math.abs(box.top / scale - 3.7) < ARC_ERROR * 2);
  assert.ok(Math.abs(box.bottom / scale - 6.3) < ARC_ERROR * 2);
  for (let degree = 0; degree <= 90; degree += 5) {
    const angle = degree * Math.PI / 180;
    assert.equal(at(result, 6.6 + Math.cos(angle) * 0.296, 4 - Math.sin(angle) * 0.296), true);
    assert.equal(at(result, 6.6 + Math.cos(angle) * 0.304, 4 - Math.sin(angle) * 0.304), false);
  }
});

test('king footprint contains movement plus its own circular radius', () => {
  const p = piece(1, 'K', 6, 6), result = captureReach({ pieces: [p] }, p);
  assert.equal(at(result, 7.5, 6), true);
  assert.equal(at(result, 8.2, 6), true);
  assert.equal(at(result, 8.4, 6), false);
  assert.equal(at(result, 7.5, 7.5), true);
  assert.equal(at(result, 7.8, 7.8), false);
});

test('footprint can touch an enemy without reaching the enemy center', () => {
  const p = piece(1, 'P', 6, 6), enemy = piece(2, 'P', 7, 3.8, 'gote');
  const position = { pieces: [p, enemy] }, before = structuredClone(position);
  assert.equal(movementAllows(p, enemy), false);
  assert.ok(captureDestination(position, p, enemy));
  const reach = captureReach(position, p);
  assert.equal(at(reach, enemy.x, enemy.y), false);
  assert.equal(at(reach, 6.8, 4), true);
  assert.deepEqual(position, before);
});

test('clipped geometry retains blockers, holes, and the physical board edge', () => {
  const p = piece(1, 'R', 2, 6), friend = piece(2, 'G', 2, 4.5);
  assert.equal(at(captureReach({ pieces: [p] }, p), 2, 2), true);
  const blocked = captureReach({ pieces: [p, friend] }, p);
  assert.equal(at(blocked, 2, 2), false);
  assert.equal(at(blocked, friend.x, friend.y), false);
  const edge = piece(3, 'K', 0.5, 0.5), reach = captureReach({ pieces: [edge] }, edge);
  assert.equal(at(reach, 0.1, 0.5), true);
  assert.equal(at(reach, -0.01, 0.5), false);
});

test('knight footprint has separate round landing regions with no connecting travel path', () => {
  const p = piece(1, 'N', 6, 6), result = captureReach({ pieces: [p, piece(2, 'G', 6, 4)] }, p);
  assert.equal(at(result, 7.6, 2.8), true);
  assert.equal(at(result, 7.6, 1.6), true);
  assert.equal(at(result, 6, 5), false);
});
