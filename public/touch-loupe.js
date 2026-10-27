// Keep the zoom window inside the visible board and away from the finger.
export function loupeGeometry(rect, viewport, finger, center, previous = null) {
  const gap = 10;
  const left = Math.max(gap, rect.left + gap), right = Math.min(viewport.width - gap, rect.right - gap);
  const top = Math.max(gap, rect.top + gap), bottom = Math.min(viewport.height - gap, rect.bottom - gap);
  const size = Math.min(132, right - left, bottom - top);
  if (size < 80 || rect.width <= 0) return null;
  const corners = [[left, top], [right - size, top], [left, bottom - size], [right - size, bottom - size]];
  const distance = ([x, y]) => Math.hypot(Math.max(x - finger.x, 0, finger.x - x - size), Math.max(y - finger.y, 0, finger.y - y - size));
  let corner = corners.reduce((best, p, i) => distance(p) > distance(corners[best]) ? i : best, 0);
  // Retain a safe corner to avoid jumping as the finger crosses the center.
  if (previous != null && corners[previous] && distance(corners[previous]) > 45) corner = previous;
  if (distance(corners[corner]) < 30) return null;
  const span = size * 900 / rect.width / 2.4;
  return { left: corners[corner][0], top: corners[corner][1], size, corner,
    viewBox: [center.x - span / 2, center.y - span / 2, span, span], center, span };
}
