import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupSemantics, rejectReason, assignGroup } from '../../scripts/cleanup-wordstat.mjs';
import { isJunkPhrase, assignGroup as agentAssignGroup } from '../src/pipeline/agents/wordstat.js';
import { mergeNegatives } from '../src/lib/junkLexicon.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('cleanupSemantics drops map/SVO junk and keeps subscription/SBP intent', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'docs/wordstat-raw-live.json'), 'utf8'));
  const result = cleanupSemantics(raw);

  assert.equal(result.stats.raw_phrases, 80);
  assert.ok(result.stats.kept_travel >= 10);
  assert.ok(result.stats.kept_services >= 12);
  assert.ok(result.stats.kept_sbp >= 10);
  assert.ok(result.stats.rejected >= 50);

  const services = new Set(result.groups.services.keywords.map((k) => k.phrase));
  assert.ok(services.has('карта для подписок'));
  assert.ok(services.has('зарубежная карта для подписок'));
  assert.ok(services.has('виртуальная карта для подписок'));

  const sbp = new Set(result.groups.sbp.keywords.map((k) => k.phrase));
  assert.ok(sbp.has('выпуск карты онлайн'));
  assert.ok(sbp.has('выпустить виртуальную карту'));
  assert.ok(sbp.has('пополнение по СБП'));

  const travel = new Set(result.groups.travel.keywords.map((k) => k.phrase));
  assert.ok(travel.has('цифровая карта для поездок'));
  assert.ok(travel.has('виртуальная карта для путешествий'));

  const rejected = new Set(result.rejected.map((r) => r.phrase));
  assert.ok(rejected.has('карта осадков онлайн'));
  assert.ok(rejected.has('карта сво онлайн'));
  assert.ok(rejected.has('натальная карта онлайн'));
  assert.ok(rejected.has('карты онлайн'));
  assert.ok(rejected.has('яндекс карты онлайн'));
  assert.ok(rejected.has('пусть говорят все выпуски'));

  assert.ok(result.negatives.includes('осадки'));
  assert.ok(result.negatives.includes('займ'));
  assert.ok(!result.negatives.includes('подписки'));
  assert.ok(!result.negatives.includes('сбп'));
  assert.equal(result.autotargeting, 'suspended_on_start');
  assert.equal(result.offer, 'Finandos ES RO PL CZ CPL');
});

test('heuristic fills Travel when live has none', () => {
  const result = cleanupSemantics({
    keywords: [{ phrase: 'карта для подписок', shows: 100, source: 'wordstat_live' }],
  });
  assert.ok(result.groups.travel.keywords.some((k) => /поезд|путешеств|границ/i.test(k.phrase)));
  assert.ok(result.groups.sbp.keywords.some((k) => /СБП|сбп|минут|промокод/i.test(k.phrase)));
});

test('rejectReason and assignGroup helpers', () => {
  assert.ok(rejectReason('карта осадков онлайн'));
  assert.equal(assignGroup('зарубежная карта для подписок'), 'services');
  assert.equal(assignGroup('пополнение по СБП'), 'sbp');
  assert.equal(assignGroup('оплата за границей картой'), 'travel');
});

test('wordstat agent junk filter and grouping', () => {
  assert.equal(isJunkPhrase('карта осадков онлайн'), true);
  assert.equal(isJunkPhrase('карты онлайн'), true);
  assert.equal(isJunkPhrase('виртуальная карта для подписок'), false);

  const angles = [
    { id: 'travel', hooks: ['цифровая карта для поездок'] },
    { id: 'services', hooks: ['карта для подписок'] },
    { id: 'sbp', hooks: ['пополнение по СБП'] },
  ];
  assert.equal(agentAssignGroup('зарубежная карта для подписок', angles), 'services');
  assert.equal(agentAssignGroup('выпуск карты онлайн', angles), 'sbp');
  assert.equal(agentAssignGroup('оплата за границей картой', angles), 'travel');
});

test('junk lexicon keeps core vertical terms un-minused', () => {
  const neg = mergeNegatives([], 'fintech_cards');
  assert.ok(neg.includes('осадки'));
  assert.ok(neg.includes('яндекс карты'));
  assert.ok(!neg.includes('зарубежная карта'));
  assert.ok(!neg.includes('виртуальная карта'));
  assert.ok(!neg.includes('подписки'));
});
