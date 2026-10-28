import { normalizeGameMode, isCpuTurn, cpuMoveDelay } from './game-mode.js';
import { applyCpuMove } from './cpu.js';
import { loupeGeometry } from './touch-loupe.js';
import { createRecord, appendRecord, recordFromHistory, readRecord, decodeRecord, samePosition, MAX_RECORD_BYTES } from './records.js';
import { legalKingRange } from './king-range.js';
import { legalMovementBranches, unionPaths, pathsToSvg } from './range-geometry.js';
import { captureReach } from './capture-reach.js';
import { previewThreats } from './preview-threats.js';
import { createRenderCache, createFrameScheduler } from './render-cache.js';
import { t, sideName, pieceName, historyText, getLanguage, setLanguage, captureTranslations, applyLanguage } from './i18n.js';
import { SIZE, RADIUS, TYPES, NAMES, label, clone, initialState, other, isInCheck, threatenedPieceIds, validateMove, movePiece, createDropValidator, validateDrop, dropPiece } from './engine.js';

const $ = id => document.getElementById(id);
const localized = (ja, en) => getLanguage() === 'en' ? en : ja;
const board = $('board');
const NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'ma-continuous-shogi-v2';
const UNIT = 900 / SIZE;
const PIECE_SCALE = UNIT / 100;
let state = initialState();
let history = [];
let gameRecord = createRecord(state);
let replay = null;
let replayTimer = null;
let selected = null;
let ghost = null;
let flipped = false;
let pointer = null;
let touchPoint = null;
let loupeCorner = null;
let pending = null;
let confirmAction = null;
let saveAvailable = true;
let gameMode = 'local';
let cpuPaused = false;
let cpuWorker = null;
let cpuTimer = null;
let cpuDeadline = null;
let cpuEpoch = 0;
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
    gameMode = normalizeGameMode(saved.gameMode);
    cpuPaused = gameMode === 'cpu-vs-cpu' && saved.cpuPaused === true;
    history = Array.isArray(saved.history) ? saved.history.filter(validSaved).slice(-100) : [];
    flipped = false;
    try {
      const loaded = readRecord(saved.record);
      if (!samePosition(loaded.frames.at(-1), state)) throw new Error();
      gameRecord = loaded.record;
    } catch { gameRecord = recordFromHistory(history, state); }
  }
} catch { state = initialState(); history = []; gameRecord = createRecord(state); }

function save() {
  if (replay) return;
  try { localStorage.setItem(STORAGE, JSON.stringify({ version: 2, state, history, flipped, record: gameRecord, gameMode, cpuPaused })); saveAvailable = true; }
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
    const active = !replay && !cpuTurn() && state.turn === side && !state.winner;
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
  for (const [key, side] of [['own', 'sente'], ['opponent', 'gote']]) {
    const button = $(key === 'own' ? 'own-threats' : 'opponent-threats');
    button.setAttribute('aria-pressed', String(threatVisibility[key]));
    button.title = localized(`${sideName(side)}の取られそうな駒を表示`, `Show threatened ${sideName(side)} pieces`);
  }
  const layer = $('piece-layer'); layer.replaceChildren();
  for (const p of state.pieces) {
    const v = view(p);
    const inCheck = p.type === 'K' && checked(p.side);
    const chosen = selected?.id === p.id;
    const threatSide = p.side === 'sente' ? 'own' : 'opponent';
    const showThreat = threatened.has(p.id) && threatVisibility[threatSide];
    const group = svg('g', { class: `piece${p.promoted ? ' promoted' : ''}${chosen ? ' selected' : ''}${inCheck ? ' checked' : ''}${showThreat ? ` threatened threat-${threatSide}` : ''}`, transform: `translate(${v.x} ${v.y})`, 'data-piece-id': p.id, role: 'button', tabindex: !replay && !cpuTurn() && !state.winner && p.side === state.turn ? '0' : '-1', 'aria-label': `${sideName(p.side)} ${pieceName(label(p))} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${threatened.has(p.id) ? localized(' 取られる可能性あり', ' threatened') : ''}`, 'aria-pressed': chosen ? 'true' : 'false' });
    group.append(svg('circle', { r: 42 * PIECE_SCALE, class: 'hit-disc' }));
    if (inCheck) group.append(svg('circle', { r: RADIUS * UNIT, class: 'threat-ring', 'pointer-events': 'none' }));
    else if (chosen) group.append(svg('circle', { r: RADIUS * UNIT, class: 'selection-ring', 'pointer-events': 'none' }));
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
    layer.append(svg('rect', { x: from.x - 3, y: from.y - 3, width: 6, height: 6, fill: '#897047', opacity: 0.6 }));
  }
  layer.append(svg('circle', { cx: to.x, cy: to.y, r: RADIUS * UNIT, fill: '#5f795818', stroke: '#6d855c', 'stroke-width': 2, opacity: 0.65 }));
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
  if (p.type === 'K') {
    drawVectorRange(legalKingRange(position, p).paths, layer, color, 41);
    return;
  }
  const branches = legalMovementBranches(position, p);
  drawVectorRange(unionPaths(branches.flatMap(branch => branch.paths)), layer, color, 41);
  if (captureHints) for (const branch of branches) {
    if (branch.target) drawVectorRange(branch.paths, layer, '#c28631', 38);
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
      pixels.data[index] = 66; pixels.data[index + 1] = 110; pixels.data[index + 2] = 170; pixels.data[index + 3] = 24;
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
    ['own', 'sente', '#426eaa'],
    ['opponent', 'gote', '#b9653b'],
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
  if (p) drawRange(p, selectedLayer, '#426eaa');
}

function drawVectorRange(paths, layer, color, opacity) {
  if (!paths.length) return;
  layer.append(svg('path', { d: pathsToSvg(paths), fill: color, 'fill-opacity': opacity / 255,
    'fill-rule': 'evenodd', stroke: color, 'stroke-width': 1.5, 'stroke-opacity': 0.5,
    'stroke-linejoin': 'round', transform: flipped ? 'rotate(180 450 450)' : '', 'pointer-events': 'none' }));
}

function drawCaptureReach(position, piece, layer) {
  drawVectorRange(captureReach(position, piece).paths, layer, '#568f5b', 43);
}

function renderGhost() {
  ghostFrames.cancel();
  const layer = $('ghost-layer'); layer.replaceChildren();
  const previewLayer = $('drop-preview-layer'); previewLayer.replaceChildren();
  for (const node of $('piece-layer').children) {
    node.classList.toggle('in-transit', !!ghost && Number(node.dataset.pieceId) === selected?.id);
    node.classList.remove('preview-captured', 'preview-target', 'preview-check');
  }
  if (!selected || !ghost) { renderLoupe(); return; }
  const result = selected.drop ? validateDrop(state, selected.drop, ghost) : validateMove(state, selected.id, ghost);
  const v = view(ghost), p = currentPiece();
  let candidate = p || { type: selected.drop, side: state.turn, promoted: false };
  let endangered = false;
  if (result.ok) {
    candidate = selected.drop
      ? { id: state.nextId, type: selected.drop, side: state.turn, ...ghost, promoted: false }
      : { ...p, ...ghost, promoted: p.promoted || result.mustPromote };
    const placed = { ...state, pieces: [...state.pieces.filter(piece => piece.id !== candidate.id && piece.id !== result.captured?.id), candidate] };
    drawCaptureReach(placed, candidate, previewLayer);
    const threats = previewThreats(placed, candidate, { own: threatVisibility[candidate.side === 'sente' ? 'own' : 'opponent'], opponent: threatVisibility[candidate.side === 'sente' ? 'opponent' : 'own'] });
    endangered = threats.endangered;
    for (const id of threats.targets) {
      const enemy = placed.pieces.find(piece => piece.id === id), point = view(enemy);
      const isKing = enemy.type === 'K';
      const targetNode = $('piece-layer').querySelector(`[data-piece-id="${id}"]`);
      targetNode?.classList.add('preview-target');
      if (isKing) targetNode?.classList.add('preview-check');
      previewLayer.append(svg('circle', { cx: point.x, cy: point.y, r: RADIUS * UNIT,
        class: isKing ? 'preview-check-ring' : 'preview-target-ring', 'pointer-events': 'none' }));
    }
    if (result.captured) {
      $('piece-layer').querySelector(`[data-piece-id="${result.captured.id}"]`)?.classList.add('preview-captured');
    }
  }
  if (p) {
    const from = view(p);
    layer.append(svg('line', { x1: from.x, y1: from.y, x2: v.x, y2: v.y, stroke: result.ok ? '#27694f' : '#ac573f', 'stroke-width': 2, 'stroke-dasharray': '4 5', opacity: 0.7 }));
  }
  layer.append(svg('circle', { cx: v.x, cy: v.y, r: RADIUS * UNIT, fill: result.ok ? 'none' : '#b0573622', stroke: !result.ok ? '#ad553b' : endangered ? '#843da3' : '#426eaa', 'stroke-width': 2 }));
  const rotation = (candidate.side === 'gote') !== flipped ? 180 : 0;
  const held = svg('g', { class: `piece piece-preview ${result.ok ? 'valid' : 'invalid'}${endangered ? ' preview-endangered' : ''}${candidate.promoted ? ' promoted' : ''}`, transform: `translate(${v.x} ${v.y}) rotate(${rotation}) scale(${PIECE_SCALE})`, 'pointer-events': 'none', 'aria-hidden': 'true' });
  held.append(svg('path', { d: 'M0 -36 L23 -23 L29 31 L-29 31 L-23 -23 Z', class: 'piece-body' }));
  held.append(svg('text', { class: 'piece-text', 'text-anchor': 'middle', y: 15 }, label(candidate)));
  layer.append(held);
  renderLoupe();
}

const loupe = $('touch-loupe');
const loupeView = $('loupe-view');
// Live SVG references reuse the existing scene, without copying the board per frame.
for (const id of ['last-move-layer', 'all-ranges-layer', 'drop-zones-layer', 'range-layer', 'drop-preview-layer', 'piece-layer', 'ghost-layer']) {
  loupeView.append(svg('use', { href: `#${id}` }));
}
const loupeCrosshair = svg('path', { fill: 'none', stroke: '#403b32', 'stroke-opacity': '.65', 'vector-effect': 'non-scaling-stroke', 'stroke-width': 1 });
loupeView.append(loupeCrosshair);
function renderLoupe() {
  if (!touchPoint || !selected || !ghost || pending || replay) {
    loupe.hidden = true; loupeCorner = null; return;
  }
  const geometry = loupeGeometry(board.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, touchPoint, view(ghost), loupeCorner);
  if (!geometry) { loupe.hidden = true; return; }
  loupeCorner = geometry.corner;
  loupe.style.left = `${geometry.left}px`; loupe.style.top = `${geometry.top}px`;
  loupe.style.width = loupe.style.height = `${geometry.size}px`;
  loupeView.setAttribute('viewBox', geometry.viewBox.join(' '));
  const { x, y } = geometry.center, arm = geometry.span * .045, hole = geometry.span * .018;
  loupeCrosshair.setAttribute('d', `M${x-arm} ${y}H${x-hole}M${x+hole} ${y}H${x+arm}M${x} ${y-arm}V${y-hole}M${x} ${y+hole}V${y+arm}`);
  loupe.hidden = false;
}
function hideLoupe() { touchPoint = null; renderLoupe(); }

function render() {
  renderHands(); renderLastMove(); renderRange(); renderPieces(); renderGhost();
  board.classList.toggle('has-selection', !!selected);
  $('turn-title').textContent = state.winner ? localized(`${sideName(state.winner)}の勝ち`, `${sideName(state.winner)} wins`) : localized(`${sideName(state.turn)}の番`, `${sideName(state.turn)} to move`);
  $('move-number').textContent = localized(`${state.moveNumber}手目`, `Move ${state.moveNumber}`);
  const inCheck = !state.winner && checked(state.turn);
  $('check-banner').hidden = !inCheck;
  $('check-banner').textContent = localized(`王手 · ${sideName(state.turn)}`, `Check · ${sideName(state.turn)}`);
  board.classList.toggle('in-check', inCheck);
  $('undo').disabled = !!replay || history.length === 0;
  $('resign').hidden = gameMode === 'cpu-vs-cpu';
  $('resign').disabled = !!replay || cpuTurn() || !!state.winner;
  $('reset').disabled = !!replay;
  renderRecord();
  $('game-mode').value = gameMode;
  $('game-mode').disabled = !!replay;
  $('cpu-status').hidden = !cpuTurn() || !!replay || !!state.winner || gameMode === 'cpu-vs-cpu';
  $('cpu-status').textContent = t('CPUが考えています…');
  $('cpu-pause').hidden = gameMode !== 'cpu-vs-cpu';
  $('cpu-pause').disabled = !!replay || !!state.winner;
  $('cpu-pause').textContent = t(cpuPaused ? '再開' : '一時停止');
  $('cpu-pause').setAttribute('aria-pressed', String(cpuPaused));
  scheduleCpu();
}

function selectPiece(piece) {
  if (replay || cpuTurn() || piece.side !== state.turn || state.winner || pending) return;
  selected = { id: piece.id }; ghost = null;
  render(); message('');
}
function clearSelection() { selected = null; ghost = null; render(); }

function commit(result) {
  if (replay) return;
  if (!result.ok) { message(''); return; }
  history.push(clone(state)); history = history.slice(-100);
  gameRecord = appendRecord(gameRecord, state, result.state);
  state = result.state; selected = null; ghost = null;
  save(); render();
  message('');
}

function attempt(raw) {
  if (replay || cpuTurn() || !selected || state.winner || pending) return;
  const to = destination(raw); ghost = to; renderGhost();
  if (selected.drop) { commit(dropPiece(state, selected.drop, to)); return; }
  const result = validateMove(state, selected.id, to);
  if (!result.ok) { message(result.reason, true); return; }
  if (result.canPromote && !result.mustPromote) {
    pending = { id: selected.id, to };
    hideLoupe();
    $('promotion-dialog').showModal();
  } else commit(movePiece(state, selected.id, to));
}

board.addEventListener('pointerdown', event => {
  if (replay || cpuTurn() || event.button !== 0 || event.isPrimary === false || pending || state.winner || pointer) return;
  if (event.cancelable) event.preventDefault();
  touchPoint = null;
  const point = logical(event), hit = atPoint(point);
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, own: !selected?.drop && hit?.side === state.turn, cancelOnClick: !!hit && hit.id === selected?.id };
  if (pointer.own) selectPiece(hit);
  board.setPointerCapture(event.pointerId);
  board.focus({ preventScroll: true });
});
board.addEventListener('pointermove', event => {
  if (!selected || pending || event.isPrimary === false) return;
  if (event.pointerType === 'touch') {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.min(innerWidth, innerHeight) <= 700) touchPoint = { x: event.clientX, y: event.clientY };
  } else hideLoupe();
  ghost = destination(logical(event)); ghostFrames.schedule();
});
board.addEventListener('pointerup', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (event.cancelable) event.preventDefault();
  hideLoupe();
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
    clearSelection(); message(result.reason, true);
    return;
  }
  attempt(to);
});
board.addEventListener('pointercancel', () => { pointer = null; ghost = null; hideLoupe(); renderGhost(); });
board.addEventListener('lostpointercapture', () => { if (pointer) { pointer = null; ghost = null; hideLoupe(); renderGhost(); } });
for (const type of ['selectstart', 'contextmenu', 'dragstart']) board.addEventListener(type, event => event.preventDefault());
window.addEventListener('resize', hideLoupe);
window.addEventListener('scroll', hideLoupe, { passive: true });
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
  if (replay || !history.length) return;
  cancelCpu();
  if (gameMode === 'cpu-vs-cpu') cpuPaused = true;
  do {
    gameRecord = { ...gameRecord, steps: gameRecord.steps.slice(0, -1) };
    state = history.pop();
  } while (gameMode === 'cpu' && state.turn === 'gote' && history.length);
  selected = null; ghost = null;
  save(); render(); message('');
});
function confirm(title, description, action) {
  cancelCpu();
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  confirmAction = action; $('confirm-dialog').showModal();
}
$('confirm-no').addEventListener('click', () => { confirmAction = null; $('confirm-dialog').close(); scheduleCpu(); });
$('confirm-dialog').addEventListener('cancel', () => { confirmAction = null; setTimeout(scheduleCpu, 0); });
$('confirm-yes').addEventListener('click', () => { const action = confirmAction; confirmAction = null; $('confirm-dialog').close(); action?.(); });
$('reset').addEventListener('click', () => confirm(t('新しい対局を始めますか？'), t('現在の対局と棋譜を消して、初期配置に戻します。'), () => {
  cpuPaused = false;
  state = initialState(); gameRecord = createRecord(state); history = []; selected = null; ghost = null;
  save(); render(); message('');
}));
$('resign').addEventListener('click', () => confirm(localized(`${sideName(state.turn)}が投了しますか？`, `Resign as ${sideName(state.turn)}?`), localized(`${sideName(other(state.turn))}の勝ちで、この対局を終了します。`, `${sideName(other(state.turn))} wins and the game ends.`), () => {
  history.push(clone(state)); history = history.slice(-100);
  const ended = { ...state, winner: other(state.turn) };
  gameRecord = appendRecord(gameRecord, state, ended);
  state = ended; selected = null; ghost = null;
  save(); render(); message('');
}));
$('rules-open').addEventListener('click', () => { cancelCpu(); stopReplay(); $('rules-dialog').showModal(); });
$('rules-close').addEventListener('click', () => { $('rules-dialog').close(); scheduleCpu(); });
$('rules-dialog').addEventListener('cancel', () => setTimeout(scheduleCpu, 0));
function stopReplay() {
  clearInterval(replayTimer); replayTimer = null;
  if ($('replay-play')) {
    $('replay-play').textContent = t('再生');
    $('replay-play').setAttribute('aria-pressed', 'false');
  }
}
function startReplay(record = gameRecord, index = 0, imported = false) {
  if (pending || document.querySelector('dialog[open]')) return;
  try {
    const loaded = readRecord(record);
    cancelCpu(); stopReplay();
    const liveState = replay ? replay.liveState : state;
    replay = { ...loaded, liveState, index: 0, imported };
    selected = null; ghost = null; pointer = null;
    document.querySelector('.history-section').open = true;
    seekReplay(index);
    $('replay-exit').focus();
  } catch { message('棋譜ファイルの形式が正しくありません。', true); }
}
function seekReplay(index) {
  if (!replay) return;
  replay.index = Math.max(0, Math.min(replay.frames.length - 1, index));
  state = replay.frames[replay.index];
  if (replay.index === replay.frames.length - 1) stopReplay();
  render(); message('');
}
function exitReplay() {
  if (!replay) return;
  stopReplay(); state = replay.liveState; replay = null;
  save(); render(); message('');
}
function renderRecord() {
  const record = replay?.record || gameRecord, total = record.steps.length;
  $('replay-panel').hidden = !replay;
  $('replay-start').disabled = !total || !!replay;
  $('history-count').textContent = localized(`${total}操作`, `${total} actions`);
  $('record-note').textContent = record.initial.moveNumber > 1
    ? localized(`${record.initial.moveNumber}手目からの記録です。`, `Recording starts at move ${record.initial.moveNumber}.`)
    : '';
  $('record-note').hidden = !record.initial.moveNumber || record.initial.moveNumber === 1;
  if (replay) {
    const index = replay.index;
    $('replay-heading').textContent = t(replay.imported ? '読み込んだ棋譜' : '棋譜再生');
    $('replay-position').textContent = `${index} / ${total}`;
    $('replay-slider').max = total; $('replay-slider').value = index;
    $('replay-slider').setAttribute('aria-valuetext', `${index} / ${total}`);
    for (const id of ['replay-first', 'replay-prev']) $(id).disabled = index === 0;
    for (const id of ['replay-next', 'replay-last', 'replay-play']) $(id).disabled = index === total;
    $('replay-play').textContent = t(replayTimer ? '一時停止' : '再生');
    $('replay-play').setAttribute('aria-pressed', String(!!replayTimer));
  }
  const list = $('history'); list.replaceChildren();
  if (!total) { const li = document.createElement('li'); li.className = 'empty-history'; li.textContent = t('着手なし'); list.append(li); }
  // Keep long records responsive; the slider can still reach every position.
  const end = replay ? Math.min(total, Math.max(100, replay.index + 50)) : total;
  for (let i = end - 1; i >= Math.max(0, end - 100); i--) {
    const move = record.steps[i].label;
    const li = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.className = 'record-move';
    if (replay?.index === i + 1) button.setAttribute('aria-current', 'step');
    const number = document.createElement('span'); number.textContent = String(move.number);
    const text = document.createElement('span'); text.textContent = `${move.side === 'sente' ? '☗' : '☖'} ${move.kind === 'resign' ? t('投了') : historyText(move.text)}`;
    button.append(number, text);
    button.addEventListener('click', () => {
      if (replay) { stopReplay(); seekReplay(i + 1); }
      else startReplay(gameRecord, i + 1);
    });
    li.append(button); list.append(li);
  }
}
$('replay-start').addEventListener('click', () => startReplay());
$('replay-exit').addEventListener('click', exitReplay);
document.querySelector('.history-section').addEventListener('toggle', event => {
  if (!event.currentTarget.open && replay) exitReplay();
});
for (const [id, index] of [['replay-first', () => 0], ['replay-prev', () => replay.index - 1], ['replay-next', () => replay.index + 1], ['replay-last', () => replay.frames.length - 1]]) {
  $(id).addEventListener('click', () => { if (replay) { stopReplay(); seekReplay(index()); } });
}
$('replay-slider').addEventListener('input', event => { stopReplay(); seekReplay(Number(event.target.value)); });
$('replay-play').addEventListener('click', () => {
  if (!replay) return;
  if (replayTimer) { stopReplay(); return; }
  replayTimer = setInterval(() => { if (replay) seekReplay(replay.index + 1); }, 1000);
  renderRecord();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopReplay(); hideLoupe(); } });
$('record-download').addEventListener('click', () => {
  const record = replay?.record || gameRecord;
  const url = URL.createObjectURL(new Blob([JSON.stringify(record)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `analog-shogi-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('record-import').addEventListener('click', () => $('record-file').click());
$('record-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_RECORD_BYTES) throw new Error('棋譜ファイルが大きすぎます。');
    const loaded = decodeRecord(await file.text());
    startReplay(loaded.record, 0, true);
  } catch (error) { message(error.message === '棋譜ファイルが大きすぎます。' ? error.message : '棋譜ファイルの形式が正しくありません。', true); }
});

function cpuTurn() { return isCpuTurn(gameMode, state.turn); }
function cancelCpu() {
  cpuEpoch++; clearTimeout(cpuTimer); cpuTimer = null;
  clearTimeout(cpuDeadline); cpuDeadline = null;
  cpuWorker?.terminate(); cpuWorker = null;
}
function cpuUnavailable() {
  cancelCpu(); gameMode = 'local'; save(); render();
  message('CPUが指せる手を見つけられませんでした。2人対戦に切り替えました。', true);
}
function scheduleCpu() {
  if (!cpuTurn() || cpuPaused || replay || state.winner || pending || document.querySelector('dialog[open]') || cpuWorker || cpuTimer) return;
  const before = state, epoch = cpuEpoch;
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (before !== state || epoch !== cpuEpoch || cpuPaused || replay || !cpuTurn()) return;
    try {
      cpuWorker = new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' });
      cpuWorker.onmessage = ({ data }) => {
        if (before !== state || epoch !== cpuEpoch || cpuPaused || replay || !cpuTurn()) return;
        const result = applyCpuMove(state, data.action);
        cancelCpu();
        if (result.ok) commit(result); else cpuUnavailable();
      };
      cpuWorker.onerror = () => { if (before === state && epoch === cpuEpoch) cpuUnavailable(); };
      cpuDeadline = setTimeout(cpuUnavailable, 15000);
      cpuWorker.postMessage({ ...state, log: [] });
    } catch { cpuUnavailable(); }
  }, cpuMoveDelay(gameMode));
}
$('game-mode').addEventListener('change', event => {
  cancelCpu(); gameMode = normalizeGameMode(event.target.value); cpuPaused = false;
  selected = null; ghost = null; hideLoupe(); save(); render(); message('');
});

$('cpu-pause').addEventListener('click', () => {
  if (gameMode !== 'cpu-vs-cpu' || replay || state.winner) return;
  cancelCpu(); cpuPaused = !cpuPaused;
  save(); render(); message('');
});

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
    renderGhost();
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
