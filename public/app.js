import { createRenderCache, createFrameScheduler } from './render-cache.js';
import { t, sideName, pieceName, historyText, getLanguage, setLanguage, captureTranslations, applyLanguage } from './i18n.js';
import { SIZE, RADIUS, MOVE_RANGE, BAND_HALF_WIDTH, PAWN_HALF_WIDTH, KNIGHT, SECTOR_HALF_ANGLE, TYPES, NAMES, label, clone, initialState, other, forward, isJump, isInCheck, captureDestination, threatenedPieceIds, validateMove, movePiece, createDropValidator, validateDrop, dropPiece } from './engine.js';

const $ = id => document.getElementById(id);
const localized = (ja, en) => getLanguage() === 'en' ? en : ja;
const board = $('board');
const NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'ma-continuous-shogi-v2';
const UNIT = 900 / SIZE;
const PIECE_SCALE = UNIT / 100;
let state = initialState();
let history = [];
let selected = null;
let ghost = null;
let flipped = false;
let pointer = null;
let pending = null;
let confirmAction = null;
let saveAvailable = true;
const rangeVisibility = { own: false, opponent: false };
const threatVisibility = { own: true, opponent: true };
const cachedRender = createRenderCache();
let displayedAllRanges = null;
const cached = (key, compute) => cachedRender(state, flipped, key, compute);
const checked = side => cached(`check:${side}`, () => isInCheck(state, side));
const ghostFrames = createFrameScheduler(renderGhost, requestAnimationFrame, cancelAnimationFrame);


function validSaved(s) {
  return s && ['sente', 'gote'].includes(s.turn) && Array.isArray(s.pieces) && s.pieces.length <= 40
    && s.pieces.every(p => ['sente', 'gote'].includes(p.side) && [...TYPES, 'K'].includes(p.type) && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isInteger(p.id))
    && ['sente', 'gote'].every(side => s.pieces.filter(p => p.side === side && p.type === 'K').length === 1 && s.hands?.[side] && TYPES.every(type => s.hands[side][type] === undefined || (Number.isInteger(s.hands[side][type]) && s.hands[side][type] >= 0)))
    && Array.isArray(s.log) && Number.isInteger(s.nextId) && Number.isInteger(s.moveNumber);
}
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved?.version === 2 && validSaved(saved.state)) {
    state = saved.state;
    history = Array.isArray(saved.history) ? saved.history.filter(validSaved).slice(-100) : [];
    flipped = false;
  }
} catch { /* A missing or damaged save starts a new game. */ }

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ version: 2, state, history, flipped })); saveAvailable = true; }
  catch { saveAvailable = false; }
  $('save-note').hidden = saveAvailable;
  $('save-note').textContent = saveAvailable ? '' : t('自動保存できません。');
}

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function view(p) { return { x: (flipped ? SIZE - p.x : p.x) * UNIT, y: (flipped ? SIZE - p.y : p.y) * UNIT }; }
function logical(event) {
  const rect = board.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * SIZE;
  const y = (event.clientY - rect.top) / rect.height * SIZE;
  return flipped ? { x: SIZE - x, y: SIZE - y } : { x, y };
}
function atPoint(p) {
  return state.pieces.filter(piece => Math.hypot(piece.x - p.x, piece.y - p.y) <= RADIUS + 0.08)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
}
function currentPiece() { return selected?.id ? state.pieces.find(p => p.id === selected.id) : null; }
function destination(raw) { return raw; }

function message(text, error = false) {
  $('status').textContent = t(text);
  $('status').hidden = !text;
  $('status').classList.toggle('error', error);
}

function renderHands() {
  for (const side of ['sente', 'gote']) {
    const container = $(`${side}-hand`);
    container.replaceChildren();
    const active = state.turn === side && !state.winner;
    $(`${side}-tray`).classList.toggle('active', active);
    for (const type of TYPES) {
      const count = state.hands[side][type] || 0;
      if (!count) continue;
      const button = document.createElement('button');
      button.className = 'hand-piece';
      button.classList.toggle('selected', active && selected?.drop === type);
      button.disabled = !active;
      button.setAttribute('aria-label', localized(`${sideName(side)}の持ち駒 ${NAMES[type]} ${count}枚`, `${sideName(side)} hand: ${pieceName(NAMES[type])}, ${count}`));
      button.setAttribute('aria-pressed', active && selected?.drop === type ? 'true' : 'false');
      const face = svg('svg', { viewBox: '-36 -40 72 80', class: 'hand-piece-face', 'aria-hidden': 'true' });
      face.append(svg('path', { d: 'M0 -36 L23 -23 L29 31 L-29 31 L-23 -23 Z', class: 'hand-piece-body' }));
      face.append(svg('text', { 'text-anchor': 'middle', y: 15, class: 'hand-piece-text' }, NAMES[type]));
      button.append(face);
      const amount = document.createElement('sup');
      amount.textContent = count;
      button.append(amount);
      button.addEventListener('click', () => {
        selected = { drop: type }; ghost = null;
        render();
        message('');
        board.focus({ preventScroll: true });
      });
      container.append(button);
    }
    if (!container.children.length) {
      const empty = document.createElement('span'); empty.className = 'empty-hand'; empty.textContent = t('持ち駒なし'); container.append(empty);
    }
  }
  document.querySelector('.play-area').classList.toggle('is-flipped', flipped);
}

function renderPieces() {
  const threatened = cached('threats', () => threatenedPieceIds(state));
  for (const [key, side] of [['own', state.turn], ['opponent', other(state.turn)]]) {
    const button = $(key === 'own' ? 'own-threats' : 'opponent-threats');
    button.setAttribute('aria-pressed', String(threatVisibility[key]));
    button.title = localized(`${sideName(side)}の取られそうな駒を表示`, `Show threatened ${sideName(side)} pieces`);
  }
  const layer = $('piece-layer'); layer.replaceChildren();
  for (const p of state.pieces) {
    const v = view(p);
    const inCheck = p.type === 'K' && checked(p.side);
    const chosen = selected?.id === p.id;
    const threatSide = p.side === state.turn ? 'own' : 'opponent';
    const showThreat = threatened.has(p.id) && threatVisibility[threatSide];
    const group = svg('g', { class: `piece${p.promoted ? ' promoted' : ''}${chosen ? ' selected' : ''}${inCheck ? ' checked' : ''}${showThreat ? ` threatened threat-${threatSide}` : ''}`, transform: `translate(${v.x} ${v.y})`, 'data-piece-id': p.id, role: 'button', tabindex: !state.winner && p.side === state.turn ? '0' : '-1', 'aria-label': `${sideName(p.side)} ${pieceName(label(p))} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${threatened.has(p.id) ? localized(' 取られる可能性あり', ' threatened') : ''}`, 'aria-pressed': chosen ? 'true' : 'false' });
    group.append(svg('circle', { r: 42 * PIECE_SCALE, class: 'hit-disc' }));
    if (showThreat || inCheck) group.append(svg('circle', { r: 44 * PIECE_SCALE, class: 'threat-ring', 'pointer-events': 'none' }));
    if (chosen) group.append(svg('circle', { r: 43 * PIECE_SCALE, class: 'selection-ring' }));
    const rotation = (p.side === 'gote') !== flipped ? 180 : 0;
    const shape = svg('g', { transform: `rotate(${rotation}) scale(${PIECE_SCALE})`, 'pointer-events': 'none' });
    shape.append(svg('path', { d: 'M0 -36 L23 -23 L29 31 L-29 31 L-23 -23 Z', class: 'piece-body' }));
    shape.append(svg('text', { class: 'piece-text', 'text-anchor': 'middle', y: 15 }, label(p)));
    group.append(shape);
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectPiece(p); board.focus({ preventScroll: true }); }
    });
    layer.append(group);
  }
}

function renderLastMove() {
  const layer = $('last-move-layer'); layer.replaceChildren();
  if (!state.lastMove) return;
  const to = view(state.lastMove.to);
  if (state.lastMove.from) {
    const from = view(state.lastMove.from);
    layer.append(svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: '#897047', 'stroke-width': 2, 'stroke-dasharray': '6 8', opacity: 0.55 }));
    layer.append(svg('circle', { cx: from.x, cy: from.y, r: 8, fill: 'none', stroke: '#897047', 'stroke-width': 2, opacity: 0.6 }));
  }
  layer.append(svg('circle', { cx: to.x, cy: to.y, r: 40 * PIECE_SCALE, fill: '#5f795818', stroke: '#6d855c', 'stroke-width': 2, opacity: 0.65 }));
}

function drawRange(p, layer, color = '#32745d', prefix = 'selected', captureHints = true, position = state) {
  if (position === state) {
    const key = `range:${p.id}:${color}:${prefix}:${captureHints}`;
    const nodes = cached(key, () => {
      const buffer = svg('g');
      drawRange(p, buffer, color, prefix, captureHints, { ...position });
      return buffer;
    });
    layer.append(...[...nodes.childNodes].map(node => node.cloneNode(true)));
    return;
  }
  const pos = view(p), direction = forward(p.side) * (flipped ? -1 : 1);
  const group = svg('g', { transform: `translate(${pos.x} ${pos.y}) scale(1 ${-direction})`, fill: color, 'fill-opacity': '0.16', stroke: color, 'stroke-opacity': '0.38', 'stroke-width': '1.5', 'pointer-events': 'none' });
  const type = p.promoted && ['P', 'L', 'N', 'S'].includes(p.type) ? 'G' : p.type;
  const range = (MOVE_RANGE[type] || MOVE_RANGE.K) * UNIT;
  const disk = () => group.append(svg('circle', { r: MOVE_RANGE.K * UNIT }));
  const sector = degrees => {
    const point = angle => ({ x: Math.sin(angle * Math.PI / 180) * range, y: -Math.cos(angle * Math.PI / 180) * range });
    const a = point(degrees - SECTOR_HALF_ANGLE), b = point(degrees + SECTOR_HALF_ANGLE);
    group.append(svg('path', { d: `M0 0 L${a.x} ${a.y} A${range} ${range} 0 0 1 ${b.x} ${b.y} Z` }));
  };
  const band = (rotation, oneWay = false) => {
    const half = BAND_HALF_WIDTH * UNIT, far = 900 * Math.SQRT2;
    group.append(svg('rect', { x: -half, y: -far, width: half * 2, height: oneWay ? far : far * 2, transform: `rotate(${rotation})` }));
  };
  switch (type) {
    case 'K': disk(); break;
    case 'P': group.append(svg('rect', { x: -PAWN_HALF_WIDTH * UNIT, y: -MOVE_RANGE.P * UNIT, width: PAWN_HALF_WIDTH * 2 * UNIT, height: MOVE_RANGE.P * UNIT })); break;
    case 'G': [0, 45, -45, 90, -90, 180].forEach(sector); break;
    case 'S': [0, 45, -45, 135, -135].forEach(sector); break;
    case 'N': [-1, 1].forEach(sign => group.append(svg('circle', { cx: sign * KNIGHT.lateral * UNIT, cy: -KNIGHT.forward * UNIT, r: KNIGHT.radius * UNIT }))); break;
    case 'L': band(0, true); break;
    case 'R': [0, 90].forEach(angle => band(angle)); if (p.promoted) disk(); break;
    case 'B': [-45, 45].forEach(angle => band(angle)); if (p.promoted) disk(); break;
  }
  const maskedShape = (excludeId, suffix, captureTarget = null) => {
    const maskId = `path-${prefix}-${p.id}-${suffix}`;
    const mask = svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 900, height: 900 });
    mask.append(svg('rect', { width: 900, height: 900, fill: 'white' }));
    for (const obstacle of position.pieces) {
      if (obstacle.id === p.id || obstacle.id === excludeId) continue;
      const v = view(obstacle), dx = v.x - pos.x, dy = v.y - pos.y;
      const distance = Math.hypot(dx, dy), radius = RADIUS * UNIT;
      mask.append(svg('circle', { cx: v.x, cy: v.y, r: radius * 2, fill: 'black' }));
      if (isJump(p) || distance <= radius) continue;
      const angle = Math.atan2(dy, dx), spread = Math.asin(radius / distance);
      const tangent = Math.sqrt(distance * distance - radius * radius);
      const point = (a, length) => `${pos.x + Math.cos(a) * length} ${pos.y + Math.sin(a) * length}`;
      mask.append(svg('path', { d: `M${point(angle - spread, tangent)} L${point(angle - spread, 2000)} L${point(angle + spread, 2000)} L${point(angle + spread, tangent)} Z`, fill: 'black' }));
    }
    layer.append(mask);
    const visible = svg('g', { mask: `url(#${maskId})` });
    const shape = group.cloneNode(true);
    if (captureTarget) {
      const clipId = `capture-${prefix}-${p.id}-${excludeId}`;
      const clip = svg('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
      const targetPos = view(captureTarget);
      clip.append(svg('circle', { cx: targetPos.x, cy: targetPos.y, r: 2 * RADIUS * UNIT }));
      layer.append(clip);
      const area = svg('g', { 'clip-path': `url(#${clipId})` });
      if (captureHints) { shape.setAttribute('fill', '#c28631'); shape.setAttribute('stroke', '#b77b27'); }
      area.append(shape); visible.append(area);
    } else visible.append(shape);
    layer.append(visible);
  };
  maskedShape(null, 'empty');
  for (const target of position.pieces) {
    if (target.side === p.side || target.type === 'K' || !captureDestination(position, p, target)) continue;
    maskedShape(target.id, `enemy-${target.id}`, target);
  }
}

function renderDropZones() {
  const layer = $('drop-zones-layer'); layer.replaceChildren();
  if (!selected?.drop) return;
  const href = cached(`drop:${selected.drop}`, () => {
    const check = createDropValidator(state, selected.drop);
    const resolution = checked(state.turn) ? 72 : 240;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = resolution;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(resolution, resolution);
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
      const point = { x: (x + 0.5) / resolution * SIZE, y: (y + 0.5) / resolution * SIZE };
      if (flipped) { point.x = SIZE - point.x; point.y = SIZE - point.y; }
      if (!check(point).ok) continue;
      const index = (y * resolution + x) * 4;
      pixels.data[index] = 50; pixels.data[index + 1] = 130; pixels.data[index + 2] = 85; pixels.data[index + 3] = 36;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
  });
  layer.append(svg('image', { href, width: 900, height: 900 }));
}

function renderRange() {
  renderDropZones();
  const all = $('all-ranges-layer');
  const sides = [
    ['own', state.turn, '#426eaa'],
    ['opponent', other(state.turn), '#b9653b'],
  ];
  for (const [key, side] of sides) {
    const button = $(key === 'own' ? 'own-ranges' : 'opponent-ranges');
    button.setAttribute('aria-pressed', String(rangeVisibility[key]));
    button.title = localized(`${sideName(side)}の全駒の移動範囲`, `Show all ${sideName(side)} movement ranges`);
  }
  const combined = cached(`all:${rangeVisibility.own}:${rangeVisibility.opponent}`, () => {
    const buffer = svg('g');
    for (const [key, side, color] of sides) {
      if (!rangeVisibility[key]) continue;
      const group = svg('g', { opacity: 0.65, 'pointer-events': 'none' });
      for (const p of state.pieces) if (p.side === side) drawRange(p, group, color, key, false);
      buffer.append(group);
    }
    return buffer;
  });
  if (displayedAllRanges !== combined) {
    all.replaceChildren(combined);
    displayedAllRanges = combined;
  }
  const selectedLayer = $('range-layer'); selectedLayer.replaceChildren();
  const p = currentPiece();
  if (p) drawRange(p, selectedLayer);
}

function renderGhost() {
  ghostFrames.cancel();
  const layer = $('ghost-layer'); layer.replaceChildren();
  const previewLayer = $('drop-preview-layer'); previewLayer.replaceChildren();
  for (const node of $('piece-layer').children) {
    node.classList.toggle('in-transit', !!ghost && Number(node.dataset.pieceId) === selected?.id);
    node.classList.remove('preview-captured');
  }
  if (!selected || !ghost) return;
  const result = selected.drop ? validateDrop(state, selected.drop, ghost) : validateMove(state, selected.id, ghost);
  const v = view(ghost), p = currentPiece();
  let candidate = p || { type: selected.drop, side: state.turn, promoted: false };
  if (result.ok) {
    candidate = selected.drop
      ? { id: state.nextId, type: selected.drop, side: state.turn, ...ghost, promoted: false }
      : { ...p, ...ghost, promoted: p.promoted || result.mustPromote };
    const placed = { ...state, pieces: [...state.pieces.filter(piece => piece.id !== candidate.id && piece.id !== result.captured?.id), candidate] };
    drawRange(candidate, previewLayer, '#426eaa', 'candidate', false, { ...placed, turn: state.turn });
    if (result.captured) {
      $('piece-layer').querySelector(`[data-piece-id="${result.captured.id}"]`)?.classList.add('preview-captured');
    }
  }
  if (p) {
    const from = view(p);
    layer.append(svg('line', { x1: from.x, y1: from.y, x2: v.x, y2: v.y, stroke: result.ok ? '#27694f' : '#ac573f', 'stroke-width': 2, 'stroke-dasharray': '4 5', opacity: 0.7 }));
  }
  layer.append(svg('circle', { cx: v.x, cy: v.y, r: RADIUS * UNIT, fill: result.ok ? '#37795d22' : '#b0573622', stroke: result.ok ? '#2c7254' : '#ad553b', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));
  const rotation = (candidate.side === 'gote') !== flipped ? 180 : 0;
  const held = svg('g', { class: `piece piece-preview ${result.ok ? 'valid' : 'invalid'}`, transform: `translate(${v.x} ${v.y}) rotate(${rotation}) scale(${PIECE_SCALE})`, 'pointer-events': 'none', 'aria-hidden': 'true' });
  held.append(svg('path', { d: 'M0 -36 L23 -23 L29 31 L-29 31 L-23 -23 Z', class: 'piece-body' }));
  held.append(svg('text', { class: 'piece-text', 'text-anchor': 'middle', y: 15 }, label(candidate)));
  layer.append(held);
}

function render() {
  renderHands(); renderLastMove(); renderRange(); renderPieces(); renderGhost();
  board.classList.toggle('has-selection', !!selected);
  $('turn-title').textContent = state.winner ? localized(`${sideName(state.winner)}の勝ち`, `${sideName(state.winner)} wins`) : localized(`${sideName(state.turn)}の番`, `${sideName(state.turn)} to move`);
  $('move-number').textContent = localized(`${state.moveNumber}手目`, `Move ${state.moveNumber}`);
  const inCheck = !state.winner && checked(state.turn);
  $('check-banner').hidden = !inCheck;
  $('check-banner').textContent = localized(`王手 · ${sideName(state.turn)}`, `Check · ${sideName(state.turn)}`);
  board.classList.toggle('in-check', inCheck);
  $('undo').disabled = history.length === 0;
  $('resign').disabled = !!state.winner;
  $('history-count').textContent = localized(`${state.log.length}手`, `${state.log.length}`);
  const list = $('history'); list.replaceChildren();
  if (!state.log.length) { const li = document.createElement('li'); li.className = 'empty-history'; li.textContent = t('着手なし'); list.append(li); }
  for (const move of state.log.slice(-100).reverse()) {
    const li = document.createElement('li');
    const number = document.createElement('span'); number.textContent = String(move.number);
    const text = document.createElement('span'); text.textContent = `${move.side === 'sente' ? '☗' : '☖'} ${historyText(move.text)}`;
    li.append(number, text); list.append(li);
  }
}

function selectPiece(piece) {
  if (piece.side !== state.turn || state.winner || pending) return;
  selected = { id: piece.id }; ghost = null;
  render(); message('');
}
function clearSelection() { selected = null; ghost = null; render(); }

function commit(result) {
  if (!result.ok) { message(''); return; }
  history.push(clone(state)); history = history.slice(-100);
  state = result.state; selected = null; ghost = null;
  save(); render();
  message('');
}

function attempt(raw) {
  if (!selected || state.winner || pending) return;
  const to = destination(raw); ghost = to; renderGhost();
  if (selected.drop) { commit(dropPiece(state, selected.drop, to)); return; }
  const result = validateMove(state, selected.id, to);
  if (!result.ok) { message(''); return; }
  if (result.canPromote && !result.mustPromote) {
    pending = { id: selected.id, to };
    $('promotion-dialog').showModal();
  } else commit(movePiece(state, selected.id, to));
}

board.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pending || state.winner) return;
  const point = logical(event), hit = atPoint(point);
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, own: !selected?.drop && hit?.side === state.turn, cancelOnClick: !!hit && hit.id === selected?.id };
  if (pointer.own) selectPiece(hit);
  board.setPointerCapture(event.pointerId);
  board.focus({ preventScroll: true });
});
board.addEventListener('pointermove', event => {
  if (!selected || pending) return;
  ghost = destination(logical(event)); ghostFrames.schedule();
});
board.addEventListener('pointerup', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5;
  const { own, cancelOnClick } = pointer; pointer = null;
  if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  if (own && !moved) {
    if (cancelOnClick) { clearSelection(); message(''); }
    return;
  }
  const to = logical(event);
  const result = selected?.drop ? validateDrop(state, selected.drop, to)
    : selected?.id ? validateMove(state, selected.id, to) : null;
  if (result && !result.ok) {
    clearSelection(); message('');
    return;
  }
  attempt(to);
});
board.addEventListener('pointercancel', () => { pointer = null; ghost = null; renderGhost(); });
board.addEventListener('pointerleave', () => { if (!pointer) { ghost = null; renderGhost(); } });
board.addEventListener('keydown', event => {
  if (!selected || pending || event.target !== board) return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (ghost) attempt(ghost); return; }
  const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (!arrows[event.key]) return;
  event.preventDefault();
  const p = currentPiece();
  const base = ghost || (p ? { x: p.x, y: p.y } : { x: SIZE / 2, y: SIZE / 2 });
  const step = (event.altKey ? 0.01 : event.shiftKey ? 0.5 : 0.1) * (flipped ? -1 : 1);
  ghost = destination({ x: Math.max(RADIUS, Math.min(SIZE - RADIUS, base.x + arrows[event.key][0] * step)), y: Math.max(RADIUS, Math.min(SIZE - RADIUS, base.y + arrows[event.key][1] * step)) });
  renderGhost();
});

for (const [id, promote] of [['promote-yes', true], ['promote-no', false]]) {
  $(id).addEventListener('click', () => {
    const move = pending; pending = null; $('promotion-dialog').close();
    if (move) commit(movePiece(state, move.id, move.to, promote));
    board.focus({ preventScroll: true });
  });
}
$('promotion-dialog').addEventListener('cancel', () => { pending = null; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { clearSelection(); message(''); }
});
document.addEventListener('pointerdown', event => {
  if (!selected || pending || event.button !== 0) return;
  // Selecting a piece redraws its SVG node before this event reaches document.
  // The original event path still identifies clicks that started on the board.
  if (event.composedPath().includes(board) || event.target.closest('.hand-piece')) return;
  clearSelection(); message('');
});
$('flip').addEventListener('click', () => { flipped = !flipped; ghost = null; save(); render(); });
$('undo').addEventListener('click', () => {
  if (!history.length) return;
  state = history.pop(); selected = null; ghost = null;
  save(); render(); message('');
});
function confirm(title, description, action) {
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  confirmAction = action; $('confirm-dialog').showModal();
}
$('confirm-no').addEventListener('click', () => { confirmAction = null; $('confirm-dialog').close(); });
$('confirm-dialog').addEventListener('cancel', () => { confirmAction = null; });
$('confirm-yes').addEventListener('click', () => { const action = confirmAction; confirmAction = null; $('confirm-dialog').close(); action?.(); });
$('reset').addEventListener('click', () => confirm(t('新しい対局を始めますか？'), t('現在の対局と棋譜を消して、初期配置に戻します。'), () => {
  state = initialState(); history = []; selected = null; ghost = null;
  save(); render(); message('');
}));
$('resign').addEventListener('click', () => confirm(localized(`${sideName(state.turn)}が投了しますか？`, `Resign as ${sideName(state.turn)}?`), localized(`${sideName(other(state.turn))}の勝ちで、この対局を終了します。`, `${sideName(other(state.turn))} wins and the game ends.`), () => {
  history.push(clone(state)); history = history.slice(-100);
  state = { ...state, winner: other(state.turn) }; selected = null; ghost = null;
  save(); render(); message('');
}));
$('rules-open').addEventListener('click', () => $('rules-dialog').showModal());
$('rules-close').addEventListener('click', () => $('rules-dialog').close());
captureTranslations(document.body);
applyLanguage();
$('language-toggle').textContent = getLanguage() === 'ja' ? 'EN' : '日本語';
$('language-toggle').setAttribute('aria-label', getLanguage() === 'ja' ? 'Switch to English' : '日本語に切り替え');
render(); save();
message('');

for (const [id, key] of [['own-ranges', 'own'], ['opponent-ranges', 'opponent']]) {
  $(id).addEventListener('click', () => {
    rangeVisibility[key] = !rangeVisibility[key];
    renderRange();
  });
}

for (const [id, key] of [['own-threats', 'own'], ['opponent-threats', 'opponent']]) {
  $(id).addEventListener('click', () => {
    threatVisibility[key] = !threatVisibility[key];
    renderPieces();
  });
}

$('language-toggle').addEventListener('click', () => {
  setLanguage(getLanguage() === 'ja' ? 'en' : 'ja');
  applyLanguage();
  updateFullscreenButton();
  $('language-toggle').textContent = getLanguage() === 'ja' ? 'EN' : '日本語';
  $('language-toggle').setAttribute('aria-label', getLanguage() === 'ja' ? 'Switch to English' : '日本語に切り替え');
  render();
  message('');
  if (!saveAvailable) $('save-note').textContent = t('自動保存できません。');
});

function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function updateFullscreenButton() {
  const active = !!fullscreenElement();
  const supported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const button = $('fullscreen-toggle');
  const caption = t(!supported ? 'このブラウザでは全画面表示を利用できません。' : active ? '全画面を終了' : '全画面表示');
  button.disabled = !supported;
  button.title = caption;
  button.setAttribute('aria-label', caption);
  button.setAttribute('aria-pressed', String(active));
  $('fullscreen-icon').setAttribute('d', active ? 'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5' : 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
}
$('fullscreen-toggle').addEventListener('click', async () => {
  const active = !!fullscreenElement();
  try {
    if (active) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else document.webkitExitFullscreen();
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else { message(t('このブラウザでは全画面表示を利用できません。'), true); return; }
    }
    message('');
  } catch {
    message(t(active ? '全画面表示を終了できませんでした。' : '全画面表示を開始できませんでした。'), true);
  }
  updateFullscreenButton();
});
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
updateFullscreenButton();
