import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDb = path.join(os.tmpdir(), `arbtrack-pipeline-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const { initSchema, db } = await import('../src/db.js');
initSchema();
await import('../src/pipeline/store.js');
const { runPipeline, AGENT_ROLES, DEFAULT_PIPELINE } = await import('../src/pipeline/runner.js');

test('roles and default graph exist', () => {
  assert.equal(Object.keys(AGENT_ROLES).length >= 5, true);
  assert.equal(DEFAULT_PIPELINE[0].agent, 'analyst');
  assert.ok(DEFAULT_PIPELINE.find((s) => s.agent === 'direct'));
});

test('pipeline dry-run completes all agents', async () => {
  // seed a similar bundle for analyst
  db.prepare(
    `INSERT INTO bundles (name, vertical, geo, source, funnel, bid_hint, heat, rating, creatives, risks, status)
     VALUES (?, 'Fintech', 'RU', 'Yandex Direct РСЯ', 'direct', 'CPC 5-7', 'hot', 5, 'travel banners', 'модерация', 'active')`,
  ).run('РСЯ fintech travel demo');

  const run = await runPipeline(
    {
      name: 'Тестовая карта',
      url: 'https://example.com/offer?clickid={clickid}',
      payout: 900,
      epc: 10,
      geo: 'RU',
      vertical: 'Fintech',
      source: 'Yandex Direct РСЯ',
      notes: 'путешествия и зарубежные сервисы',
      daily_budget: 4000,
    },
    { dryRun: true },
  );

  assert.equal(run.status, 'done');
  assert.equal(run.steps.length, 5);
  assert.ok(run.steps.every((s) => s.status === 'done'));
  assert.ok(run.context.playbook);
  assert.ok(run.context.semantics?.keywords?.length);
  assert.ok(run.context.creatives?.briefs?.length);
  assert.ok(run.context.direct?.plan);
  assert.ok(run.steps.find((s) => s.agent === 'analyst').output.cursor_prompt);
});

test('pipeline creates tracker entities when not dry-run', async () => {
  const run = await runPipeline(
    {
      name: 'Pipeline Live Offer',
      url: 'https://example.com/live?sub={clickid}',
      payout: 500,
      geo: 'RU',
      vertical: 'Fintech',
    },
    { dryRun: false },
  );
  assert.equal(run.status, 'done');
  assert.ok(run.context.tracker?.campaign?.key);
  const camp = db
    .prepare(`SELECT * FROM campaigns WHERE key = ?`)
    .get(run.context.tracker.campaign.key);
  assert.ok(camp);
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
