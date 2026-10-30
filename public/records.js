import { SIZE, RADIUS, TYPES, other, collisionMode } from './engine.js';

export const RECORD_FORMAT = 'analog-shogi-record';
export const MAX_RECORD_BYTES = 5 * 1024 * 1024;
const SIDES = ['sente', 'gote'], MAX_STEPS = 10000;
const integer = (value, min = 0, max = 1e9) => Number.isSafeInteger(value) && value >= min && value <= max;
const fail = () => { throw new Error('棋譜ファイルの形式が正しくありません。'); };
function point(value) {
  // Read-only replays also accept coordinates from the original 12-unit board.
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)
    || value.x < RADIUS - 1e-7 || value.x > 12 - RADIUS + 1e-7
    || value.y < RADIUS - 1e-7 || value.y > 12 - RADIUS + 1e-7) fail();
  return { x: value.x, y: value.y };
}
function cleanPiece(value) {
  if (!value || !integer(value.id, 1) || !SIDES.includes(value.side) || ![...TYPES, 'K'].includes(value.type)
    || typeof value.promoted !== 'boolean' || (value.type === 'K' && value.promoted)) fail();
  return { id: value.id, type: value.type, side: value.side, ...point(value), promoted: value.promoted };
}
function metadata(value) {
  if (!value || !SIDES.includes(value.turn) || !integer(value.moveNumber, 1, 1e6) || !integer(value.nextId, 1)
    || (value.winner != null && !SIDES.includes(value.winner))) fail();
  const hands = {};
  for (const side of SIDES) {
    if (!value.hands?.[side]) fail();
    hands[side] = {};
    for (const type of TYPES) {
      const count = value.hands[side][type] ?? 0;
      if (!integer(count, 0, 38)) fail();
      if (count) hands[side][type] = count;
    }
  }
  let lastMove = null;
  if (value.lastMove) {
    if (!SIDES.includes(value.lastMove.side)) fail();
    lastMove = { from: value.lastMove.from == null ? null : point(value.lastMove.from), to: point(value.lastMove.to), side: value.lastMove.side };
  }
  return { collisionMode: collisionMode(value), turn: value.turn, moveNumber: value.moveNumber, nextId: value.nextId, winner: value.winner ?? null, hands, lastMove };
}
export function recordPosition(value) {
  if (!Array.isArray(value?.pieces) || value.pieces.length < 2 || value.pieces.length > 40) fail();
  const pieces = value.pieces.map(cleanPiece).sort((a, b) => a.id - b.id), meta = metadata(value);
  if (new Set(pieces.map(p => p.id)).size !== pieces.length || pieces.at(-1).id >= meta.nextId) fail();
  if (!SIDES.every(side => pieces.filter(p => p.type === 'K' && p.side === side).length === 1)) fail();
  const handCount = SIDES.flatMap(side => Object.values(meta.hands[side])).reduce((a, b) => a + b, 0);
  if (pieces.length + handCount > 40) fail();
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    if (Math.hypot(pieces[i].x - pieces[j].x, pieces[i].y - pieces[j].y) < 2 * RADIUS - 1e-6) fail();
  }
  return { pieces, ...meta };
}
export const samePosition = (a, b) => JSON.stringify(recordPosition(a)) === JSON.stringify(recordPosition(b));
const samePiece = (a, b) => a && b && a.id === b.id && a.type === b.type && a.side === b.side && a.x === b.x && a.y === b.y && a.promoted === b.promoted;
export function createRecord(state) {
  return { format: RECORD_FORMAT, version: 1, rules: `continuous-${SIZE}-radius0.3`, initial: recordPosition(state), steps: [] };
}
export function appendRecord(record, before, after) {
  const start = recordPosition(before), end = recordPosition(after);
  const previous = new Map(start.pieces.map(p => [p.id, p])), current = new Set(end.pieces.map(p => p.id));
  const changed = end.pieces.filter(p => !samePiece(previous.get(p.id), p));
  const removed = start.pieces.filter(p => !current.has(p.id)).map(p => p.id);
  const kind = !start.winner && end.winner ? 'resign' : end.lastMove?.from == null ? 'drop' : 'move';
  const label = { kind, number: start.moveNumber, side: start.turn, text: kind === 'resign' ? '投了' : after.log.at(-1)?.text || '' };
  return { ...record, steps: [...record.steps, { label, changed, removed, ...metadata(end) }] };
}
export function recordFromHistory(history, state) {
  const sequence = [...history, state];
  let record = createRecord(sequence[0]);
  for (let i = 1; i < sequence.length; i++) record = appendRecord(record, sequence[i - 1], sequence[i]);
  return record;
}

// Files contain board patches, not executable instructions. Replay is read-only;
// historical snapshots are not reinterpreted under a later version of the rules.
export function readRecord(input) {
  if (!input || input.format !== RECORD_FORMAT || input.version !== 1 || !Array.isArray(input.steps) || input.steps.length > MAX_STEPS) fail();
  const initial = recordPosition(input.initial), frames = [{ ...initial, log: [] }], steps = [];
  for (const raw of input.steps) {
    if (!raw || !Array.isArray(raw.changed) || raw.changed.length > 1 || !Array.isArray(raw.removed) || raw.removed.length > 1) fail();
    const previous = frames.at(-1), label = raw.label;
    if (!label || !['move', 'drop', 'resign'].includes(label.kind) || label.side !== previous.turn
      || label.number !== previous.moveNumber || typeof label.text !== 'string' || label.text.length > 240 || previous.winner) fail();
    const changed = raw.changed.map(cleanPiece), removed = [...raw.removed];
    if (removed.some(id => !integer(id, 1) || !previous.pieces.some(p => p.id === id && p.type !== 'K' && p.side !== previous.turn))) fail();
    const ids = new Set(changed.map(p => p.id));
    if (removed.some(id => ids.has(id))) fail();
    if (changed.some(p => p.side !== previous.turn)) fail();
    const frame = recordPosition({ ...metadata(raw), pieces: [...previous.pieces.filter(p => !removed.includes(p.id) && !ids.has(p.id)), ...changed] });
    if (label.kind === 'resign') {
      if (changed.length || removed.length || frame.turn !== previous.turn || frame.moveNumber !== previous.moveNumber
        || frame.winner !== other(previous.turn) || frame.nextId !== previous.nextId || JSON.stringify(frame.hands) !== JSON.stringify(previous.hands)) fail();
    } else {
      if (changed.length !== 1 || frame.turn !== other(previous.turn) || frame.moveNumber !== previous.moveNumber + 1 || frame.winner) fail();
      const existing = previous.pieces.find(p => p.id === changed[0].id);
      if (label.kind === 'move' && (!existing || existing.type !== changed[0].type || (existing.promoted && !changed[0].promoted) || frame.nextId !== previous.nextId)) fail();
      if (label.kind === 'drop' && (existing || removed.length || changed[0].id !== previous.nextId || changed[0].promoted || frame.nextId !== previous.nextId + 1)) fail();
    }
    steps.push({ label: { kind: label.kind, number: label.number, side: label.side, text: label.text }, changed, removed, ...metadata(frame) });
    frames.push({ ...frame, log: [] });
  }
  return { record: { format: RECORD_FORMAT, version: 1, rules: typeof input.rules === 'string' ? input.rules.slice(0, 80) : '', initial, steps }, frames };
}
export function decodeRecord(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_RECORD_BYTES) throw new Error('棋譜ファイルが大きすぎます。');
  let data;
  try { data = JSON.parse(text); } catch { fail(); }
  return readRecord(data);
}
