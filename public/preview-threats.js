import { captureDestination, isInCheck } from './engine.js';

// Only inspect the held piece and its targets, rather than all pairs on the board.
export function previewThreats(position, piece, visibility = { own: true, opponent: true }) {
  let endangered = !!visibility.own && piece.type === 'K' && isInCheck(position, piece.side);
  const targets = new Set();
  for (const enemy of position.pieces) {
    if (enemy.side === piece.side) continue;
    if (visibility.own && !endangered && piece.type !== 'K') {
      endangered = !!captureDestination(position, enemy, piece, true);
    }
    if (visibility.opponent && captureDestination(position, piece, enemy, true)) targets.add(enemy.id);
  }
  return { endangered, targets };
}
