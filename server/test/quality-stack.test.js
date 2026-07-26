import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDb = path.join(os.tmpdir(), `arbtrack-quality-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const { validateCreatives } = await import('../src/lib/creativeQa.js');
const { mergeNegatives, junkLexiconForVertical } = await import('../src/lib/junkLexicon.js');
const { scoreClickFraud } = await import('../src/lib/antifraud.js');
const { generatePreland, prelandFilePath, PRELAND_DIR } = await import('../src/lib/preland.js');
const { phaseForDay, scheduleAdvice, daysSince } = await import('../src/lib/optimizationSchedule.js');
const {
  validateOfferTrackingUrl,
  leadgidPostbackInstructions,
} = await import('../src/lib/leadgidPostback.js');
const { buildQualitySnapshot, buildTrafficMiniReport } = await import(
  '../src/pipeline/agents/trafficAnalyst.js'
);

test('creative QA requires overseas-card wording for cards', () => {
  const bad = validateCreatives(
    [{ angle_id: 'travel', titles: ['Карта онлайн'], texts: ['Оформление быстро'] }],
    { verticalKey: 'fintech_cards', requireImages: false },
  );
  assert.equal(bad.ok, false);

  const good = validateCreatives(
    [
      {
        angle_id: 'travel',
        titles: ['Зарубежная карта в поездки', 'Зарубежная карта онлайн'],
        texts: ['Выпуск зарубежной карты онлайн. СБП.'],
      },
    ],
    { verticalKey: 'fintech_cards', requireImages: false },
  );
  assert.equal(good.ok, true);
});

test('creative QA blocks card templates on loans', () => {
  const bad = validateCreatives(
    [
      {
        angle_id: 'speed',
        titles: ['Зарубежная карта'],
        texts: ['Выпуск зарубежной карты'],
      },
    ],
    { verticalKey: 'fintech_loans', requireImages: false },
  );
  assert.equal(bad.ok, false);
});

test('junk lexicon differs for loans vs cards', () => {
  const cards = mergeNegatives([], 'fintech_cards');
  const loans = mergeNegatives([], 'fintech_loans');
  assert.ok(cards.includes('займ'));
  assert.ok(loans.includes('зарубежная карта'));
  assert.ok(!loans.includes('займ') || junkLexiconForVertical('fintech_loans').note);
  assert.ok(cards.includes('для детей'));
});

test('antifraud scores empty UA and frequency', () => {
  const empty = scoreClickFraud({ ip: '8.8.8.8', userAgent: '', isBot: 0 });
  assert.ok(empty.score >= 40);
  const flood = scoreClickFraud({
    ip: '1.2.3.4',
    userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36',
    recentSameIp: 20,
  });
  assert.equal(flood.action === 'cheap' || flood.action === 'block', true);
  const review = scoreClickFraud({
    ip: '1.2.3.4',
    userAgent: 'YandexBot',
    isBot: 1,
    isAdReview: true,
  });
  assert.equal(review.action, 'allow');
});

test('preland generator writes html', () => {
  const out = generatePreland({
    offer: { name: 'ТестКарта' },
    angle: { id: 'travel', title: 'Поездки' },
    verticalKey: 'fintech_cards',
    runId: `test-${Date.now()}`,
    publicBase: 'https://example.test',
  });
  assert.equal(out.ok, true);
  assert.ok(fs.existsSync(out.file));
  assert.ok(prelandFilePath(out.slug));
  const html = fs.readFileSync(out.file, 'utf8');
  assert.match(html, /зарубежн/i);
  assert.match(html, /to-offer/);
  fs.unlinkSync(out.file);
});

test('schedule phases map days', () => {
  assert.equal(phaseForDay(0).id, 'day0');
  assert.equal(phaseForDay(2).id, 'day2_3');
  assert.equal(phaseForDay(6).id, 'day5_7');
  const a = scheduleAdvice({ createdAt: '2026-07-20', moderated: true, serving: true });
  assert.ok(typeof a.day === 'number');
  assert.ok(daysSince('2026-07-01') >= 0);
});

test('offer tracking URL validation', () => {
  assert.equal(
    validateOfferTrackingUrl('https://go.example/?aff_sub={clickid}').has_aff_sub,
    true,
  );
  assert.equal(validateOfferTrackingUrl('https://go.example/').ok, false);
  assert.ok(leadgidPostbackInstructions().url.includes('postback'));
});

test('quality snapshot and mini-report', () => {
  const quality = buildQualitySnapshot(
    [
      {
        tracker: {
          clicks: 100,
          cost: 500,
          revenue: 800,
          conversions: 4,
          rejected: 2,
          epc: 8,
          cpc: 5,
          cr: 4,
          roi: 60,
        },
      },
    ],
    [
      { placement: 'kids-games.ru', clicks: 20, cost: 100, conversions: 0 },
      { placement: 'news.ru', clicks: 80, cost: 400, conversions: 4 },
    ],
    [
      { ad_id: '1', clicks: 50, conversions: 2, impressions: 1000 },
      { ad_id: '2', clicks: 20, conversions: 0, impressions: 500 },
    ],
  );
  assert.equal(quality.cpc, 5);
  assert.equal(quality.epc, 8);
  assert.ok(quality.junk_share_pct != null);
  assert.equal(quality.ads_live, 2);

  const mini = buildTrafficMiniReport({
    quality,
    period: { from: '2026-07-01', to: '2026-07-07' },
    placement_report: { ok: true, rows: 2 },
    ad_report: { ok: true, rows: 2 },
    actions: { exclude_placements: [], pause_ads: [], bid_ceilings: [], spend_stops: [] },
    apply: { dry_run: true },
    campaigns: [],
    tracker_summary: {},
  });
  assert.ok(mini.quality);
  assert.equal(mini.quality.epc, 8);
});

after(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
});
