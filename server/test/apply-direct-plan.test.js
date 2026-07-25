import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { buildCampaignBody } from '../src/apply-direct-plan.js';
import { directStartDate } from '../src/lib/directDate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planPath = path.join(root, 'direct/plans/rsya-ppm-product-travel-services-sbp.json');

test('PPM product plan JSON is valid TextAd draft', () => {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.network_only, true);
  assert.equal(plan.state, 'OFF');
  assert.equal(plan.moderation, 'DO_NOT_SUBMIT');
  assert.equal(plan.ad_format, 'product');
  assert.equal(plan.strategy.network, 'WB_MAXIMUM_CLICKS');
  assert.equal(plan.strategy.bid_ceiling_rub, 5);
  assert.equal(plan.settings.neuro_ads, 'OFF');
  assert.ok(plan.href.includes('/click/DBSKE5N0'));
  assert.equal(plan.ad_groups.length, 3);
  for (const g of plan.ad_groups) {
    assert.equal(g.direct_ad_type, 'TextAd');
    assert.ok(g.keywords.length >= 1, `${g.name} needs keywords`);
    assert.ok(fs.existsSync(path.join(root, g.image)), g.image);
    for (const ad of g.ads) {
      assert.ok(ad.title.length <= 56, ad.title);
      assert.ok((ad.title2 || '').length <= 30, ad.title2 || '');
      assert.ok(ad.text.length <= 81, ad.text);
      assert.ok(ad.href.includes('DBSKE5N0'));
    }
    for (const s of g.sitelinks) {
      assert.ok(s.title.length <= 30, s.title);
      assert.ok((s.description || '').length <= 60, s.description);
      assert.ok(!/если актуально/i.test(s.description || ''));
    }
  }
});

test('buildCampaignBody StartDate is Moscow calendar', () => {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const utcEvening = new Date('2026-07-24T22:30:00.000Z');
  const body = buildCampaignBody(plan, { startDate: directStartDate(utcEvening) });
  assert.equal(body.StartDate, '2026-07-25');
  assert.equal(body.TimeZone, 'Europe/Moscow');
  assert.equal(body.TextCampaign.BiddingStrategy.Search.BiddingStrategyType, 'SERVING_OFF');
  assert.equal(body.TextCampaign.BiddingStrategy.Network.BiddingStrategyType, 'WB_MAXIMUM_CLICKS');
});

test('apply:direct --dry-run exits 0 without token and skips moderation', () => {
  const r = spawnSync(process.execPath, ['src/apply-direct-plan.js', '--dry-run', planPath], {
    cwd: path.join(root, 'server'),
    encoding: 'utf8',
    env: { ...process.env, YANDEX_DIRECT_TOKEN: '', YANDEX_DIRECT_LOGIN: '' },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /dryRun: true/);
  assert.match(r.stdout, /StartDate \(MSK\):/);
  const latest = path.join(root, 'direct/apply-results/latest.json');
  assert.ok(fs.existsSync(latest));
  const result = JSON.parse(fs.readFileSync(latest, 'utf8'));
  assert.equal(result.dry_run, true);
  assert.equal(result.draft_only, true);
  assert.equal(result.moderation_submitted, false);
  assert.equal(result.neuro_ads, 'OFF');
  assert.ok(result.steps.moderation?.skipped);
  assert.equal(result.steps.campaign.preview.StartDate, result.start_date);
  assert.match(result.start_date, /^\d{4}-\d{2}-\d{2}$/);
});
