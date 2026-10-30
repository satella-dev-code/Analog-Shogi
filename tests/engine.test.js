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

test('rook-block mode keeps uniform setup and restricts only rooks including promoted rooks', () => {
  const s = initialState('rook-block');
  assert.deepEqual(s.pieces, initialState().pieces);
  for (const type of ['R', 'L', 'P', 'G', 'S', 'B']) for (const promoted of [false, true]) {
    const mover = piece(3, type, 2, 6, 'sente', promoted);
    const state = { ...position([mover, piece(4, 'P', 2.4, 4)]), collisionMode: 'rook-block' };
    assert.equal(pathClear(state, mover, { x: 2, y: 2 }), type !== 'R');
  }
  for (const side of ['sente', 'gote']) {
    const state = { ...s, turn: side }, bishop = state.pieces.find(p => p.type === 'B' && p.side === side);
    const to = side === 'sente' ? { x: .4, y: 6.8 } : { x: SIZE - .4, y: SIZE - 6.8 };
    assert.ok(validateMove(state, bishop.id, to).ok);
    assert.equal(movementAllows(bishop, { x: bishop.x + 3, y: bishop.y - 1.95 }, state), false);
  }
});

test('wide-bishop mode keeps uniform setup and widens only bishop diagonal movement', () => {
  const initial = initialState('wide-bishop');
  assert.deepEqual(initial.pieces, initialState().pieces);
  for (const promoted of [false, true]) {
    const bishop = piece(3, 'B', 2, 6, 'sente', promoted);
    const state = { ...position([bishop]), collisionMode: 'wide-bishop' };
    const to = { x: 5, y: 4.05 };
    assert.equal(movementAllows(bishop, to), false);
    assert.equal(movementAllows(bishop, to, state), true);
    assert.ok(movePiece(state, bishop.id, to).ok);
    assert.equal(movementAllows(bishop, { x: 5, y: 4.14 }, state), false);
  }
  const rook = piece(3, 'R', 2, 6);
  assert.equal(movementAllows(rook, { x: 2.7, y: 3 }, initial), false);
  const bishop = initial.pieces.find(p => p.side === 'sente' && p.type === 'B');
  assert.equal(validateMove(initial, bishop.id, { x: 4.05, y: 6 }).ok, false, 'wider movement alone does not open the pawn wall');
});

test('experimental formation opens both bishops and has no sampled first-move rook checks', () => {
  const state = initialState('formation');
  assert.equal(state.collisionMode, 'formation');
  for (const side of ['sente', 'gote']) {
    const s = { ...state, turn: side };
    assert.equal(isInCheck(s, side), false);
    for (const p of s.pieces) {
      assert.ok(inBoard(p));
      assert.ok(s.pieces.every(q => q.id === p.id || Math.hypot(q.x - p.x, q.y - p.y) >= 2 * RADIUS - 1e-7));
      assert.ok(s.pieces.some(q => q.side !== p.side && q.type === p.type && Math.abs(q.x - (SIZE - p.x)) < 1e-7 && Math.abs(q.y - (SIZE - p.y)) < 1e-7));
    }
    const bishop = s.pieces.find(p => p.side === side && p.type === 'B');
    const to = side === 'sente' ? { x: 4.05, y: 6 } : { x: SIZE - 4.05, y: SIZE - 6 };
    assert.ok(validateMove(s, bishop.id, to).ok);
    const rook = s.pieces.find(p => p.side === side && p.type === 'R');
    let legal = 0;
    for (let x = RADIUS; x <= SIZE - RADIUS + 1e-7; x += .1) for (let y = RADIUS; y <= SIZE - RADIUS + 1e-7; y += .1) {
      if (!movementAllows(rook, { x, y }) || !validateMove(s, rook.id, { x, y }).ok) continue;
      legal++;
      const next = { ...s, pieces: s.pieces.map(p => p.id === rook.id ? { ...p, x, y } : p) };
      assert.equal(isInCheck(next, side === 'sente' ? 'gote' : 'sente'), false, `${side} rook at ${x},${y}`);
    }
    assert.ok(legal > 0);
  }
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

test('slider disks need both radii of path clearance', () => {
  const p = piece(3, 'R', 2, 6);
  const s = position([p, piece(4, 'P', 2 + 2 * RADIUS - 0.01, 4)]);
  assert.equal(pathClear(s, p, { x: 2, y: 2 }), false);
  s.pieces[3].x = 2 + 2 * RADIUS;
  assert.ok(pathClear(s, p, { x: 2, y: 2 }));
});

test('center-line mode keeps the former path rule without changing landing or captures', () => {
  const mover = piece(3, 'R', 2, 6), target = piece(5, 'P', 2, 2, 'gote');
  const s = position([mover, piece(4, 'P', 2.4, 4), target]);
  assert.equal(validateMove(s, mover.id, target).ok, false);
  s.collisionMode = 'center';
  const result = movePiece(s, mover.id, target);
  assert.ok(result.ok);
  assert.equal(result.state.hands.sente.P, 1);
  assert.equal(result.state.collisionMode, 'center');
  assert.equal(pathClear(s, mover, { x: 2.4, y: 4 }), false);
});

test('diamond paths allow diagonal clearance while retaining circular landing and captures', () => {
  const mover = piece(3, 'B', 2, 6), blocker = piece(4, 'P', 4.36, 4.36);
  const s = position([mover, blocker, piece(5, 'P', 6, 2, 'gote')]);
  assert.equal(validateMove(s, mover.id, { x: 6, y: 2 }).ok, false);
  s.collisionMode = 'diamond';
  const capture = movePiece(s, mover.id, { x: 6, y: 2 });
  assert.ok(capture.ok);
  assert.equal(capture.state.hands.sente.P, 1);
  assert.equal(capture.state.collisionMode, 'diamond');
  blocker.x = 5.6; blocker.y = 1.6;
  assert.equal(pathClear(s, mover, { x: 6, y: 2 }, 5), false, 'landing still uses circular overlap');
  const rook = piece(3, 'R', 2, 6);
  assert.equal(pathClear(position([rook, piece(4, 'P', 2.4, 4)]), rook, { x: 2, y: 2 }), false);
  assert.equal(pathClear({ ...position([rook, piece(4, 'P', 2.4, 4)]), collisionMode: 'diamond' }, rook, { x: 2, y: 2 }), false);
  assert.equal(initialState('diamond').collisionMode, 'diamond');
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
  for (const [fromY, toY] of [[SIZE / 3 + .2, SIZE / 3 - .3], [SIZE / 3 - .1, SIZE / 3 + .4], [3, 2.6]]) {
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

test('dead drops and double-pawn drops are rejected', () => {
  const s = position([piece(3, 'P', 3, 5)]); s.hands.sente.P = 2; s.hands.sente.N = 1;
  assert.equal(validateDrop(s, 'P', { x: 3, y: RADIUS }).ok, false);
  assert.equal(validateDrop(s, 'N', { x: 3, y: 1 }).ok, false);
  assert.equal(validateDrop(s, 'P', { x: 3, y: 4 }).ok, false);
  assert.ok(validateDrop(s, 'P', { x: 3.31, y: 4 }).ok);
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

test('initial formation uses 1.2 spacing and keeps 40 symmetric pieces', () => {
  const s = initialState();
  const minDistance = Math.min(...s.pieces.flatMap(p => s.pieces.filter(q => q.id !== p.id).map(q => Math.hypot(p.x - q.x, p.y - q.y))));
  assert.ok(Math.abs(minDistance - 1.2) < 1e-7);
  const back = s.pieces.filter(p => p.side === 'sente' && Math.abs(p.y - (SIZE - .6)) < 1e-7).sort((a, b) => a.x - b.x);
  assert.equal(back.length, 9);
  assert.ok(Math.abs(back[0].x - .6) < 1e-7);
  assert.ok(Math.abs(back.at(-1).x - (SIZE - .6)) < 1e-7);
  for (let i = 1; i < back.length; i++) assert.ok(Math.abs(back[i].x - back[i - 1].x - 1.2) < 1e-7);
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
  for (const [side, x, y] of [['sente', SIZE / 2 + .12, 6.8], ['gote', SIZE / 2 - .12, 4], ['sente', SIZE / 2 + .21, 5.8], ['gote', SIZE / 2 - .21, 4.8]]) {
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
    assert.equal(validateMove(s, p.id, { x: 4.6, y: 4.5 }).ok, false);
    s.pieces[3].x = 3.7;
    assert.ok(validateMove(s, p.id, { x: 4.6, y: 4.5 }).ok);
    assert.equal(validateMove(s, p.id, { x: 4.2, y: 5 }).ok, false, 'landing overlap remains prohibited');
  }
  const b = piece(3, 'B', 2, 8);
  const s = position([b, piece(4, 'P', 3.7, 5.7)]);
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


test('all non-jumping pieces share full disk path and landing clearance', () => {
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
    const obstacle = piece(4, 'P', (p.x + to.x) / 2 - dy / distance * 0.65, (p.y + to.y) / 2 + dx / distance * 0.65, 'gote');
    const s = position([p, obstacle]);
    assert.ok(movementAllows(p, to), type);
    assert.ok(pathClear(s, p, to), `${type}: visible side passes`);
    obstacle.x = (p.x + to.x) / 2 - dy / distance * 0.4; obstacle.y = (p.y + to.y) / 2 + dx / distance * 0.4;
    assert.equal(pathClear(s, p, to), false, `${type}: overlapping swept disks blocked`);
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
  assert.equal(validateMove(corridor, 3, { x: 2, y: 2 }).ok, false);
  corridor.pieces[3].x = 2.65;
  assert.ok(validateMove(corridor, 3, { x: 2, y: 2 }).ok);
});


test('double-pawn rule uses the dropped center and the existing pawn radius for both sides', () => {
  for (const side of ['sente', 'gote']) {
    const s = position([piece(3, 'P', 4.5, 5, side)], side); s.hands[side].P = 2;
    const prepared = createDropValidator(s, 'P');
    for (const y of [0.8, 3, 7, SIZE - .8]) for (const dx of [-RADIUS, 0, RADIUS]) {
      const to = { x: 4.5 + dx, y };
      assert.equal(prepared(to).ok, false);
      assert.match(validateDrop(s, 'P', to).reason, /二歩/);
      assert.equal(dropPiece(s, 'P', to).ok, false);
    }
    for (const dx of [-RADIUS - .0001, RADIUS + .0001]) assert.ok(validateDrop(s, 'P', { x: 4.5 + dx, y: 7 }).ok);
  }
});
test('promoted pawns and enemies do not block pawn drops; other drops and normal pawn moves are unaffected', () => {
  const s = position([piece(3, 'P', 4.5, 5, 'sente', true), piece(4, 'P', 4.5, 3, 'gote')]);
  s.hands.sente.P = 1;
  assert.ok(validateDrop(s, 'P', { x: 4.5, y: 7 }).ok);
  s.pieces[2].promoted = false; s.hands.sente.G = 1;
  assert.ok(validateDrop(s, 'G', { x: 4.5, y: 7 }).ok);
  s.pieces.push(piece(5, 'P', 4.7, 7));
  assert.ok(validateMove(s, 5, { x: 4.7, y: 6.5 }).ok);
});
