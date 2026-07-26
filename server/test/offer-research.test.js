import test from 'node:test';
import assert from 'node:assert/strict';
import { detectVerticalKey } from '../src/pipeline/knowledge/global-market.js';
import { stripHtml } from '../src/lib/htmlText.js';

test('detectVerticalKey: loan offer beats Fintech UI default', () => {
  const key = detectVerticalKey({
    vertical: 'Fintech',
    name: 'Деньги Сразу - Выдача',
    notes: 'Для оформления займа нужен только паспорт, получите от 1000 до 30000 рублей',
  });
  assert.equal(key, 'fintech_loans');
});

test('detectVerticalKey: PPM card offer', () => {
  const key = detectVerticalKey({
    vertical: 'Fintech',
    name: 'Плати по миру - Выпуск карты',
    notes: 'Выпуск зарубежной карты, пополнение по СБП',
  });
  assert.equal(key, 'fintech_cards');
});

test('stripHtml cleans LeadGid descriptions', () => {
  const t = stripHtml('<p>МФО &laquo;Деньги Сразу&raquo; даёт займы</p>');
  assert.match(t, /МФО «Деньги Сразу» даёт займы/);
  assert.equal(/</.test(t), false);
});
