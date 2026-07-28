import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMacros } from '../src/lib/tracking.js';
import { fireSourcePostback } from '../src/lib/sourcePostback.js';
import { buildAlertMessages } from '../src/lib/opsAlerts.js';
import { db } from '../src/db.js';

test('applyMacros encodes status and txid', () => {
  const url = applyMacros(
    'https://x/?c={clickid}&s={status}&p={payout}&t={txid}',
    { clickid: 'abc', status: 'sale', payout: 12.5, txid: 'tx1' },
  );
  assert.equal(url, 'https://x/?c=abc&s=sale&p=12.5&t=tx1');
});

test('buildAlertMessages zero conv and roi', () => {
  const msgs = buildAlertMessages(
    { clicks: 80, conversions: 0, cost: 100, revenue: 0, profit: -100, roi: -100 },
    [{ id: 1, name: 'Camp A', clicks: 45, conversions: 0 }],
    {
      minClicks: 50,
      roiThreshold: -30,
      campaignMinClicks: 40,
      windowHours: 24,
      cooldownHours: 6,
    },
  );
  assert.equal(msgs.length, 3);
  assert.match(msgs[0].text, /конверсий 0/);
  assert.match(msgs[1].text, /ROI/);
  assert.match(msgs[2].text, /Camp A/);
});

test('fireSourcePostback expands macros and calls fetch', async () => {
  const { hashPassword } = await import('../src/lib/auth.js');
  let uid = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`).get()?.id;
  if (!uid) {
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, email, telegram, is_admin)
         VALUES ('alert_tester', ?, 'alert@test.local', '@alert_tester', 0)`,
      )
      .run(hashPassword('test1234'));
    uid = Number(info.lastInsertRowid);
  }

  const src = db
    .prepare(
      `INSERT INTO traffic_sources (user_id, name, postback_url, cost_param, currency)
       VALUES (?, 'src-pb', 'https://example.test/pb?cid={clickid}&st={status}&pay={payout}', 'cost', 'RUB')`,
    )
    .run(uid);
  const sourceId = Number(src.lastInsertRowid);

  const camp = db
    .prepare(
      `INSERT INTO campaigns (user_id, name, key, status, traffic_source_id, currency)
       VALUES (?, 'c-pb', 'pbkey01', 'active', ?, 'RUB')`,
    )
    .run(uid, sourceId);
  const campaignId = Number(camp.lastInsertRowid);

  const click = {
    clickid: 'ClickPB01',
    campaign_id: campaignId,
    offer_id: null,
    traffic_source_id: sourceId,
    cost: 1,
    country: 'RU',
    city: '',
    device: 'mobile',
    os: 'Android',
    browser: 'Chrome',
    ip: '1.2.3.4',
    user_agent: 'ua',
    referer: '',
    token1: 'a',
    token2: '',
    token3: '',
    token4: '',
    token5: '',
  };

  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200 };
  };
  try {
    const r = await fireSourcePostback({
      click,
      status: 'sale',
      payout: 50,
      currency: 'RUB',
      txid: 'tx',
    });
    assert.equal(r.ok, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /cid=ClickPB01/);
    assert.match(calls[0], /st=sale/);
    assert.match(calls[0], /pay=50/);
  } finally {
    globalThis.fetch = orig;
    db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(campaignId);
    db.prepare(`DELETE FROM traffic_sources WHERE id = ?`).run(sourceId);
  }
});
