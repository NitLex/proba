import test from 'node:test';
import assert from 'node:assert/strict';
import { keywordsForAngle } from '../src/pipeline/agents/direct.js';

test('keywordsForAngle falls back when group empty', () => {
  const kws = keywordsForAngle(
    { id: 'services', title: 'Сервисы', hooks: ['карта для подписок'] },
    { groups: { travel: ['карта для поездок'] }, keywords: [] },
    {},
  );
  assert.ok(kws.length >= 1);
  assert.ok(kws.some((k) => /подписк|сервис/i.test(k)));
});

test('keywordsForAngle uses semantics.groups when present', () => {
  const kws = keywordsForAngle(
    { id: 'travel' },
    { groups: { travel: ['оплата за границей', 'карта для поездок'] } },
    {},
  );
  assert.deepEqual(kws, ['оплата за границей', 'карта для поездок']);
});
