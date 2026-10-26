import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLanguage, getLanguage, t, sideName, pieceName, historyText } from '../public/i18n.js';

test('language switches labels and back without changing source move records', () => {
  const record = '飛 → (2.13, 3.14) 歩取り 成';
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(sideName('sente'), 'Sente');
  assert.equal(pieceName('龍'), 'Dragon');
  assert.equal(historyText(record), 'Rook → (2.13, 3.14) · takes Pawn · promotes');
  assert.equal(historyText('歩打 (4.12, 5.67)'), 'Drop Pawn (4.12, 5.67)');
  setLanguage('ja');
  assert.equal(sideName('sente'), '先手');
  assert.equal(historyText(record), record);
});

test('every game validation reason has an English translation', () => {
  setLanguage('en');
  const source = readFileSync(new URL('../public/engine.js', import.meta.url), 'utf8');
  for (const [, reason] of source.matchAll(/reason: '([^']+)'/g)) assert.notEqual(t(reason), reason, reason);
  setLanguage('ja');
});
