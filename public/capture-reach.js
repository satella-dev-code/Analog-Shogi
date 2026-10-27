import { footprint } from './range-geometry.js';

// Direct rounded offset of the original, clipped movement geometry.
// This is the moving piece's own footprint, not enemy center positions.
export function captureReach(position, piece) {
  return { paths: footprint(position, piece) };
}
