import test from 'node:test';
import assert from 'node:assert/strict';
import { loupeGeometry } from '../public/touch-loupe.js';
const rect = { left: 20, right: 370, top: 180, bottom: 530, width: 350 };
const viewport = { width: 390, height: 844 };
const center = { x: 450, y: 450 };
test('touch loupe stays within the visible board and away from the finger', () => {
  for (const finger of [{ x: 50, y: 210 }, { x: 340, y: 210 }, { x: 50, y: 500 }, { x: 340, y: 500 }]) {
    const g = loupeGeometry(rect, viewport, finger, center);
    assert.ok(g);
    assert.ok(g.left >= rect.left && g.top >= rect.top);
    assert.ok(g.left + g.size <= rect.right && g.top + g.size <= rect.bottom);
    assert.ok(Math.hypot(g.left + g.size / 2 - finger.x, g.top + g.size / 2 - finger.y) > 150);
    assert.equal(g.viewBox[0] + g.span / 2, center.x);
    assert.equal(g.viewBox[1] + g.span / 2, center.y);
    assert.ok(Math.abs(g.size / g.span / (rect.width / 900) - 2.4) < 1e-10);
  }
});
test('loupe holds a safe corner and moves when the finger approaches it', () => {
  const first = loupeGeometry(rect, viewport, { x: 50, y: 500 }, center);
  const stable = loupeGeometry(rect, viewport, { x: 180, y: 400 }, center, first.corner);
  assert.equal(stable.corner, first.corner);
  const moved = loupeGeometry(rect, viewport, { x: first.left + 60, y: first.top + 60 }, center, first.corner);
  assert.notEqual(moved.corner, first.corner);
});
test('partly offscreen boards and landscape remain visible; tiny spaces hide the loupe', () => {
  const g = loupeGeometry({ ...rect, top: -50, bottom: 300 }, { width: 844, height: 390 }, { x: 80, y: 270 }, center);
  assert.ok(g.top >= 10 && g.top + g.size <= 300);
  assert.equal(loupeGeometry({ ...rect, top: 800, bottom: 1150 }, viewport, { x: 50, y: 820 }, center), null);
});
