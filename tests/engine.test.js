import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, RADIUS, MOVE_RANGE, BAND_HALF_WIDTH, PAWN_HALF_WIDTH, KNIGHT, initialState, movementAllows, pathClear, validateMove, movePiece, createDropValidator, validateDrop, dropPiece, isInCheck, captureDestination, threatenedPieceIds, hasFutureMove, inBoard } from '../public/engine.js';

const piece = (id, type, x, y, side = 'sente', promoted = false) => ({ id, type, x, y, side, promoted });
function position(extras = [], turn = 'sente') {
  return { pieces: [piece(1, 'K', 8, 8), piece(2, 'K', 8, 0.5, 'gote'), ...extras], hands: { sente: {}, gote: {} }, turn, nextId: 100, moveNumber: 1, lastMove: null, winner: null, log: [] };
}

test('initial board has 40 unique pieces, no overlap and no check', () => {
  const s = initialState();
  assert.equal(s.pieces.length, 40);
  assert.equal(new Set(s.pieces.map(p => p.id)).size, 40);
  for (const p of s.pieces) {
    assert.ok(inBoard(p));
    assert.ok(s.pieces.every(q => p.id === q.id || Math.hypot(p.x - q.x, p.y - q.y) >= 2 * RADIUS));
  }
  assert.equal(isInCheck(s, 'sente'), false);
  assert.equal(isInCheck(s, 'gote'), false);
});

test('pawn moves anywhere in its forward rectangle, including its corners', () => {
  const p = piece(3, 'P', 4.5, 5);
  for (const dx of [-PAWN_HALF_WIDTH, 0, PAWN_HALF_WIDTH]) {
    assert.ok(movementAllows(p, { x: p.x + dx, y: p.y - MOVE_RANGE.P }));
    assert.ok(movementAllows(p, { x: p.x + dx, y: p.y - 0.001 }));
  }
  assert.equal(movementAllows(p, { x: p.x + PAWN_HALF_WIDTH + 0.001, y: 4 }), false);
  assert.equal(movementAllows(p, { x: p.x, y: p.y - MOVE_RANGE.P - 0.001 }), false);
  assert.equal(movementAllows(p, { x: p.x + 0.2, y: p.y }), false);
  assert.equal(movementAllows(p, { x: p.x, y: p.y + 0.1 }), false);
  assert.equal(movementAllows(p, p), false);
});

test('gote forward direction is inverted', () => {
  const p = piece(3, 'P', 4, 4, 'gote');
  assert.ok(movementAllows(p, { x: 4.1, y: 4.6 }));
  assert.equal(movementAllows(p, { x: 4, y: 3.5 }), false);
});

test('king uses the expanded circular Euclidean range', () => {
  const p = piece(3, 'K', 4, 4);
  assert.ok(movementAllows(p, { x: 5.2, y: 5.6 }));
  assert.equal(movementAllows(p, { x: 5.5, y: 5.5 }), false);
});

test('gold excludes backward diagonals; silver excludes sideways and directly back', () => {
  const g = piece(3, 'G', 4, 4), s = { ...g, type: 'S' };
  assert.ok(movementAllows(g, { x: 4, y: 4.8 }));
  assert.ok(movementAllows(g, { x: 4.8, y: 4 }));
  assert.equal(movementAllows(g, { x: 4.5, y: 4.5 }), false);
  assert.ok(movementAllows(s, { x: 4.5, y: 4.5 }));
  assert.equal(movementAllows(s, { x: 4, y: 4.5 }), false);
  assert.equal(movementAllows(s, { x: 4.8, y: 4 }), false);
});

test('long range pieces allow a constant-width band on either side of each ray', () => {
  const b = piece(3, 'B', 4, 4), r = piece(3, 'R', 4, 4), l = piece(3, 'L', 4, 4);
  const diagonalOffset = BAND_HALF_WIDTH * Math.SQRT2;
  for (const sign of [-1, 1]) {
    assert.ok(movementAllows(b, { x: 7, y: 7 + sign * diagonalOffset }));
    assert.equal(movementAllows(b, { x: 7, y: 7 + sign * (diagonalOffset + 0.001) }), false);
    assert.ok(movementAllows(r, { x: 4 + sign * BAND_HALF_WIDTH, y: 0.4 }));
    assert.equal(movementAllows(r, { x: 4 + sign * (BAND_HALF_WIDTH + 0.001), y: 0.4 }), false);
    assert.ok(movementAllows(l, { x: 4 + sign * BAND_HALF_WIDTH, y: 1 }));
  }
  assert.equal(movementAllows(l, { x: 4.2, y: 5 }), false);
  assert.equal(movementAllows(r, { x: 4.61, y: 4.61 }), false);
  assert.equal(movementAllows(b, { x: 4, y: 5 }), false);
});

test('knight lands within the expanded forward disks and jumps blockers', () => {
  const p = piece(3, 'N', 4, 5);
  const s = position([p, piece(4, 'P', 4.75, 3.6)]);
  assert.ok(movementAllows(p, { x: 5.7, y: 2.3 }));
  assert.equal(movementAllows(p, { x: 4, y: 2.2 }), false);
  assert.ok(pathClear(s, p, { x: 5.5, y: 2.2 }));
  s.pieces.push(piece(5, 'P', 5.5, 2.2, 'gote'));
  assert.equal(pathClear(s, p, { x: 5.5, y: 2.2 }), false);
});

test('slider center lines collide only with the occluded part', () => {
  const p = piece(3, 'R', 2, 6);
  const s = position([p, piece(4, 'P', 2 + RADIUS - 0.01, 4)]);
  assert.equal(pathClear(s, p, { x: 2, y: 2 }), false);
  s.pieces[3].x = 2 + RADIUS;
  assert.ok(pathClear(s, p, { x: 2, y: 2 }));
});

test('board boundary accounts for full piece radius', () => {
  const s = position([piece(3, 'R', 2, 4)]);
  assert.ok(validateMove(s, 3, { x: 2, y: RADIUS }).ok);
  assert.equal(validateMove(s, 3, { x: 2, y: RADIUS - 0.01 }).ok, false);
  assert.equal(inBoard({ x: NaN, y: 3 }), false);
});

test('overlapping captures demote the enemy and retain the requested coordinate', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote', true)]);
  assert.ok(validateMove(s, 3, { x: 2, y: 3.1 }).ok);
  const r = movePiece(s, 3, { x: 2, y: 3.1 });
  assert.equal(r.state.pieces.find(p => p.id === 3).y, 3.1);
  assert.ok(r.ok);
  assert.equal(r.state.hands.sente.P, 1);
  assert.equal(r.state.pieces.some(p => p.id === 4), false);
  assert.equal(r.state.turn, 'gote');
  assert.equal(r.state.moveNumber, 2);
  assert.equal(s.pieces.length, 4, 'input state remains immutable');
});

test('cannot move through a blocker to capture', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote'), piece(5, 'P', 2, 4.5)]);
  assert.equal(validateMove(s, 3, { x: 2, y: 3 }).ok, false);
});

test('cannot move opponent pieces or capture friendly pieces or king', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3), piece(5, 'R', 8, 3)]);
  assert.equal(validateMove(s, 2, { x: 8, y: 1 }).ok, false);
  assert.equal(validateMove(s, 3, { x: 2, y: 3 }).ok, false);
  assert.equal(validateMove(s, 5, { x: 8, y: 0.5 }).ok, false);
});

test('rook check is blocked by piece width, and discovered check is illegal', () => {
  const s = position([piece(3, 'R', 8, 3, 'gote'), piece(4, 'G', 8, 4.5)]);
  assert.equal(isInCheck(s, 'sente'), false);
  assert.equal(validateMove(s, 4, { x: 8.8, y: 4.5 }).ok, false);
  s.pieces = s.pieces.filter(p => p.id !== 4);
  assert.ok(isInCheck(s, 'sente'));
});

test('king cannot move into enemy range', () => {
  const s = position([piece(3, 'R', 7, 3, 'gote')]);
  assert.equal(validateMove(s, 1, { x: 7, y: 8 }).ok, false);
});

test('promotion is available when entering, leaving or moving within enemy zone', () => {
  for (const [fromY, toY] of [[4.2, 3.7], [3.9, 4.4], [3, 2.6]]) {
    const s = position([piece(3, 'S', 3, fromY)]);
    const result = validateMove(s, 3, { x: 3.3, y: toY });
    assert.ok(result.ok);
    assert.ok(result.canPromote);
    assert.ok(movePiece(s, 3, { x: 3.3, y: toY }, true).state.pieces.find(p => p.id === 3).promoted);
  }
});

test('pawn promotion is forced only at the forward edge', () => {
  const s = position([piece(3, 'P', 3, 0.8)]);
  assert.ok(validateMove(s, 3, { x: 3, y: RADIUS }).mustPromote);
  assert.ok(movePiece(s, 3, { x: 3, y: RADIUS }).state.pieces.find(p => p.id === 3).promoted);
  assert.equal(validateMove(s, 3, { x: 3, y: RADIUS + 0.001 }).mustPromote, false);
});

test('knight dead positions account for full landing disks', () => {
  assert.equal(hasFutureMove(piece(3, 'N', 3, KNIGHT.forward - KNIGHT.radius + RADIUS - 0.01)), false);
  assert.ok(hasFutureMove(piece(3, 'N', 3, KNIGHT.forward - KNIGHT.radius + RADIUS + 0.01)));
  assert.equal(hasFutureMove(piece(3, 'N', 3, SIZE - (KNIGHT.forward - KNIGHT.radius + RADIUS - 0.01), 'gote')), false);
});

test('promoted minor pieces move as gold; horse and dragon add unit disk', () => {
  for (const type of ['P', 'L', 'N', 'S']) {
    const p = piece(3, type, 4, 4, 'sente', true);
    assert.ok(movementAllows(p, { x: 4.8, y: 4 }));
    assert.equal(movementAllows(p, { x: 4.5, y: 4.5 }), false);
  }
  assert.ok(movementAllows(piece(3, 'B', 4, 4, 'sente', true), { x: 4.3, y: 4.5 }));
  assert.ok(movementAllows(piece(3, 'R', 4, 4, 'sente', true), { x: 4.3, y: 4.5 }));
});

test('drops use arbitrary positions, consume hand and cannot overlap', () => {
  const s = position(); s.hands.sente.P = 2;
  const r = dropPiece(s, 'P', { x: 3.1234, y: 4.5678 });
  assert.ok(r.ok);
  assert.equal(r.state.pieces.at(-1).x, 3.1234);
  assert.equal(r.state.hands.sente.P, 1);
  assert.equal(r.state.nextId, 101);
  assert.equal(validateDrop(s, 'P', { x: 8, y: 8 }).ok, false);
  assert.equal(validateDrop(s, 'R', { x: 3, y: 4 }).ok, false);
});

test('dead drops are rejected and two pawns are allowed', () => {
  const s = position([piece(3, 'P', 3, 5)]); s.hands.sente.P = 2; s.hands.sente.N = 1;
  assert.equal(validateDrop(s, 'P', { x: 3, y: RADIUS }).ok, false);
  assert.equal(validateDrop(s, 'N', { x: 3, y: 1 }).ok, false);
  assert.ok(validateDrop(s, 'P', { x: 3, y: 4 }).ok);
});

test('a drop can block check but unrelated drops cannot', () => {
  const s = position([piece(3, 'R', 8, 3, 'gote')]); s.hands.sente.G = 1;
  assert.ok(isInCheck(s, 'sente'));
  assert.ok(validateDrop(s, 'G', { x: 8, y: 4.5 }).ok);
  assert.equal(validateDrop(s, 'G', { x: 3, y: 6 }).ok, false);
});

test('broader short ranges preserve directional restrictions', () => {
  for (const type of ['P', 'G', 'S']) {
    const p = piece(3, type, 4, 5);
    assert.ok(movementAllows(p, { x: 4, y: 5 - MOVE_RANGE[type] }));
    assert.equal(movementAllows(p, { x: 4, y: 5 - MOVE_RANGE[type] - 0.001 }), false);
  }
  const p = piece(3, 'N', 4, 5);
  assert.ok(movementAllows(p, { x: 4 + KNIGHT.lateral + KNIGHT.radius, y: 5 - KNIGHT.forward }));
  assert.equal(movementAllows(p, { x: 4 + KNIGHT.lateral + KNIGHT.radius + 0.001, y: 5 - KNIGHT.forward }), false);
});

test('capture and check use the widened bands too', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2.4, 2, 'gote')]);
  assert.ok(movePiece(s, 3, { x: 2.4, y: 2 }).ok);
  const check = position([piece(3, 'R', 7.6, 3, 'gote')]);
  assert.ok(isInCheck(check, 'sente'));
  check.pieces.at(-1).x = 6.79;
  assert.equal(isInCheck(check, 'sente'), false);
  const diagonal = position([piece(3, 'B', 2, 6), piece(4, 'P', 4.4, 3.9, 'gote')]);
  assert.ok(movePiece(diagonal, 3, { x: 4.4, y: 3.9 }).ok);
});

test('new formation increases separation while keeping 40 symmetric pieces', () => {
  const s = initialState();
  const minDistance = Math.min(...s.pieces.flatMap(p => s.pieces.filter(q => q.id !== p.id).map(q => Math.hypot(p.x - q.x, p.y - q.y))));
  assert.ok(minDistance >= SIZE / 9 - 1e-7);
  assert.ok(minDistance - 2 * RADIUS > 0.63);
  for (const p of s.pieces.filter(p => p.side === 'sente')) {
    assert.ok(s.pieces.some(q => q.side === 'gote' && q.type === p.type && Math.abs(q.x - (SIZE - p.x)) < 1e-7 && Math.abs(q.y - (SIZE - p.y)) < 1e-7));
    if (p.type === 'P') assert.ok(validateMove(s, p.id, { x: p.x, y: p.y - 1.5 }).ok);
  }
});

test('finished game rejects moves and drops', () => {
  const s = position(); s.winner = 'gote'; s.hands.sente.P = 1;
  assert.equal(validateMove(s, 1, { x: 7.5, y: 8 }).ok, false);
  assert.equal(validateDrop(s, 'P', { x: 3, y: 4 }).ok, false);
});

test('a sequence of continuous moves preserves turn, history and position', () => {
  let s = initialState();
  for (const [side, x, y] of [['sente', 6.12, 7.4], ['gote', 5.88, 4.6], ['sente', 6.21, 6.4], ['gote', 5.79, 5.4]]) {
    assert.equal(s.turn, side);
    const p = s.pieces.find(p => p.side === side && p.type === 'P' && Math.abs(p.x - SIZE / 2) < 0.3);
    const r = movePiece(s, p.id, { x, y });
    assert.ok(r.ok, r.reason); s = r.state;
  }
  assert.equal(s.log.length, 4);
  assert.equal(s.turn, 'sente');
});


test('pawn rectangle corners allow capture and attack for either side', () => {
  const s = position([piece(3, 'P', 4, 5), piece(4, 'S', 4.6, 3, 'gote')]);
  assert.ok(movePiece(s, 3, { x: 4.6, y: 3 }).ok);
  const gote = piece(3, 'P', 4, 5, 'gote');
  assert.ok(movementAllows(gote, { x: 3.4, y: 7 }));
  assert.equal(movementAllows(gote, { x: 3.4, y: 5 }), false);
  assert.equal(movementAllows(gote, { x: 3.4, y: 4.9 }), false);
  const check = position([piece(3, 'P', 7.4, 6, 'gote')]);
  assert.ok(isInCheck(check, 'sente'));
});


test('slider can pass the visible edge of a blocked band but not its shadow', () => {
  for (const type of ['R', 'L']) {
    const p = piece(3, type, 4, 8);
    const s = position([p, piece(4, 'P', 4, 5)]);
    assert.equal(validateMove(s, p.id, { x: 4, y: 4.5 }).ok, false);
    assert.ok(validateMove(s, p.id, { x: 4.6, y: 4.5 }).ok);
    assert.equal(validateMove(s, p.id, { x: 4.4, y: 5 }).ok, false, 'landing overlap remains prohibited');
  }
  const b = piece(3, 'B', 2, 8);
  const s = position([b, piece(4, 'P', 4, 6)]);
  assert.equal(validateMove(s, b.id, { x: 4.5, y: 5.5 }).ok, false);
  assert.ok(validateMove(s, b.id, { x: 4.9, y: 5.9 }).ok);
});


test('threat highlights evaluate both sides independently of turn', () => {
  const s = position([piece(3, 'P', 3, 6), piece(4, 'P', 3.4, 4.5, 'gote')]);
  const before = structuredClone(s);
  assert.deepEqual([...threatenedPieceIds(s)].sort(), [3, 4]);
  s.turn = 'gote';
  assert.deepEqual([...threatenedPieceIds(s)].sort(), [3, 4]);
  s.turn = 'sente';
  assert.deepEqual(s, before);
});

test('threat highlights exclude blocked captures and pinned attackers', () => {
  const blocked = position([piece(3, 'G', 2, 6), piece(4, 'R', 2, 2, 'gote'), piece(5, 'P', 2, 3.5)]);
  assert.equal(threatenedPieceIds(blocked).has(3), false);
  const pinned = position([piece(3, 'R', 8, 6), piece(4, 'R', 8, 4, 'gote'), piece(5, 'G', 7, 4)]);
  assert.equal(threatenedPieceIds(pinned).has(5), false);
  assert.ok(threatenedPieceIds(pinned).has(3));
});

test('checked kings are highlighted but finished games have no threats', () => {
  const s = position([piece(3, 'R', 8, 4, 'gote')]);
  assert.ok(threatenedPieceIds(s).has(1));
  s.winner = 'gote';
  assert.equal(threatenedPieceIds(s).size, 0);
});


test('all non-jumping pieces share center-line clearance and landing clearance', () => {
  const cases = [
    ['K', false, { x: 4, y: 4.2 }],
    ['P', false, { x: 4, y: 4.2 }],
    ['S', false, { x: 4, y: 4.2 }],
    ['G', false, { x: 4, y: 4.2 }],
    ['L', false, { x: 4, y: 4.2 }],
    ['R', false, { x: 4, y: 4.2 }],
    ['B', false, { x: 5.3, y: 4.7 }],
    ['P', true, { x: 4, y: 4.2 }],
    ['L', true, { x: 4, y: 4.2 }],
    ['N', true, { x: 4, y: 4.2 }],
    ['S', true, { x: 4, y: 4.2 }],
    ['R', true, { x: 4, y: 4.2 }],
    ['B', true, { x: 4, y: 4.2 }],
  ];
  for (const [type, promoted, to] of cases) {
    const p = piece(3, type, 4, 6, 'sente', promoted);
    const dx = to.x - p.x, dy = to.y - p.y, distance = Math.hypot(dx, dy);
    const obstacle = piece(4, 'P', (p.x + to.x) / 2 - dy / distance * 0.4, (p.y + to.y) / 2 + dx / distance * 0.4, 'gote');
    const s = position([p, obstacle]);
    assert.ok(movementAllows(p, to), type);
    assert.ok(pathClear(s, p, to), `${type}: visible side passes`);
    obstacle.x = (p.x + to.x) / 2; obstacle.y = (p.y + to.y) / 2;
    assert.equal(pathClear(s, p, to), false, `${type}: center is blocked`);
    obstacle.x = to.x + 0.5; obstacle.y = to.y;
    assert.equal(pathClear(s, p, to), false, `${type}: overlapping landing blocked`);
  }
});


test('prepared drop map agrees with king-safety simulation, including multiple attacks and knights', () => {
  for (const extras of [[], [piece(3, 'R', 8, 3, 'gote')], [piece(3, 'R', 8, 3, 'gote'), piece(4, 'B', 4, 4, 'gote')], [piece(3, 'N', 6.4, 4.8, 'gote')]]) {
    const s = position(extras); s.hands.sente.G = 1;
    const check = createDropValidator(s, 'G');
    for (let x = 0.5; x < SIZE; x += 0.5) for (let y = 0.5; y < SIZE; y += 0.5) {
      const to = { x, y };
      const clear = s.pieces.every(p => Math.hypot(p.x - x, p.y - y) >= 2 * RADIUS - 1e-7);
      const simulated = { ...s, pieces: [...s.pieces, piece(100, 'G', x, y)] };
      assert.equal(check(to).ok, clear && !isInCheck(simulated, 'sente'), `${x},${y}`);
    }
  }
});


test('overlap capture rejects friends, two enemies, and capture by dropping', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote'), piece(5, 'P', 3, 3, 'gote')]);
  assert.equal(validateMove(s, 3, { x: 2.5, y: 3 }).ok, false);
  s.pieces.pop();
  assert.ok(validateMove(s, 3, { x: 2.5, y: 3 }).ok);
  s.pieces.at(-1).side = 'sente';
  assert.equal(validateMove(s, 3, { x: 2.5, y: 3 }).ok, false);
  s.pieces.at(-1).side = 'gote'; s.hands.sente.G = 1;
  assert.equal(validateDrop(s, 'G', { x: 2.5, y: 3 }).ok, false);
});

test('overlap at the far corner captures and checks even beyond center reach', () => {
  const s = position([piece(3, 'P', 4, 6), piece(4, 'S', 5.19, 3.99, 'gote')]);
  const r = movePiece(s, 3, { x: 4.6, y: 4 });
  assert.ok(r.ok); assert.equal(r.state.hands.sente.S, 1);
  const check = position([piece(3, 'P', 6.81, 5.99, 'gote')]);
  assert.ok(isInCheck(check, 'sente'));
  check.pieces.at(-1).x = 6.79;
  assert.equal(isInCheck(check, 'sente'), false);
});

test('touching without overlap does not capture and near-capture cannot bypass a blocker', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote')]);
  assert.equal(validateMove(s, 3, { x: 2, y: 3 + 2 * RADIUS }).captured, undefined);
  assert.ok(validateMove(s, 3, { x: 2, y: 3 + 2 * RADIUS - 0.001 }).captured);
  s.pieces.push(piece(5, 'G', 2, 4.5));
  assert.equal(validateMove(s, 3, { x: 2, y: 3.6 }).ok, false);
});


test('capture destination finds overlap beyond the center reach for each movement shape', () => {
  for (const [type, x, y] of [['K', 6.5, 6], ['P', 5.19, 3.99], ['G', 6.49, 6.4], ['S', 4, 3.3], ['L', 5.1, 2], ['R', 5.1, 2], ['B', 7.2, 4], ['N', 6.6, 2.8]]) {
    const p = piece(3, type, 4, 6), target = piece(4, 'P', x, y, 'gote');
    const s = position([p, target]);
    assert.equal(movementAllows(p, target), false, type);
    const to = captureDestination(s, p, target);
    assert.ok(to, `${type}: overlap sliver exists`);
    assert.ok(validateMove(s, p.id, to).ok, type);
    assert.equal(validateMove(s, p.id, to).captured.id, target.id, type);
  }
});

test('danger detects captures that must keep shielding the king, despite tiny coordinate changes', () => {
  const cases = [
    [6.575, 0.7, 6.18, 1.08],
    [6.575000000000001, 0.7, 6.18, 1.08],
    [6.574999999999999, 0.7, 6.18, 1.08],
    [6.720000000000003, 0.7, 6.25, 1.06],
    [6.820000000000005, 1.7000000000000004, 6.23, 1.65],
  ];
  for (const [x, y, toX, toY] of cases) {
    for (const rotate of [false, true]) {
      const s = position([piece(3, 'R', 6, 1.5), piece(4, 'P', x, y, 'gote'), piece(5, 'R', 6, 0.5, 'gote')]);
      Object.assign(s.pieces[0], { x: 6, y: 11 });
      Object.assign(s.pieces[1], { x: 10, y: 1 });
      const to = { x: toX, y: toY };
      if (rotate) {
        for (const p of s.pieces) { p.x = SIZE - p.x; p.y = SIZE - p.y; p.side = p.side === 'sente' ? 'gote' : 'sente'; }
        s.turn = 'gote'; to.x = SIZE - to.x; to.y = SIZE - to.y;
      }
      const legal = validateMove(s, 3, to);
      assert.ok(legal.ok); assert.equal(legal.captured.id, 4);
      const destination = captureDestination(s, s.pieces[2], s.pieces[3], true);
      assert.ok(destination, `safe capture at pawn x=${x}`);
      assert.ok(validateMove(s, 3, destination).ok);
      assert.ok(threatenedPieceIds(s).has(4));
    }
  }
});

test('validation ignores move history and committed moves keep the original state untouched', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote')]);
  Object.defineProperty(s, 'log', { enumerable: true, get() { throw new Error('validation read move history'); } });
  assert.ok(validateMove(s, 3, { x: 2, y: 3 }).ok);
  const original = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote')]);
  const before = structuredClone(original);
  const result = movePiece(original, 3, { x: 2, y: 3 });
  assert.ok(result.ok); assert.deepEqual(original, before);
  assert.equal(result.state.hands.sente.P, 1);
  assert.equal(result.state.log.length, 1);
});

test('smaller collision circles leave a 0.65 gap legal and capture only below 0.6', () => {
  const s = position([piece(3, 'R', 2, 6), piece(4, 'P', 2, 3, 'gote')]);
  const outside = validateMove(s, 3, { x: 2, y: 3.65 });
  assert.ok(outside.ok); assert.equal(outside.captured, undefined);
  assert.equal(validateMove(s, 3, { x: 2, y: 3.59 }).captured.id, 4);
  s.pieces[3].side = 'sente';
  assert.ok(validateMove(s, 3, { x: 2, y: 3.65 }).ok);
  assert.equal(validateMove(s, 3, { x: 2, y: 3.59 }).ok, false);
  const corridor = position([piece(3, 'R', 2, 6), piece(4, 'P', 2.32, 4)]);
  assert.ok(validateMove(corridor, 3, { x: 2, y: 2 }).ok);
});
