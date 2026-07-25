import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupSemantics } from '../../scripts/cleanup-wordstat.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('cleanupSemantics drops map/SVO junk and keeps travel payment intent', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'docs/wordstat-raw-live.json'), 'utf8'));
  const result = cleanupSemantics(raw);

  assert.equal(result.stats.raw_phrases, 80);
  assert.ok(result.stats.kept_travel >= 15);
  assert.ok(result.stats.kept_services >= 10);
  assert.ok(result.stats.kept_sbp >= 8);
  assert.ok(result.stats.rejected >= 50);

  const travel = new Set(result.groups.travel.keywords.map((k) => k.phrase));
  assert.ok(travel.has('карта для поездок'));
  assert.ok(travel.has('карта для оплаты за границей'));
  assert.ok(travel.has('виртуальная карта для путешествий'));

  const rejected = new Set(result.rejected.map((r) => r.phrase));
  assert.ok(rejected.has('карта осадков онлайн'));
  assert.ok(rejected.has('карта сво онлайн'));
  assert.ok(rejected.has('натальная карта онлайн'));
  assert.ok(rejected.has('синяя карта для поездки в беларусь'));
  assert.ok(rejected.has('карты онлайн'));

  assert.ok(result.negatives.includes('осадки'));
  assert.ok(result.negatives.includes('займ'));
  assert.equal(result.autotargeting, 'suspended_on_start');
});

test('heuristic fills Services when live has none', () => {
  const result = cleanupSemantics({
    keywords: [{ phrase: 'карта для поездок', shows: 100, source: 'wordstat_live' }],
  });
  assert.ok(result.groups.services.keywords.some((k) => k.phrase === 'карта для подписок'));
  assert.ok(result.groups.sbp.keywords.some((k) => /СБП|сбп|минут|промокод/i.test(k.phrase)));
});
