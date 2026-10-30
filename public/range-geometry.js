import C from './vendor/clipper.js';
import { SIZE, RADIUS, PATH_CLEARANCE, collisionMode, pathClearance, MOVE_RANGE, BAND_HALF_WIDTH, bishopHalfWidth, PAWN_HALF_WIDTH, KNIGHT, SECTOR_HALF_ANGLE, forward, isJump, isInCheck } from './engine.js';

// World coordinates are kept to a millionth. Curves are flattened directly from
// their equations to a maximum sagitta of 0.001 world units (<0.1 SVG pixels).
export const GEOMETRY_SCALE = 1e6;
export const ARC_ERROR = 0.001;
const S = GEOMETRY_SCALE, far = SIZE * 2;
const integer = p => ({ X: Math.round(p.x * S), Y: Math.round(p.y * S) });
function polygon(points) {
  const path = points.map(integer);
  if (!C.Clipper.Orientation(path)) path.reverse();
  return path;
}
export function circlePath(x, y, radius) {
  const count = Math.max(16, Math.ceil(Math.PI / Math.acos(1 - ARC_ERROR / radius)));
  return polygon(Array.from({ length: count }, (_, i) => ({ x: x + Math.cos(i * 2 * Math.PI / count) * radius, y: y + Math.sin(i * 2 * Math.PI / count) * radius })));
}
const rectangle = (left, top, right, bottom) => polygon([{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]);
const centerBoard = [rectangle(RADIUS, RADIUS, SIZE - RADIUS, SIZE - RADIUS)];
const surfaceBoard = [rectangle(0, 0, SIZE, SIZE)];
function operate(subject, clip, type) {
  if (!subject.length) return type === C.ClipType.ctUnion ? clip : [];
  if (!clip.length && type !== C.ClipType.ctUnion) return type === C.ClipType.ctIntersection ? [] : subject;
  const engine = new C.Clipper(); engine.StrictlySimple = true;
  engine.AddPaths(subject, C.PolyType.ptSubject, true);
  if (clip.length) engine.AddPaths(clip, C.PolyType.ptClip, true);
  const result = [];
  engine.Execute(type, result, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return result;
}
export const unionPaths = paths => operate(paths, [], C.ClipType.ctUnion);
export const intersectPaths = (a, b) => operate(a, b, C.ClipType.ctIntersection);
export const subtractPaths = (a, b) => operate(a, b, C.ClipType.ctDifference);
export function offsetPaths(paths, radius) {
  if (!paths.length) return [];
  const offset = new C.ClipperOffset(2, ARC_ERROR * S), result = [];
  offset.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  offset.Execute(result, radius * S);
  return result;
}
export function containsPoint(paths, point) {
  const p = integer(point); let inside = false;
  for (const path of paths) {
    const hit = C.Clipper.PointInPolygon(p, path);
    if (hit === -1) return true;
    if (hit === 1) inside = !inside;
  }
  return inside;
}
export function pathsToSvg(paths, unit = 900 / SIZE) {
  const number = n => Number((n / S * unit).toFixed(4));
  return paths.map(path => path.length ? `M${path.map(p => `${number(p.X)} ${number(p.Y)}`).join('L')}Z` : '').join('');
}
export function bounds(paths) {
  if (!paths.length) return null;
  return C.Clipper.GetBounds(paths);
}
const touches = (a, b) => a && b && a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

const shapes = new WeakMap();
export function movementShape(piece, position = {}) {
  const width = piece.type === 'B' ? bishopHalfWidth(position) : BAND_HALF_WIDTH;
  const signature = `${width}:${piece.type}:${piece.x}:${piece.y}:${piece.side}:${piece.promoted}`;
  const cached = shapes.get(piece);
  if (cached?.signature === signature) return cached.paths;
  const type = piece.promoted && ['P', 'L', 'N', 'S'].includes(piece.type) ? 'G' : piece.type;
  const paths = [], direction = forward(piece.side);
  const disk = r => paths.push(circlePath(piece.x, piece.y, r));
  const band = angle => {
    const a = angle * Math.PI / 180;
    paths.push(polygon([[-width, -far], [width, -far], [width, far], [-width, far]].map(([x, y]) => ({ x: piece.x + x * Math.cos(a) - y * Math.sin(a), y: piece.y + x * Math.sin(a) + y * Math.cos(a) }))));
  };
  const sector = degrees => {
    const radius = MOVE_RANGE[type], sweep = 2 * SECTOR_HALF_ANGLE * Math.PI / 180;
    const steps = Math.ceil(sweep / (2 * Math.acos(1 - ARC_ERROR / radius)));
    paths.push(polygon([piece, ...Array.from({ length: steps + 1 }, (_, i) => {
      const a = (degrees - SECTOR_HALF_ANGLE) * Math.PI / 180 + sweep * i / steps;
      return { x: piece.x + Math.sin(a) * radius, y: piece.y + direction * Math.cos(a) * radius };
    })]));
  };
  switch (type) {
    case 'K': disk(MOVE_RANGE.K); break;
    case 'P': { const end = piece.y + direction * MOVE_RANGE.P; paths.push(rectangle(piece.x - PAWN_HALF_WIDTH, Math.min(piece.y, end), piece.x + PAWN_HALF_WIDTH, Math.max(piece.y, end))); break; }
    case 'L': { const end = piece.y + direction * far; paths.push(rectangle(piece.x - BAND_HALF_WIDTH, Math.min(piece.y, end), piece.x + BAND_HALF_WIDTH, Math.max(piece.y, end))); break; }
    case 'R': band(0); band(90); if (piece.promoted) disk(MOVE_RANGE.K); break;
    case 'B': band(-45); band(45); if (piece.promoted) disk(MOVE_RANGE.K); break;
    case 'G': [0, 45, -45, 90, -90, 180].forEach(sector); break;
    case 'S': [0, 45, -45, 135, -135].forEach(sector); break;
    case 'N': for (const sign of [-1, 1]) paths.push(circlePath(piece.x + sign * KNIGHT.lateral, piece.y + direction * KNIGHT.forward, KNIGHT.radius)); break;
  }
  const result = intersectPaths(unionPaths(paths), centerBoard);
  shapes.set(piece, { signature, paths: result });
  return result;
}
function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = sequence => {
    const result = [];
    for (const point of sequence) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    result.pop(); return result;
  };
  return [...half(sorted), ...half(sorted.slice().reverse())];
}
function obstacleMask(piece, obstacle, clearance, mode) {
  const paths = [circlePath(obstacle.x, obstacle.y, 2 * RADIUS)];
  const dx = obstacle.x - piece.x, dy = obstacle.y - piece.y, distance = Math.hypot(dx, dy);
  if (!isJump(piece) && mode === 'diamond') {
    const vertices = [[PATH_CLEARANCE, 0], [0, PATH_CLEARANCE], [-PATH_CLEARANCE, 0], [0, -PATH_CLEARANCE]]
      .map(([x, y]) => ({ x: obstacle.x + x, y: obstacle.y + y }));
    const projected = vertices.map(v => {
      const dx = v.x - piece.x, dy = v.y - piece.y, length = Math.hypot(dx, dy);
      return length > 1e-9 ? { x: v.x + dx / length * far, y: v.y + dy / length * far } : v;
    });
    paths.push(polygon(convexHull([...vertices, ...projected])));
  } else if (!isJump(piece) && distance >= clearance - 1e-7) {
    const angle = Math.atan2(dy, dx), spread = Math.asin(Math.min(1, clearance / distance)), tangent = Math.sqrt(Math.max(0, distance * distance - clearance * clearance));
    const point = (a, length) => ({ x: piece.x + Math.cos(a) * length, y: piece.y + Math.sin(a) * length });
    paths.push(polygon([point(angle - spread, tangent), point(angle - spread, far), point(angle + spread, far), point(angle + spread, tangent)]));
  }
  return unionPaths(paths);
}

// Each branch fixes which (if any) enemy is removed. Its path is ignored only
// for that capture; every other piece remains a landing/path obstacle.
export function movementBranches(position, piece, captures = true) {
  const shape = movementShape(piece, position), obstacles = position.pieces.filter(p => p.id !== piece.id);
  if (!shape.length) return [];
  const masks = obstacles.map(p => { const paths = obstacleMask(piece, p, pathClearance(position, piece), collisionMode(position)); return { id: p.id, paths, bounds: bounds(paths) }; });
  const clipped = (area, excluded) => {
    const box = bounds(area);
    if (!box) return [];
    const masksHere = masks.filter(mask => mask.id !== excluded && touches(box, mask.bounds)).flatMap(mask => mask.paths);
    return subtractPaths(area, unionPaths(masksHere));
  };
  const branches = [{ target: null, paths: clipped(shape, null) }];
  if (captures) for (const enemy of obstacles) {
    if (enemy.side === piece.side || enemy.type === 'K') continue;
    const area = intersectPaths(shape, [circlePath(enemy.x, enemy.y, 2 * RADIUS)]);
    if (!area.length) continue;
    const paths = clipped(area, enemy.id);
    if (paths.length) branches.push({ target: enemy, paths });
  }
  return branches;
}
export function geometricMoves(position, piece) {
  return unionPaths(movementBranches(position, piece).flatMap(branch => branch.paths));
}

// Attacks on a king use no other captures. With the king removed from the fixed
// board, a king center is attacked iff it lies within 2R of an attack endpoint.
const attackCache = new Map();
function attackedArea(pieces, defendingSide, collisionMode) {
  const key = collisionMode + ':' + defendingSide + ':' + pieces.map(p => `${p.id},${p.type},${p.side},${p.x},${p.y},${p.promoted}`).join(';');
  if (attackCache.has(key)) return attackCache.get(key);
  const paths = [];
  for (const attacker of pieces) if (attacker.side !== defendingSide) {
    const moves = movementBranches({ pieces, collisionMode }, attacker, false)[0]?.paths || [];
    paths.push(...offsetPaths(moves, 2 * RADIUS));
  }
  const result = unionPaths(paths);
  attackCache.set(key, result);
  if (attackCache.size > 32) attackCache.delete(attackCache.keys().next().value);
  return result;
}
export function kingMoves(position, king) {
  if (position.winner) return [];
  const safe = [];
  for (const branch of movementBranches(position, king)) {
    if (!branch.paths.length) continue;
    const fixed = position.pieces.filter(p => p.id !== king.id && p.id !== branch.target?.id);
    safe.push(...subtractPaths(branch.paths, attackedArea(fixed, king.side, position.collisionMode)));
  }
  return unionPaths(safe);
}
// Most branches are already legal: adding the mover to a board with a safe
// king cannot expose that king. Only pins/check evasions need a safety mask.
// Those exceptional regions use a conservative 0.04-unit display mesh; actual
// placement always goes through the engine's continuous validation.
export function legalMovementBranches(position, piece) {
  if (position.winner) return [];
  if (!position.pieces.some(p => p.type === 'K' && p.side === piece.side)) return movementBranches(position, piece);
  if (piece.type === 'K') return [{ target: null, paths: kingMoves(position, piece) }];
  return movementBranches(position, piece).map(branch => {
    const fixed = position.pieces.filter(p => p.id !== piece.id && p.id !== branch.target?.id);
    if (!branch.paths.length || !isInCheck({ collisionMode: position.collisionMode, pieces: fixed }, piece.side)) return branch;
    const box = bounds(branch.paths), step = .04, safe = [];
    const left = Math.max(RADIUS, Math.floor(box.left / S / step) * step);
    const top = Math.max(RADIUS, Math.floor(box.top / S / step) * step);
    const right = Math.min(SIZE - RADIUS, box.right / S), bottom = Math.min(SIZE - RADIUS, box.bottom / S);
    const clear = (x, y) => !isInCheck({ collisionMode: position.collisionMode, pieces: [...fixed, { ...piece, x, y }] }, piece.side);
    for (let y = top; y < bottom; y += step) {
      let start = null;
      const endY = Math.min(y + step, bottom);
      for (let x = left; x < right; x += step) {
        const endX = Math.min(x + step, right), cx = (x + endX) / 2, cy = (y + endY) / 2;
        const usable = containsPoint(branch.paths, { x: cx, y: cy }) && clear(cx, cy)
          && clear(x, y) && clear(endX, y) && clear(x, endY) && clear(endX, endY);
        if (usable && start == null) start = x;
        if (start != null && (!usable || endX >= right - 1e-9)) {
          safe.push(rectangle(start, y, usable ? endX : x, endY)); start = null;
        }
      }
    }
    return { ...branch, paths: intersectPaths(branch.paths, unionPaths(safe)) };
  });
}
export function legalMoves(position, piece) {
  return unionPaths(legalMovementBranches(position, piece).flatMap(branch => branch.paths));
}
export function footprint(position, piece) {
  const centers = piece.type === 'K' ? kingMoves(position, piece) : geometricMoves(position, piece);
  return intersectPaths(offsetPaths(centers, RADIUS), surfaceBoard);
}
