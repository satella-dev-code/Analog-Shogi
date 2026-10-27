import test from 'node:test';
import assert from 'node:assert/strict';
import { movePiece, dropPiece } from '../public/engine.js';
import { previewThreats } from '../public/preview-threats.js';

const piece = (id, type, x, y, side = 'sente', promoted = false) => ({ id, type, x, y, side, promoted });
const position = extras => ({ pieces: [piece(1, 'K', 10, 11), piece(2, 'K', 10, 0.5, 'gote'), ...extras], hands: { sente: {}, gote: {} }, turn: 'sente', log: [], nextId: 100, moveNumber: 1 });

test('move preview shows both incoming danger and captures available after moving', () => {
  const original = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 2.5, 'gote')]);
  const result = movePiece(original, 3, { x: 2, y: 4 });
  assert.ok(result.ok);
  const candidate = result.state.pieces.find(p => p.id === 3);
  const before = structuredClone(result.state);
  const hints = previewThreats(result.state, candidate);
  assert.equal(hints.endangered, true);
  assert.deepEqual([...hints.targets], [4]);
  assert.deepEqual(result.state, before, 'preview must not alter the position');
  assert.equal(original.pieces.find(p => p.id === 3).y, 6);
});

test('drop preview uses the same incoming and outgoing highlights', () => {
  const original = position([piece(4, 'P', 2, 2.5, 'gote')]);
  original.hands.sente.S = 1;
  const result = dropPiece(original, 'S', { x: 2, y: 4 });
  assert.ok(result.ok);
  const candidate = result.state.pieces.find(p => p.id === original.nextId);
  const hints = previewThreats(result.state, candidate);
  assert.equal(hints.endangered, true);
  assert.deepEqual([...hints.targets], [4]);
  assert.equal(original.hands.sente.S, 1);
});

test('preview respects blockers and does not highlight the piece already captured', () => {
  const blocked = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 2, 'gote'), piece(5, 'G', 2, 4)]);
  assert.equal(previewThreats(blocked, blocked.pieces[2]).targets.has(4), false);
  const original = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 4, 'gote')]);
  const result = movePiece(original, 3, { x: 2, y: 4 });
  assert.ok(result.ok);
  const hints = previewThreats(result.state, result.state.pieces.find(p => p.id === 3));
  assert.equal(hints.endangered, false);
  assert.equal(hints.targets.has(4), false);
});

test('preview excludes captures that would expose its own king', () => {
  const state = position([piece(3, 'R', 6, 2), piece(4, 'P', 8, 2, 'gote'), piece(5, 'R', 6, 0.5, 'gote')]);
  state.pieces[0].x = 6;
  assert.equal(previewThreats(state, state.pieces[2]).targets.has(4), false);
});

test('preview respects both threat toggles independently', () => {
  const state = position([piece(3, 'R', 2, 4), piece(4, 'P', 2, 2.5, 'gote')]);
  const candidate = state.pieces[2];
  const ownOff = previewThreats(state, candidate, { own: false, opponent: true });
  assert.equal(ownOff.endangered, false); assert.equal(ownOff.targets.has(4), true);
  const opponentOff = previewThreats(state, candidate, { own: true, opponent: false });
  assert.equal(opponentOff.endangered, true); assert.equal(opponentOff.targets.size, 0);
});

test('preview includes forced promotion movement and checks against the enemy king', () => {
  const state = position([piece(3, 'P', 2, 1), piece(4, 'P', 3.5, 0.35, 'gote')]);
  const result = movePiece(state, 3, { x: 2, y: 0.35 });
  assert.ok(result.ok);
  const candidate = result.state.pieces.find(p => p.id === 3);
  assert.equal(candidate.promoted, true);
  assert.equal(previewThreats(result.state, candidate).targets.has(4), true);
  const checking = position([piece(3, 'R', 10, 4)]);
  assert.equal(previewThreats(checking, checking.pieces[2]).targets.has(2), true);
});
