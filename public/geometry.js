// Witnesses for cells in an arrangement of lines and circles inside a disk.
// This checks narrow capture slivers without a fixed board grid.
const TAU = Math.PI * 2;
export function* diskWitnesses(center, radius, input) {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const inside = p => distance(p, center) <= radius + 1e-8;
  const curves = [{ kind: 'circle', ...center, r: radius }, ...input].filter(c => c.kind === 'line'
    ? Math.abs(c.a * center.x + c.b * center.y - c.c) <= radius + 1e-8
    : Math.abs(distance(c, center) - c.r) <= radius + 1e-8);
  const cuts = curves.map(() => []);
  const parameter = (c, p) => c.kind === 'circle' ? ((Math.atan2(p.y - c.y, p.x - c.x) + TAU) % TAU) : -c.b * p.x + c.a * p.y;
  yield center;
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
    let a = curves[i], b = curves[j], points = [];
    if (a.kind === 'line' && b.kind === 'line') {
      const det = a.a * b.b - b.a * a.b;
      if (Math.abs(det) > 1e-10) points.push({ x: (a.c * b.b - b.c * a.b) / det, y: (a.a * b.c - b.a * a.c) / det });
    } else if (a.kind === 'circle' && b.kind === 'circle') {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 1e-10 && d <= a.r + b.r + 1e-9 && d >= Math.abs(a.r - b.r) - 1e-9) {
        const t = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, a.r * a.r - t * t));
        for (const sign of [-1, 1]) points.push({ x: a.x + t * dx / d - sign * h * dy / d, y: a.y + t * dy / d + sign * h * dx / d });
      }
    } else {
      if (a.kind === 'line') [a, b] = [b, a];
      const offset = b.a * a.x + b.b * a.y - b.c;
      if (Math.abs(offset) <= a.r + 1e-9) {
        const h = Math.sqrt(Math.max(0, a.r * a.r - offset * offset));
        for (const sign of [-1, 1]) points.push({ x: a.x - b.a * offset - sign * b.b * h, y: a.y - b.b * offset + sign * b.a * h });
      }
    }
    for (const p of points.filter(inside)) {
      cuts[i].push(parameter(curves[i], p)); cuts[j].push(parameter(curves[j], p));
      yield p;
    }
  }
  for (let i = 0; i < curves.length; i++) {
    const c = curves[i], values = [...new Set(cuts[i].map(v => Math.round(v * 1e10) / 1e10))].sort((a, b) => a - b);
    if (c.kind === 'circle') {
      if (!values.length) values.push(0);
      values.push(values[0] + TAU);
    }
    for (let j = 0; j < values.length - 1; j++) {
      const t = (values[j] + values[j + 1]) / 2;
      const normal = c.kind === 'circle' ? { x: Math.cos(t), y: Math.sin(t) } : { x: c.a, y: c.b };
      const p = c.kind === 'circle' ? { x: c.x + normal.x * c.r, y: c.y + normal.y * c.r } : { x: c.a * c.c - c.b * t, y: c.b * c.c + c.a * t };
      if (!inside(p)) continue;
      yield p;
      let step = 0.01;
      for (let k = 0; k < curves.length; k++) {
        if (k === i) continue;
        const q = curves[k];
        const gap = q.kind === 'circle' ? Math.abs(distance(q, p) - q.r) : Math.abs(q.a * p.x + q.b * p.y - q.c);
        if (gap > 1e-9) step = Math.min(step, gap / 4);
      }
      for (const sign of [-1, 1]) {
        const sample = { x: p.x + sign * step * normal.x, y: p.y + sign * step * normal.y };
        if (inside(sample)) yield sample;
      }
    }
  }
}
