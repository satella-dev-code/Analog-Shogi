import { kingMoves } from './range-geometry.js';

// Continuous vector region: each possible capture gets its own resulting board.
export function legalKingRange(position, king) {
  return { paths: kingMoves(position, king) };
}
