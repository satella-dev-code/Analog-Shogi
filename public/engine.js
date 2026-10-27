import { diskWitnesses } from './geometry.js';
// All coordinates are continuous. y grows downwards; sente moves towards y = 0.
export const SIZE = 12;
export const RADIUS = 0.35;
export const EPS = 1e-7;
export const MOVE_RANGE = Object.freeze({ K: 2, P: 2, G: 2, S: 2.2 });
export const BAND_HALF_WIDTH = 0.6;
export const PAWN_HALF_WIDTH = 0.6;
export const KNIGHT = Object.freeze({ lateral: 1.6, forward: 3.2, radius: 0.95 });
export const SECTOR_HALF_ANGLE = 22.5;
export const TYPES = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
export const NAMES = { K: '王', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };
export const PROMOTED = { R: '龍', B: '馬', S: '全', N: '圭', L: '杏', P: 'と' };
export const other = side => side === 'sente' ? 'gote' : 'sente';
export const sideName = side => side === 'sente' ? '先手' : '後手';
export const forward = side => side === 'sente' ? -1 : 1;
export const label = piece => piece.promoted ? PROMOTED[piece.type] : NAMES[piece.type];
export const clone = value => structuredClone(value);

export function initialState() {
  const pieces = [];
  let id = 0;
  const pitch = SIZE / 9;
  const coordinate = n => n * pitch;
  for (const side of ['gote', 'sente']) {
    const back = coordinate(side === 'sente' ? 8.5 : 0.5);
    ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'].forEach((type, x) => pieces.push({ id: ++id, type, side, x: coordinate(x + 0.5), y: back, promoted: false }));
    pieces.push({ id: ++id, type: 'R', side, x: coordinate(side === 'sente' ? 7.5 : 1.5), y: coordinate(side === 'sente' ? 7.5 : 1.5), promoted: false });
    pieces.push({ id: ++id, type: 'B', side, x: coordinate(side === 'sente' ? 1.5 : 7.5), y: coordinate(side === 'sente' ? 7.5 : 1.5), promoted: false });
    for (let file = 0; file < 9; file++) pieces.push({ id: ++id, type: 'P', side, x: coordinate(file + 0.5), y: coordinate(side === 'sente' ? 6.5 : 2.5), promoted: false });
  }
  return { pieces, hands: { sente: {}, gote: {} }, turn: 'sente', moveNumber: 1, nextId: id + 1, lastMove: null, winner: null, log: [] };
}

export function inBoard(p) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= RADIUS - EPS && p.x <= SIZE - RADIUS + EPS && p.y >= RADIUS - EPS && p.y <= SIZE - RADIUS + EPS;
}

export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function inSectors(dx, fy, directions) {
  const angle = Math.atan2(dx, fy) * 180 / Math.PI;
  return directions.some(deg => Math.abs(((angle - deg + 540) % 360) - 180) <= SECTOR_HALF_ANGLE + EPS);
}

export function movementAllows(piece, to) {
  const dx = to.x - piece.x, dy = to.y - piece.y, fy = dy * forward(piece.side);
  const distance = Math.hypot(dx, dy);
  if (distance <= EPS) return false;
  const near = distance <= MOVE_RANGE.K + EPS;
  // Bands have a constant perpendicular half-width, including diagonal bands.
  const diagonal = Math.abs(Math.abs(dx) - Math.abs(dy)) / Math.SQRT2 <= BAND_HALF_WIDTH + EPS;
  const orthogonal = Math.min(Math.abs(dx), Math.abs(dy)) <= BAND_HALF_WIDTH + EPS;
  const gold = distance <= MOVE_RANGE.G + EPS && inSectors(dx, fy, [0, 45, -45, 90, -90, 180]);
  if (piece.promoted && ['P', 'L', 'N', 'S'].includes(piece.type)) return gold;
  switch (piece.type) {
    case 'K': return near;
    case 'P': return fy > EPS && fy <= MOVE_RANGE.P + EPS && Math.abs(dx) <= PAWN_HALF_WIDTH + EPS;
    case 'L': return Math.abs(dx) <= BAND_HALF_WIDTH + EPS && fy > EPS;
    case 'N': return Math.min(Math.hypot(dx - KNIGHT.lateral, fy - KNIGHT.forward), Math.hypot(dx + KNIGHT.lateral, fy - KNIGHT.forward)) <= KNIGHT.radius + EPS;
    case 'S': return distance <= MOVE_RANGE.S + EPS && inSectors(dx, fy, [0, 45, -45, 135, -135]);
    case 'G': return gold;
    case 'B': return diagonal || (piece.promoted && near);
    case 'R': return orthogonal || (piece.promoted && near);
    default: return false;
  }
}

export function isJump(piece) { return piece.type === 'N' && !piece.promoted; }

export function pathClear(state, piece, to, captureId = null) {
  return state.pieces.every(obstacle => {
    if (obstacle.id === piece.id || obstacle.id === captureId) return true;
    // All non-jumping pieces use center-line clearance; landings use both radii.
    if (Math.hypot(obstacle.x - to.x, obstacle.y - to.y) < 2 * RADIUS - EPS) return false;
    if (isJump(piece)) return true;
    return pointSegmentDistance(obstacle, piece, to) >= RADIUS - EPS;
  });
}

export function isInCheck(state, side) {
  const king = state.pieces.find(p => p.side === side && p.type === 'K');
  if (!king) return true;
  return state.pieces.some(p => p.side !== side && captureDestination(state, p, king));
}

export function overlappingPieces(state, piece, to) {
  return state.pieces.filter(p => p.id !== piece.id && Math.hypot(p.x - to.x, p.y - to.y) < 2 * RADIUS - EPS);
}

function captureReachable(piece, target) {
  const dx = target.x - piece.x, dy = target.y - piece.y, fy = dy * forward(piece.side), margin = 2 * RADIUS;
  const type = piece.promoted && ['P', 'L', 'N', 'S'].includes(piece.type) ? 'G' : piece.type;
  if (MOVE_RANGE[type]) return Math.hypot(dx, dy) <= (type === 'P' ? Math.hypot(MOVE_RANGE.P, PAWN_HALF_WIDTH) : MOVE_RANGE[type]) + margin;
  if (type === 'N') return Math.min(Math.hypot(dx - KNIGHT.lateral, fy - KNIGHT.forward), Math.hypot(dx + KNIGHT.lateral, fy - KNIGHT.forward)) <= KNIGHT.radius + margin;
  if (piece.promoted && Math.hypot(dx, dy) <= MOVE_RANGE.K + margin) return true;
  if (type === 'R') return Math.min(Math.abs(dx), Math.abs(dy)) <= BAND_HALF_WIDTH + margin;
  if (type === 'B') return Math.abs(Math.abs(dx) - Math.abs(dy)) / Math.SQRT2 <= BAND_HALF_WIDTH + margin;
  return Math.abs(dx) <= BAND_HALF_WIDTH + margin && fy + margin > 0;
}

function captureCurves(state, piece, target) {
  const curves = [];
  const circle = (x, y, r) => curves.push({ kind: 'circle', x, y, r });
  const line = (a, b, c) => { const length = Math.hypot(a, b); curves.push({ kind: 'line', a: a / length, b: b / length, c: c / length }); };
  const relativeLine = (a, b, offset = 0) => line(a, b, a * piece.x + b * piece.y + offset);
  [RADIUS, SIZE - RADIUS].forEach(n => { line(1, 0, n); line(0, 1, n); });
  const type = piece.promoted && ['P', 'L', 'N', 'S'].includes(piece.type) ? 'G' : piece.type;
  if (['K', 'G', 'S'].includes(type)) circle(piece.x, piece.y, MOVE_RANGE[type]);
  if (['G', 'S'].includes(type)) for (let deg = 22.5; deg < 180; deg += 45) relativeLine(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
  if (type === 'P' || type === 'L') {
    const width = type === 'P' ? PAWN_HALF_WIDTH : BAND_HALF_WIDTH;
    relativeLine(1, 0, width); relativeLine(1, 0, -width); relativeLine(0, 1);
    if (type === 'P') relativeLine(0, 1, forward(piece.side) * MOVE_RANGE.P);
  }
  if (type === 'N') for (const sign of [-1, 1]) circle(piece.x + sign * KNIGHT.lateral, piece.y + forward(piece.side) * KNIGHT.forward, KNIGHT.radius);
  if (type === 'R') for (const sign of [-1, 1]) { relativeLine(1, 0, sign * BAND_HALF_WIDTH); relativeLine(0, 1, sign * BAND_HALF_WIDTH); }
  if (type === 'B') for (const sign of [-1, 1]) { relativeLine(1, 1, sign * BAND_HALF_WIDTH * Math.SQRT2); relativeLine(1, -1, sign * BAND_HALF_WIDTH * Math.SQRT2); }
  if (piece.promoted && ['R', 'B'].includes(type)) circle(piece.x, piece.y, MOVE_RANGE.K);
  for (const obstacle of state.pieces) {
    if (obstacle.id === piece.id || obstacle.id === target.id) continue;
    circle(obstacle.x, obstacle.y, 2 * RADIUS - EPS);
    if (isJump(piece)) continue;
    const dx = obstacle.x - piece.x, dy = obstacle.y - piece.y, d = Math.hypot(dx, dy);
    if (d <= RADIUS) continue;
    const angle = Math.atan2(dy, dx), spread = Math.asin((RADIUS - EPS) / d);
    for (const sign of [-1, 1]) { const a = angle + sign * spread; relativeLine(-Math.sin(a), Math.cos(a)); }
  }
  return curves;
}

// Find a continuous destination overlapping exactly this enemy. Boundaries of
// movement, board edges, landing circles and obstacle shadows partition the disk.
export function captureDestination(state, piece, target, requireKingSafety = false) {
  if (piece.side === target.side || !captureReachable(piece, target)) return null;
  const valid = to => {
    if (!inBoard(to) || !movementAllows(piece, to)) return false;
    const overlaps = overlappingPieces(state, piece, to);
    if (overlaps.length !== 1 || overlaps[0].id !== target.id || !pathClear(state, piece, to, target.id)) return false;
    if (requireKingSafety && isInCheck(simulatePosition(state, piece, to, target, !hasFutureMove({ ...piece, ...to })), piece.side)) return false;
    return true;
  };
  const center = { x: target.x, y: target.y };
  if (valid(center)) return center;
  const curves = captureCurves(state, piece, target);
  const circle = (x, y, r) => curves.push({ kind: 'circle', x, y, r });
  const line = (a, b, c) => curves.push({ kind: 'line', a, b, c });
  if (requireKingSafety && piece.type !== 'K') {
    const king = state.pieces.find(p => p.side === piece.side && p.type === 'K');
    if (king) {
      // Removing the mover exposes attacks that its landing may still block.
      // Include boundaries of those blocking positions in the capture search.
      const exposed = { pieces: state.pieces.filter(p => p.id !== piece.id && p.id !== target.id) };
      for (const attacker of exposed.pieces) {
        if (attacker.side === piece.side) continue;
        const attack = captureDestination(exposed, attacker, king);
        if (!attack) continue;
        const kingDx = king.x - attacker.x, kingDy = king.y - attacker.y;
        const kingDistance = Math.hypot(kingDx, kingDy);
        const captureRadius = 2 * RADIUS - EPS;
        const endpoints = [attack];
        if (kingDistance > captureRadius) {
          const angle = Math.atan2(kingDy, kingDx), spread = Math.asin(captureRadius / kingDistance);
          const tangent = Math.sqrt(kingDistance * kingDistance - captureRadius * captureRadius);
          for (const sign of [-1, 1]) endpoints.push({ x: attacker.x + Math.cos(angle + sign * spread) * tangent, y: attacker.y + Math.sin(angle + sign * spread) * tangent });
        }
        // Range edges and fixed blockers can narrow the king's capture disk.
        // Find its angular extremes instead of assuming the center ray suffices.
        const candidates = function* () {
          yield* endpoints;
          yield* diskWitnesses(king, captureRadius, captureCurves(exposed, attacker, king));
        };
        let left, right, minAngle = Infinity, maxAngle = -Infinity;
        for (const point of candidates()) {
          if (!inBoard(point) || !movementAllows(attacker, point) || !pathClear(exposed, attacker, point, king.id)) continue;
          const dx = point.x - attacker.x, dy = point.y - attacker.y;
          const angle = Math.atan2(kingDx * dy - kingDy * dx, kingDx * dx + kingDy * dy);
          if (angle < minAngle) { minAngle = angle; left = point; }
          if (angle > maxAngle) { maxAngle = angle; right = point; }
        }
        for (const point of [attack, left, right].filter(Boolean)) {
          circle(point.x, point.y, captureRadius);
          if (isJump(attacker)) continue;
          const dx = point.x - attacker.x, dy = point.y - attacker.y, length = Math.hypot(dx, dy);
          if (length <= EPS) continue;
          const a = -dy / length, b = dx / length;
          for (const sign of [-1, 1]) line(a, b, a * attacker.x + b * attacker.y + sign * (RADIUS - EPS));
        }
        circle(attacker.x, attacker.y, RADIUS - EPS);
      }
    }
  }
  for (const to of diskWitnesses(center, 2 * RADIUS - EPS, curves)) if (valid(to)) return to;
  return null;
}

// Evaluate each side's next capture, regardless of whose turn is displayed.
export function threatenedPieceIds(state) {
  const threatened = new Set();
  if (state.winner) return threatened;
  for (const target of state.pieces) {
    if (target.type === 'K') {
      if (isInCheck(state, target.side)) threatened.add(target.id);
      continue;
    }
    if (state.pieces.some(attacker => attacker.side !== target.side
      && captureDestination(state, attacker, target, true))) threatened.add(target.id);
  }
  return threatened;
}

export function inPromotionZone(side, p) { return side === 'sente' ? p.y <= SIZE / 3 + EPS : p.y >= SIZE * 2 / 3 - EPS; }
export function canPromote(piece, to) {
  return !piece.promoted && !['K', 'G'].includes(piece.type) && (inPromotionZone(piece.side, piece) || inPromotionZone(piece.side, to));
}

export function hasFutureMove(piece) {
  if (piece.promoted || !['P', 'L', 'N'].includes(piece.type)) return true;
  if (piece.type !== 'N') return piece.side === 'sente' ? piece.y > RADIUS + EPS : piece.y < SIZE - RADIUS - EPS;
  return [-1, 1].some(sign => {
    const center = { x: piece.x + sign * KNIGHT.lateral, y: piece.y + forward(piece.side) * KNIGHT.forward };
    const closest = { x: Math.max(RADIUS, Math.min(SIZE - RADIUS, center.x)), y: Math.max(RADIUS, Math.min(SIZE - RADIUS, center.y)) };
    return Math.hypot(center.x - closest.x, center.y - closest.y) <= KNIGHT.radius + EPS;
  });
}

// Legality only needs piece locations; do not copy hands or the growing log.
function simulatePosition(state, piece, to, captured, promote) {
  return { pieces: state.pieces.filter(p => p.id !== captured?.id).map(p => p.id === piece.id
    ? { ...p, x: to.x, y: to.y, promoted: piece.promoted || promote } : p) };
}

function simulateMove(state, piece, to, captured, promote) {
  const next = clone(state);
  next.pieces = next.pieces.filter(p => p.id !== captured?.id);
  const moved = next.pieces.find(p => p.id === piece.id);
  Object.assign(moved, { x: to.x, y: to.y, promoted: piece.promoted || promote });
  if (captured && captured.type !== 'K') next.hands[piece.side][captured.type] = (next.hands[piece.side][captured.type] || 0) + 1;
  return next;
}

export function validateMove(state, id, to) {
  if (state.winner) return { ok: false, reason: '対局は終了しています。' };
  const piece = state.pieces.find(p => p.id === id);
  if (!piece || piece.side !== state.turn) return { ok: false, reason: '手番の駒を選んでください。' };
  if (!inBoard(to)) return { ok: false, reason: '駒全体が盤内に収まる位置を選んでください。' };
  if (!movementAllows(piece, to)) return { ok: false, reason: 'この駒の移動範囲の外です。' };
  const overlaps = overlappingPieces(state, piece, to);
  if (overlaps.some(p => p.side === piece.side)) return { ok: false, reason: '味方の駒と重なる位置には移動できません。' };
  if (overlaps.length > 1) return { ok: false, reason: '敵2枚に同時に重なる位置には移動できません。' };
  const captured = overlaps[0];
  if (captured?.type === 'K') return { ok: false, reason: '王は取らず、王手と投了で決着します。' };
  if (!pathClear(state, piece, to, captured?.id)) return { ok: false, reason: '移動経路がほかの駒に遮られています。' };
  const mustPromote = !hasFutureMove({ ...piece, ...to });
  const next = simulatePosition(state, piece, to, captured, mustPromote);
  if (isInCheck(next, piece.side)) return { ok: false, reason: '自分の王が王手になるため指せません。' };
  return { ok: true, captured, canPromote: canPromote(piece, to), mustPromote };
}

function finishTurn(next, move, text) {
  next.lastMove = move;
  next.log.push({ number: next.moveNumber, side: next.turn, text });
  next.turn = other(next.turn);
  next.moveNumber++;
  return next;
}

export function movePiece(state, id, to, promote = false) {
  const result = validateMove(state, id, to);
  if (!result.ok) return result;
  const piece = state.pieces.find(p => p.id === id);
  const doPromote = result.mustPromote || (promote && result.canPromote);
  const next = simulateMove(state, piece, to, result.captured, doPromote);
  finishTurn(next, { from: { x: piece.x, y: piece.y }, to, side: piece.side }, `${label(piece)} → (${to.x.toFixed(2)}, ${to.y.toFixed(2)})${result.captured ? ` ${label(result.captured)}取り` : ''}${doPromote ? ' 成' : ''}`);
  return { ok: true, state: next };
}

export function createDropValidator(state, type) {
  const king = state.pieces.find(p => p.side === state.turn && p.type === 'K');
  const checked = !king || isInCheck(state, state.turn);
  return to => {
  if (state.winner) return { ok: false, reason: '対局は終了しています。' };
  if (!TYPES.includes(type) || !(state.hands[state.turn][type] > 0)) return { ok: false, reason: '持ち駒を選んでください。' };
  if (!inBoard(to)) return { ok: false, reason: '駒全体が盤内に収まる位置を選んでください。' };
  if (state.pieces.some(p => Math.hypot(p.x - to.x, p.y - to.y) < 2 * RADIUS - EPS)) return { ok: false, reason: 'ほかの駒と重なる位置には打てません。' };
  const piece = { id: state.nextId, type, side: state.turn, ...to, promoted: false };
  if (!hasFutureMove(piece)) return { ok: false, reason: '次に動けなくなる位置には打てません。' };
  if (checked && isInCheck({ ...state, pieces: [...state.pieces, piece] }, state.turn)) return { ok: false, reason: '自分の王の王手を解消してください。' };
  return { ok: true };
  };
}

export function validateDrop(state, type, to) {
  return createDropValidator(state, type)(to);
}

export function dropPiece(state, type, to) {
  const result = validateDrop(state, type, to);
  if (!result.ok) return result;
  const next = clone(state);
  next.pieces.push({ id: next.nextId++, type, side: next.turn, ...to, promoted: false });
  next.hands[next.turn][type]--;
  finishTurn(next, { from: null, to, side: state.turn }, `${NAMES[type]}打 (${to.x.toFixed(2)}, ${to.y.toFixed(2)})`);
  return { ok: true, state: next };
}

