import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderCache, createFrameScheduler } from '../public/render-cache.js';

test('render cache reuses values only for the current position and orientation', () => {
  const read = createRenderCache();
  const position = {}, next = {};
  let calls = 0;
  const compute = () => ++calls;
  assert.equal(read(position, false, 'threats', compute), 1);
  assert.equal(read(position, false, 'threats', compute), 1);
  assert.equal(read(position, false, 'drop:P', compute), 2);
  assert.equal(read(position, true, 'threats', compute), 3);
  assert.equal(read(next, true, 'threats', compute), 4);
  // Undo also invalidates rather than retaining old positions indefinitely.
  assert.equal(read(position, false, 'threats', compute), 5);
});

test('render cache retains falsy results without recomputing', () => {
  const read = createRenderCache(), position = {};
  let calls = 0;
  for (let i = 0; i < 3; i++) assert.equal(read(position, false, 'check', () => { calls++; return false; }), false);
  assert.equal(calls, 1);
});

test('pointer frames coalesce updates and cancellation prevents stale previews', () => {
  const frames = new Map();
  let id = 0, point = 0;
  const drawn = [];
  const scheduler = createFrameScheduler(() => drawn.push(point), callback => {
    frames.set(++id, callback); return id;
  }, key => frames.delete(key));
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  for (point = 1; point <= 10; point++) scheduler.schedule();
  assert.equal(frames.size, 1);
  flush();
  assert.deepEqual(drawn, [11]);
  scheduler.schedule(); scheduler.cancel(); flush();
  assert.deepEqual(drawn, [11]);
  point = 12; scheduler.schedule(); flush();
  assert.deepEqual(drawn, [11, 12]);
});
