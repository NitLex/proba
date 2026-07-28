import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeoRulesText, buildDirectRegionIds, matchRuRegionId } from '../src/lib/yandexRegions.js';
import { buildOfferFacts } from '../src/lib/offerFacts.js';

const NOVA_GEO = `ГЕО:

РФ
Кроме городов и областей: Дагестан, Ингушетия, Кабардин, Калмык, Карачаев, Осети, Тыва, Тува, Чеченская, Крым, Севастополь, Бурятия, Белгородская, Якутск`;

test('matchRuRegionId fuzzy stems', () => {
  assert.equal(matchRuRegionId('Дагестан'), 11010);
  assert.equal(matchRuRegionId('Кабардин'), 11013);
  assert.equal(matchRuRegionId('Крым'), 977);
  assert.equal(matchRuRegionId('Севастополь'), 959);
  assert.equal(matchRuRegionId('Якутск'), 74);
});

test('parseGeoRulesText Nova Credit exclusions', () => {
  const r = parseGeoRulesText(NOVA_GEO);
  assert.deepEqual(r.geos, ['RU']);
  assert.ok(r.include_ids.includes(225));
  assert.ok(r.exclude_ids.includes(11010)); // Дагестан
  assert.ok(r.exclude_ids.includes(977)); // Крым
  assert.ok(r.exclude_ids.includes(959)); // Севастополь
  assert.ok(r.exclude_ids.includes(10645)); // Белгородская
  assert.ok(r.region_ids.includes(225));
  assert.ok(r.region_ids.includes(-977));
  assert.ok(r.region_ids.every((id) => id === 225 || id < 0));
});

test('buildOfferFacts applies geo_rules exclusions', () => {
  const facts = buildOfferFacts({
    name: 'Nova Credit - Выдача',
    currency: 'RUB',
    products: [{ name: 'МФО' }],
    geo: 'РФ',
    geo_rules: NOVA_GEO,
  });
  assert.equal(facts.geo, 'RU');
  assert.ok(facts.region_ids.includes(225));
  assert.ok(facts.region_ids.includes(-977));
  assert.ok(facts.exclude_region_ids.includes(11024)); // Чечня
  assert.ok(facts.evidence.some((e) => /leadgid_note/i.test(e)));
});

test('buildDirectRegionIds exclusions imply RU when only кроме-list given', () => {
  const r = buildDirectRegionIds({
    geos: [],
    geoRulesText: 'Кроме городов и областей: Крым, Севастополь',
  });
  assert.deepEqual(r.geos, ['RU']);
  assert.ok(r.region_ids.includes(225));
  assert.ok(r.region_ids.includes(-977));
});
