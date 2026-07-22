import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMacros, parseCost, detectBot, makeClickId } from '../src/lib/tracking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDb = path.join(__dirname, 'test-arbtrack.db');

describe('tracking helpers', () => {
  it('applies macros', () => {
    const url = applyMacros(
      'https://x.test/?c={clickid}&camp={campaign_id}&t={token1}&cost={cost}',
      { clickid: 'abc', campaign_id: 12, token1: 'lookalike', cost: 0.5 }
    );
    assert.equal(url, 'https://x.test/?c=abc&camp=12&t=lookalike&cost=0.5');
  });

  it('parses cost', () => {
    assert.equal(parseCost('1,25'), 1.25);
    assert.equal(parseCost(undefined, 0.3), 0.3);
  });

  it('detects bots', () => {
    assert.equal(detectBot('Googlebot/2.1'), 1);
    assert.equal(detectBot('Mozilla/5.0 Chrome'), 0);
  });

  it('generates click ids', () => {
    const a = makeClickId();
    const b = makeClickId();
    assert.equal(a.length, 16);
    assert.notEqual(a, b);
  });
});

describe('api integration', () => {
  let base;
  let server;
  let token;

  before(async () => {
    process.env.DB_PATH = testDb;
    process.env.JWT_SECRET = 'test-secret';
    for (const f of [testDb, `${testDb}-wal`, `${testDb}-shm`]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    const { db } = await import('../src/db.js');
    const { hashPassword } = await import('../src/lib/auth.js');
    const user = db
      .prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`)
      .run('tester', hashPassword('secret1'));
    const userId = Number(user.lastInsertRowid);

    const src = db
      .prepare(
        `INSERT INTO traffic_sources (user_id, name, cost_param, token1) VALUES (?, 'Test', 'cost', 'sub1')`
      )
      .run(userId);
    const offer = db
      .prepare(
        `INSERT INTO offers (user_id, name, url, payout) VALUES (?, 'O1', 'https://offer.test/?id={clickid}', 10)`
      )
      .run(userId);
    db.prepare(
      `INSERT INTO campaigns (user_id, name, key, traffic_source_id, offer_id, cost_model, cost_value, status)
       VALUES (?, 'C1', 'testkey1', ?, ?, 'cpc', 0.1, 'active')`
    ).run(userId, Number(src.lastInsertRowid), Number(offer.lastInsertRowid));

    const { createApp } = await import('../src/app.js');
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;

    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tester', password: 'secret1' }),
    });
    const body = await login.json();
    token = body.token;
  });

  after(() => {
    if (server) server.close();
  });

  it('health ok', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
  });

  it('rejects protected api without token', async () => {
    const res = await fetch(`${base}/api/stats/overview`);
    assert.equal(res.status, 401);
  });

  it('registers a new user', async () => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'newbie',
        password: 'pass123',
        email: 'newbie@example.com',
        telegram: '@newbie_user',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.user.username, 'newbie');
    assert.equal(body.user.email, 'newbie@example.com');
    assert.equal(body.user.telegram, '@newbie_user');
  });

  it('updates profile', async () => {
    const res = await fetch(`${base}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: 'tester@example.com',
        telegram: 'tester_tg',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.email, 'tester@example.com');
    assert.equal(body.user.telegram, '@tester_tg');
  });

  it('tracks click and accepts postback', async () => {
    const res = await fetch(`${base}/click/testkey1?cost=0.4&sub1=tok`, {
      redirect: 'manual',
    });
    assert.equal(res.status, 302);
    const loc = res.headers.get('location');
    assert.ok(loc.includes('offer.test'));
    const clickid = new URL(loc).searchParams.get('id');
    assert.ok(clickid);

    const pb = await fetch(
      `${base}/postback?clickid=${clickid}&payout=10&status=sale&txid=t1`
    );
    const body = await pb.json();
    assert.equal(body.ok, true);
    assert.equal(body.payout, 10);

    const overview = await (
      await fetch(`${base}/api/stats/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    assert.ok(overview.clicks >= 1);
    assert.ok(overview.revenue >= 10);
  });
});
