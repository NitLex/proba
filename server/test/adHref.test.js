import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brandifyClickUrl,
  buildAdLinkFields,
  displayUrlPathForAngle,
  normalizeHost,
  sanitizeDisplayUrlPath,
} from '../src/lib/adHref.js';

test('normalizeHost strips scheme and path', () => {
  assert.equal(normalizeHost('https://PayServices.ru/foo'), 'payservices.ru');
  assert.equal(normalizeHost('not a domain'), '');
});

test('brandifyClickUrl rewrites host only', () => {
  const out = brandifyClickUrl('https://trekerarbitrag.ru/click/abc?x=1', 'payservices.ru');
  assert.equal(out, 'https://payservices.ru/click/abc?x=1');
});

test('sanitizeDisplayUrlPath enforces Direct rules', () => {
  assert.equal(sanitizeDisplayUrlPath('Karta/Poezdki'), 'karta/poezdki');
  assert.equal(sanitizeDisplayUrlPath('a'.repeat(30)).length, 20);
  assert.ok(!sanitizeDisplayUrlPath('bad_path').includes('_'));
});

test('buildAdLinkFields uses angle path and offer domain', () => {
  const link = buildAdLinkFields({
    clickUrl: 'https://trekerarbitrag.ru/click/v9HD5YGe',
    offer: { display_domain: 'payservices.ru' },
    angle: { id: 'travel' },
  });
  assert.equal(link.href, 'https://payservices.ru/click/v9HD5YGe');
  assert.equal(link.display_url_path, 'karta/poezdki');
  assert.equal(link.display_preview, 'payservices.ru/karta/poezdki');
  assert.equal(displayUrlPathForAngle({ id: 'services' }), 'karta/servisy');
});
