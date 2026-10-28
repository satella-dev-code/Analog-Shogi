import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGameMode, isCpuTurn, cpuMoveDelay } from '../public/game-mode.js';
test('local, human vs CPU, and CPU vs CPU assign the intended sides', () => {
  for (const side of ['sente', 'gote']) {
    assert.equal(isCpuTurn('local', side), false);
    assert.equal(isCpuTurn('cpu', side), side === 'gote');
    assert.equal(isCpuTurn('cpu-vs-cpu', side), true);
  }
});
test('stored modes remain backward compatible and unknown modes are safe', () => {
  for (const mode of ['local', 'cpu', 'cpu-vs-cpu']) assert.equal(normalizeGameMode(mode), mode);
  for (const mode of [null, undefined, 'unknown', {}, true]) assert.equal(normalizeGameMode(mode), 'local');
  assert.ok(cpuMoveDelay('cpu-vs-cpu') > cpuMoveDelay('cpu'));
});
