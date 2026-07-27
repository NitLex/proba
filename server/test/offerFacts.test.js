import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGeosFromText,
  extractBrand,
  extractPayoutModel,
  buildOfferFacts,
  seedsFromOfferFacts,
} from '../src/lib/offerFacts.js';
import { detectVerticalKey } from '../src/pipeline/knowledge/global-market.js';

test('extractGeosFromText: Finandos ES RO PL CZ CPL', () => {
  assert.deepEqual(extractGeosFromText('Finandos ES RO PL CZ CPL').sort(), [
    'CZ',
    'ES',
    'PL',
    'RO',
  ]);
});

test('extractBrand drops geo and CPL tokens', () => {
  assert.equal(extractBrand('Finandos ES RO PL CZ CPL'), 'Finandos');
});

test('extractPayoutModel from name and goals', () => {
  assert.equal(extractPayoutModel({ name: 'Finandos ES RO PL CZ CPL' }), 'CPL');
  assert.equal(
    extractPayoutModel({
      name: 'X',
      product_brief: { goals: [{ name: 'CPL completed' }] },
    }),
    'CPL',
  );
});

test('detectVerticalKey: credit services CPL is loans, not cards', () => {
  const key = detectVerticalKey({
    name: 'Finandos ES RO PL CZ CPL',
    products: [{ name: 'Кредитные сервисы (платные)' }],
    product_brief: {
      goals: [{ name: 'CPL completed', payout: 6, currency: 'EUR' }],
      products: [{ name: 'Кредитные сервисы (платные)' }],
    },
  });
  assert.equal(key, 'fintech_loans');
});

test('detectVerticalKey: no longer defaults unknown finance to cards', () => {
  const key = detectVerticalKey({
    name: 'SomeBrand XYZ',
    vertical: 'Fintech',
  });
  assert.equal(key, 'unknown');
});

test('buildOfferFacts for Finandos-class offer', () => {
  const facts = buildOfferFacts({
    name: 'Finandos ES RO PL CZ CPL',
    currency: 'EUR',
    payout: 6,
    epc: 0.11,
    products: [{ name: 'Кредитные сервисы (платные)' }],
    product_brief: { goals: [{ name: 'CPL completed' }] },
  });
  assert.equal(facts.brand, 'Finandos');
  assert.deepEqual(facts.geos.sort(), ['CZ', 'ES', 'PL', 'RO']);
  assert.equal(facts.payout_model, 'CPL');
  assert.equal(facts.ru_traffic_fit, 'mismatch_rsya_ru');
  assert.ok(facts.region_ids.length >= 1);
  const seeds = seedsFromOfferFacts({ name: 'Finandos ES RO PL CZ CPL' }, facts);
  assert.ok(seeds.some((s) => /Finandos/i.test(s)));
  assert.equal(
    seeds.some((s) => /зарубежн|сбп|виртуальн.*карт/i.test(s)),
    false,
  );
});

test('buildOfferFacts: FinMi non-residents is RU traffic geo (audience ≠ geo)', () => {
  const facts = buildOfferFacts({
    name: 'FinMi - Выдача займа нерезидентам',
    currency: 'RUB',
    payout: 1125,
    products: [{ name: 'МФО' }],
    geo: null,
  });
  assert.equal(facts.geo, 'RU');
  assert.deepEqual(facts.geos, ['RU']);
  assert.deepEqual(facts.region_ids, [225]);
  assert.equal(facts.non_resident_audience, true);
  assert.equal(facts.geo_required, false);
  assert.equal(facts.ru_traffic_fit, 'fit');
  const seeds = seedsFromOfferFacts({ name: facts.brand || 'FinMi' }, facts);
  assert.ok(seeds.some((s) => s === 'займ онлайн' || s === 'кредит онлайн'));
});
