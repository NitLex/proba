import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDb = path.join(os.tmpdir(), `arbtrack-traffic-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const { initSchema, db } = await import('../src/db.js');
initSchema();
const { hashPassword } = await import('../src/lib/auth.js');
const owner = db
  .prepare(
    `INSERT INTO users (username, password_hash, email, telegram, is_admin)
     VALUES ('towner', ?, 't@test.local', '@t', 1)`,
  )
  .run(hashPassword('secret1'));
const OWNER_ID = Number(owner.lastInsertRowid);

const {
  linkDirectToTrackerCampaign,
  findTrackerByDirectCampaignId,
  resolveTrackerForDirect,
} = await import('../src/lib/directTrackerLink.js');
const {
  scorePlacements,
  scoreWeakAds,
  planEconomicsActions,
  buildTrafficMiniReport,
} = await import('../src/pipeline/agents/trafficAnalyst.js');

function insertCampaign(name, key) {
  const info = db
    .prepare(
      `INSERT INTO campaigns (user_id, name, key, cost_model, cost_value, status, currency)
       VALUES (?, ?, ?, 'cpc', 5, 'active', 'RUB')`,
    )
    .run(OWNER_ID, name, key);
  return Number(info.lastInsertRowid);
}

test('linkDirectToTrackerCampaign persists direct_campaign_id', () => {
  const id = insertCampaign('PPM Link', `ppm_${Date.now()}`);
  const res = linkDirectToTrackerCampaign({
    trackerCampaignId: id,
    directCampaignId: '713057647',
  });
  assert.equal(res.ok, true);
  const row = findTrackerByDirectCampaignId('713057647', OWNER_ID);
  assert.ok(row);
  assert.equal(row.id, id);
  assert.match(row.notes || '', /713057647/);
});

test('resolveTrackerForDirect prefers column then heals from context', () => {
  const id = insertCampaign('Heal Camp', `heal_${Date.now()}`);
  const resolved = resolveTrackerForDirect({
    directCampaignId: '999001',
    directName: 'Heal Camp Direct',
    userId: OWNER_ID,
    context: {
      tracker: { campaign: { id } },
      direct: { campaign_id: '999001' },
    },
  });
  assert.equal(resolved.match, 'pipeline_context');
  assert.equal(resolved.campaign.id, id);
  assert.equal(findTrackerByDirectCampaignId('999001', OWNER_ID)?.id, id);
});

test('scoreWeakAds flags zero-conversion spenders', () => {
  const actions = scoreWeakAds(
    [
      {
        campaign_id: '1',
        ad_id: '11',
        ad_group_id: 'g1',
        clicks: 20,
        cost: 50,
        conversions: 0,
        avg_cpc: 2.5,
      },
      {
        campaign_id: '1',
        ad_id: '12',
        clicks: 3,
        cost: 5,
        conversions: 0,
      },
      {
        campaign_id: '1',
        ad_id: '13',
        clicks: 40,
        cost: 100,
        conversions: 2,
      },
    ],
    { minClicks: 12, maxCostNoConv: 40 },
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].ad_id, '11');
  assert.equal(actions[0].auto_apply, true);
});

test('planEconomicsActions suggests BidCeiling and spend stop', () => {
  const eco = planEconomicsActions(
    { id: '713', moderated: true, serving: true },
    {
      clicks: 50,
      cost: 500,
      conversions: 0,
      cpc: 10,
      epc: 0,
      roi: -100,
    },
    { drain_cost_rub: 400, drain_clicks: 40 },
  );
  assert.ok(eco.spendStop);
  assert.equal(eco.spendStop.campaign_id, '713');

  const eco2 = planEconomicsActions(
    { id: '714', moderated: true, serving: true },
    {
      clicks: 30,
      cost: 200,
      conversions: 2,
      cpc: 12,
      epc: 5,
      roi: -50,
    },
  );
  assert.ok(eco2.bidCeiling);
  assert.ok(eco2.bidCeiling.suggested_rub < 12);
  assert.equal(eco2.spendStop, null);
});

test('scorePlacements still excludes junk patterns', () => {
  const actions = scorePlacements(
    [
      {
        campaign_id: '1',
        placement: 'kids-games.example',
        clicks: 8,
        cost: 40,
        conversions: 0,
        avg_cpc: 5,
      },
    ],
    { minClicks: 5, maxCostNoConv: 30 },
  );
  assert.ok(actions.length >= 1);
  assert.equal(actions[0].auto_apply, true);
});

test('buildTrafficMiniReport includes ads/bid fields', () => {
  const mini = buildTrafficMiniReport({
    period: { from: '2026-07-01', to: '2026-07-07', days: 6 },
    placement_report: { ok: true, rows: 10 },
    ad_report: { ok: true, rows: 4 },
    actions: {
      exclude_placements: [{ placement: 'a.com', clicks: 5, cost: 20, conversions: 0 }],
      pause_ads: [{ ad_id: '99', campaign_id: '1', clicks: 15, cost: 45, reasons: ['x'] }],
      bid_ceilings: [{ campaign_id: '1', suggested_rub: 4 }],
      spend_stops: [],
    },
    apply: {
      dry_run: false,
      placements: [{ campaign_id: '1', ok: true, added: 3, total: 80 }],
      ads: { ok: true, paused: 1 },
      bid_modifiers: [{ ok: true, campaign_id: '1' }],
      bid_ceilings: [{ ok: true, campaign_id: '1', new_rub: 4 }],
      spend_stops: [],
    },
    campaigns: [
      {
        direct: { id: '1' },
        alerts: [{ text: 'alert', level: 'critical' }],
        advice: [{ level: 'warn', text: 'CPC > EPC' }],
      },
    ],
    tracker_summary: { total_clicks: 10 },
  });
  assert.equal(mini.outcome, 'applied');
  assert.equal(mini.sites_added, 3);
  assert.equal(mini.ads_paused, 1);
  assert.equal(mini.bid_ceilings_updated, 1);
  assert.ok(mini.alerts?.length);
  assert.ok(mini.top_paused_ads?.length);
});

after(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
});
