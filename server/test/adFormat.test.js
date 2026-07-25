import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdFormat,
  resolveAdFormat,
  overlayLinesForOffer,
} from '../src/lib/adFormat.js';
import { buildCreativePrompt } from '../src/lib/imageGen.js';
import { moscowDateISO } from '../src/pipeline/agents/direct.js';

test('normalizeAdFormat aliases', () => {
  assert.equal(normalizeAdFormat('graphic'), 'graphic');
  assert.equal(normalizeAdFormat('товарное'), 'product');
  assert.equal(normalizeAdFormat('auto'), 'auto');
  assert.equal(normalizeAdFormat(''), 'auto');
});

test('resolveAdFormat auto uses image_has_text', () => {
  assert.equal(resolveAdFormat({ requested: 'auto', imageHasText: true }), 'graphic');
  assert.equal(resolveAdFormat({ requested: 'auto', imageHasText: false }), 'product');
  assert.equal(resolveAdFormat({ requested: 'product', imageHasText: true }), 'product');
  assert.equal(resolveAdFormat({ requested: 'graphic', imageHasText: false }), 'graphic');
});

test('overlay lines include offer promo', () => {
  const lines = overlayLinesForOffer({
    offer: { name: 'Плати по миру', promo_code: 'LG2026' },
    angle: { title: 'Поездки' },
    titles: ['Цифровая карта для поездок'],
    texts: ['Оформление онлайн'],
  });
  assert.ok(lines.length >= 2);
  assert.ok(lines.some((l) => /LG2026|Цифровая|Оформление/i.test(l)));
});

test('moscowDateISO is YYYY-MM-DD', () => {
  assert.match(moscowDateISO(new Date('2026-07-25T22:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
  // 22:00 UTC = 01:00 next day Moscow → should be 2026-07-26
  assert.equal(moscowDateISO(new Date('2026-07-25T22:00:00.000Z')), '2026-07-26');
});

test('buildCreativePrompt differs for graphic vs product', () => {
  const product = buildCreativePrompt({
    angle: { id: 'travel', title: 'Поездки' },
    offer: { name: 'PPM' },
    format: 'product',
  });
  const graphic = buildCreativePrompt({
    angle: { id: 'travel', title: 'Поездки' },
    offer: { name: 'PPM' },
    format: 'graphic',
    overlayLines: ['Цифровая карта', 'Промокод LG2026'],
  });
  assert.match(product, /ZERO text|PRODUCT|scroll/i);
  assert.match(graphic, /GRAPHIC AD|Exact text lines|Промокод LG2026/i);
  assert.match(product, /suitcase|passport|travel|departure/i);
  assert.notEqual(product, graphic);
});
