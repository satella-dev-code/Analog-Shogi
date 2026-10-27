import { SIZE, RADIUS, TYPES, other, forward, movementAllows, validateMove, createDropValidator, movePiece, dropPiece, captureDestination, isInCheck } from './engine.js';
const VALUE = { K: 10000, R: 1000, B: 850, G: 550, S: 450, N: 300, L: 280, P: 100 };
const value = p => VALUE[p.type] + (p.promoted ? (['P','L','N','S'].includes(p.type) ? 300 : 180) : 0);

// Candidate search is approximate; every returned move is validated by the same
// continuous rules as human moves. A missed candidate never declares checkmate.
export function chooseCpuMove(state) {
  if (state.winner) return null;
  const side = state.turn, enemies = state.pieces.filter(p => p.side !== side), candidates = [];
  for (const piece of state.pieces) {
    if (piece.side !== side) continue;
    const points = [], seen = new Set();
    const add = to => {
      const key = `${to.x.toFixed(5)},${to.y.toFixed(5)}`;
      if (!seen.has(key)) { seen.add(key); points.push(to); }
    };
    for (const enemy of enemies) if (enemy.type !== 'K') {
      const to = captureDestination(state, piece, enemy, true); if (to) add(to);
    }
    // Relative samples include small moves for shielding and off-grid landings.
    for (const d of [.04, .2, .5, 1, 1.5, 2, 3, 4, 6, 9]) for (let a = 0; a < 16; a++) {
      const angle = a * Math.PI / 8; add({ x: piece.x + Math.cos(angle) * d, y: piece.y + Math.sin(angle) * d });
    }
    for (let y = RADIUS; y <= SIZE - RADIUS; y += .6) for (let x = RADIUS; x <= SIZE - RADIUS; x += .6) add({ x, y });
    for (const to of points) {
      if (!movementAllows(piece, to)) continue;
      const result = validateMove(state, piece.id, to); if (!result.ok) continue;
      const promote = result.canPromote || result.mustPromote;
      const advance = (to.y - piece.y) * forward(side);
      const center = 6 - Math.abs(to.x - 6);
      const repeat = state.lastMove?.to && Math.hypot(to.x - state.lastMove.to.x, to.y - state.lastMove.to.y) < .05;
      const score = (result.captured ? value(result.captured) * 12 : 0) + (promote ? 180 : 0)
        + advance * (piece.type === 'K' ? -3 : 12) + center * 3 - (repeat ? 20 : 0);
      candidates.push({ kind: 'move', id: piece.id, to, promote, score, moved: { ...piece, ...to, promoted: piece.promoted || promote }, captured: result.captured });
    }
  }
  for (const type of TYPES) if (state.hands[side][type] > 0) {
    const check = createDropValidator(state, type);
    for (let y = .6; y < SIZE - RADIUS; y += .8) for (let x = .6; x < SIZE - RADIUS; x += .8) {
      const to = { x, y }; if (!check(to).ok) continue;
      const score = 15 + (6 - Math.abs(x - 6)) * 3 + (side === 'sente' ? 12 - y : y) * 3;
      candidates.push({ kind: 'drop', type, to, score, moved: { id: state.nextId, type, side, ...to, promoted: false } });
    }
  }
  // Evaluate a small, diverse shortlist to keep the worker responsive on phones.
  candidates.sort((a, b) => b.score - a.score);
  const counts = new Map(), shortlist = [];
  for (const c of candidates) {
    const key = c.kind === 'drop' ? c.type : c.id, count = counts.get(key) || 0;
    if (count >= 6) continue;
    counts.set(key, count + 1); shortlist.push(c);
    if (shortlist.length >= 64) break;
  }
  for (const c of shortlist) {
    const placed = { ...state, pieces: [...state.pieces.filter(p => p.id !== c.moved.id && p.id !== c.captured?.id), c.moved] };
    const endangered = enemies.some(p => p.id !== c.captured?.id && captureDestination(placed, p, c.moved, true));
    if (endangered) c.score -= value(c.moved) * 13;
    if (isInCheck(placed, other(side))) c.score += 120;
    const target = enemies.filter(p => p.id !== c.captured?.id && p.type !== 'K' && captureDestination(placed, c.moved, p, true));
    if (target.length) c.score += Math.max(...target.map(value)) * .3;
  }
  shortlist.sort((a, b) => b.score - a.score);
  const best = shortlist[0];
  if (!best) return null;
  return best.kind === 'drop' ? { kind: 'drop', type: best.type, to: best.to } : { kind: 'move', id: best.id, to: best.to, promote: best.promote };
}
export function applyCpuMove(state, action) {
  if (!action || !['move', 'drop'].includes(action.kind) || !action.to) return { ok: false };
  return action.kind === 'drop' ? dropPiece(state, action.type, action.to) : movePiece(state, action.id, action.to, action.promote);
}
