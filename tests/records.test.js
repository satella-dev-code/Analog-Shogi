import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, movePiece, dropPiece, other } from '../public/engine.js';
import { createRecord, appendRecord, recordFromHistory, decodeRecord, readRecord, samePosition } from '../public/records.js';
const p = (id, type, x, y, side = 'sente', promoted = false) => ({ id, type, x, y, side, promoted });
function fixture() {
  return { pieces: [p(1, 'K', 10, 11), p(2, 'K', 10, 1, 'gote'), p(3, 'P', 3, 4.5), p(4, 'S', 3.1, 3, 'gote', true)], hands: { sente: {}, gote: {} }, turn: 'sente', nextId: 5, moveNumber: 1, lastMove: null, winner: null, log: [] };
}
function sequence() {
  const states = [fixture()];
  let result = movePiece(states.at(-1), 3, { x: 3.123456789, y: 3.2 }, true);
  assert.equal(result.ok, true); states.push(result.state);
  result = movePiece(states.at(-1), 2, { x: 9, y: 1.5 });
  assert.equal(result.ok, true); states.push(result.state);
  result = dropPiece(states.at(-1), 'S', { x: 6.123456789, y: 7.987654321 });
  assert.equal(result.ok, true); states.push(result.state);
  states.push({ ...states.at(-1), winner: other(states.at(-1).turn) });
  return states;
}
test('record roundtrip exactly reproduces coordinates, capture, promotion, drop and resignation', () => {
  const states = sequence();
  const record = recordFromHistory(states.slice(0, -1), states.at(-1));
  const loaded = decodeRecord(JSON.stringify(record));
  assert.deepEqual(loaded.record.steps.map(s => s.label.kind), ['move', 'move', 'drop', 'resign']);
  assert.equal(loaded.frames.length, states.length);
  states.forEach((state, index) => assert.ok(samePosition(state, loaded.frames[index])));
  assert.equal(loaded.frames[1].pieces.find(p => p.id === 3).x, 3.123456789);
  assert.equal(loaded.frames[1].hands.sente.S, 1);
  assert.equal(loaded.frames[3].hands.sente.S, undefined);
  assert.equal(loaded.frames[3].pieces.find(p => p.id === 5).y, 7.987654321);
});
test('record migration retains the earliest available position and undo can branch', () => {
  const states = sequence();
  const record = recordFromHistory(states.slice(1, 3), states[3]);
  assert.equal(record.initial.moveNumber, 2);
  assert.ok(samePosition(readRecord(record).frames[0], states[1]));
  const branched = appendRecord({ ...record, steps: record.steps.slice(0, -1) }, states[2], dropPiece(states[2], 'S', { x: 5, y: 8 }).state);
  assert.equal(readRecord(branched).frames.at(-1).pieces.find(p => p.id === 5).x, 5);
});
test('new and empty records do not mutate the live game', () => {
  const live = initialState(), original = structuredClone(live);
  const record = createRecord(live);
  const loaded = readRecord(record);
  loaded.frames[0].pieces[0].x = 4;
  assert.deepEqual(live, original);
  assert.deepEqual(record.initial.pieces[0], original.pieces[0]);
});
test('imports reject damaged files, nonfinite coordinates and broken transitions', () => {
  const record = recordFromHistory(sequence().slice(0, -1), sequence().at(-1));
  for (const mutate of [
    r => r.version = 99,
    r => r.initial.pieces[0].x = Infinity,
    r => r.initial.pieces[1].id = r.initial.pieces[0].id,
    r => r.steps[0].removed = [1],
    r => r.steps[0].turn = 'sente',
    r => r.steps[2].changed[0].id = 77,
    r => r.steps.push(r.steps[0]),
  ]) {
    const broken = structuredClone(record); mutate(broken);
    assert.throws(() => readRecord(broken));
  }
  assert.throws(() => decodeRecord('<html>'));
  assert.throws(() => decodeRecord(' '.repeat(5 * 1024 * 1024 + 1)), /大きすぎ/);
});
