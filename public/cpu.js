import { SIZE, RADIUS, TYPES, other, forward, movementAllows, validateMove, createDropValidator, movePiece, dropPiece, captureDestination, isInCheck } from './engine.js';
const VALUE = { K: 10000, R: 1000, B: 850, G: 550, S: 450, N: 300, L: 280, P: 100 };
const value = p => VALUE[p.type] + (p.promoted ? (['P','L','N','S'].includes(p.type) ? 300 : 180) : 0);

// Candidate search is approximate; every returned move is validated by the same
// continuous rules as human moves. A missed candidate never declares checkmate.
export function chooseCpuMove(state, random = Math.random) {
  if (state.winner) return null;
  const side = state.turn, enemies = state.pieces.filter(p => p.side !== side), candidates = [];
  const enemyKing = enemies.find(p => p.type === 'K');
  const kingDistance = p => enemyKing ? Math.hypot(p.x - enemyKing.x, p.y - enemyKing.y) : 0;
  const edgePenalty = p => Math.max(0, 1.5 - Math.min(p.x, p.y, SIZE - p.x, SIZE - p.y)) * 50;
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
      if (!movementAllows(piece, to, state)) continue;
      const result = validateMove(state, piece.id, to); if (!result.ok) continue;
      const promote = result.canPromote || result.mustPromote;
      const advance = (to.y - piece.y) * forward(side);
      const center = 6 - Math.abs(to.x - 6);
      const repeat = state.lastMove?.to && Math.hypot(to.x - state.lastMove.to.x, to.y - state.lastMove.to.y) < .05;
      const score = (result.captured ? value(result.captured) * 12 : 0) + (promote ? 180 : 0)
        + Math.max(-2, Math.min(2, advance)) * (piece.type === 'K' ? -3 : 4) + center * 3
        + (piece.type === 'K' ? 0 : (kingDistance(piece) - kingDistance(to)) * 38 - edgePenalty(to)) - (repeat ? 20 : 0);
      candidates.push({ kind: 'move', id: piece.id, to, promote, score, moved: { ...piece, ...to, promoted: piece.promoted || promote }, captured: result.captured });
    }
  }
  for (const type of TYPES) if (state.hands[side][type] > 0) {
    const check = createDropValidator(state, type);
    for (let y = .6; y < SIZE - RADIUS; y += .8) for (let x = .6; x < SIZE - RADIUS; x += .8) {
      const to = { x, y }; if (!check(to).ok) continue;
      const score = 15 + (6 - Math.abs(x - 6)) * 3 + (SIZE - kingDistance(to)) * 20 - edgePenalty(to);
      candidates.push({ kind: 'drop', type, to, score, moved: { id: state.nextId, type, side, ...to, promoted: false } });
    }
  }
  // Evaluate a small, diverse shortlist to keep the worker responsive on phones.
  // Vary which nearly tied positions reach the shortlist, without changing
  // their tactical score. Injecting the RNG keeps regression tests repeatable.
  for (const c of candidates) c.priority = c.score + (random() - .5) * 12;
  candidates.sort((a, b) => b.priority - a.priority);
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
    if (isInCheck(placed, other(side))) c.score += 500;
    const target = enemies.filter(p => p.id !== c.captured?.id && p.type !== 'K' && captureDestination(placed, c.moved, p, true));
    if (target.length) c.score += Math.max(...target.map(value)) * .3;
  }
  shortlist.sort((a, b) => b.score - a.score);
  if (!shortlist.length) return null;
  // Look one reply ahead for the strongest immediate capture, including attacks
  // on pieces other than the one just moved. Limit the search for phone speed.
  const finalists = shortlist.slice(0, 10);
  for (const c of finalists) {
    const placed = { ...state, pieces: [...state.pieces.filter(p => p.id !== c.moved.id && p.id !== c.captured?.id), c.moved] };
    const defenders = placed.pieces.filter(p => p.side === side && p.type !== 'K').sort((a, b) => value(b) - value(a));
    let loss = 0, threatenedId = null;
    for (const target of defenders) {
      if (placed.pieces.some(attacker => attacker.side !== side && captureDestination(placed, attacker, target, true))) {
        loss = value(target); threatenedId = target.id;
        break;
      }
    }
    // The moved piece's danger was already scored in the first pass.
    if (loss && threatenedId !== c.moved.id) c.score -= loss * 10;
  }
  finalists.sort((a, b) => b.score - a.score);
  // Sample only near the best evaluated move. A 40-point window is far below
  // the 1,200-point reward for a pawn capture; large tactical losses stay out.
  const bestScore = finalists[0].score;
  const pool = finalists.filter(c => c.score >= bestScore - 40);
  const weights = pool.map(c => Math.exp((c.score - bestScore) / 12));
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  let best = pool.at(-1);
  for (let i = 0; i < pool.length; i++) {
    draw -= weights[i];
    if (draw < 0) { best = pool[i]; break; }
  }
  return best.kind === 'drop' ? { kind: 'drop', type: best.type, to: best.to } : { kind: 'move', id: best.id, to: best.to, promote: best.promote };
}
export function applyCpuMove(state, action) {
  if (!action || !['move', 'drop'].includes(action.kind) || !action.to) return { ok: false };
  return action.kind === 'drop' ? dropPiece(state, action.type, action.to) : movePiece(state, action.id, action.to, action.promote);
}
