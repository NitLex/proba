import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDb = path.join(os.tmpdir(), `arbtrack-pipeline-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;
process.env.PIPELINE_TRACKER_MODE = 'local';

const { initSchema, db } = await import('../src/db.js');
initSchema();
const { hashPassword } = await import('../src/lib/auth.js');
const owner = db
  .prepare(
    `INSERT INTO users (username, password_hash, email, telegram, is_admin)
     VALUES ('owner', ?, 'owner@test.local', '@owner_user', 1)`,
  )
  .run(hashPassword('secret1'));
const OWNER_ID = Number(owner.lastInsertRowid);
await import('../src/pipeline/store.js');
const {
  runPipeline,
  runTrafficOptimization,
  AGENT_ROLES,
  DEFAULT_PIPELINE,
  OPTIMIZATION_PIPELINE,
} = await import('../src/pipeline/runner.js');

test('roles and default graph exist', () => {
  assert.equal(Object.keys(AGENT_ROLES).length >= 7, true);
  assert.equal(DEFAULT_PIPELINE[0].agent, 'analyst');
  assert.ok(DEFAULT_PIPELINE.find((s) => s.agent === 'direct'));
  assert.ok(DEFAULT_PIPELINE.find((s) => s.agent === 'qa'));
  assert.ok(AGENT_ROLES.traffic_analyst);
  assert.equal(OPTIMIZATION_PIPELINE[0].agent, 'traffic_analyst');
  assert.ok(
    !DEFAULT_PIPELINE.find((s) => s.agent === 'traffic_analyst'),
    'traffic analyst is post-launch, not in launch DAG',
  );
});

test('pipeline dry-run completes all agents', async () => {
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
    { dryRun: true, applyDirect: false },
  );

  assert.equal(run.status, 'done');
  assert.equal(run.steps.length, 6);
  assert.ok(run.steps.every((s) => s.status === 'done'));
  assert.ok(run.context.playbook);
  assert.equal(run.context.playbook.analysis_scope, 'global_market');
  assert.ok(run.context.playbook.market?.competitor_sources?.length);
  assert.ok(run.context.semantics?.keywords?.length);
  assert.ok(run.context.creatives?.briefs?.length);
  assert.ok(run.context.direct?.plan);
  assert.ok(run.context.qa?.skipped);
  assert.ok(run.steps.find((s) => s.agent === 'analyst').output.cursor_prompt);
});

test('pipeline creates tracker entities when not dry-run', async () => {
  process.env.PIPELINE_SKIP_QA = '1';
  const run = await runPipeline(
    {
      name: 'Pipeline Live Offer',
      url: 'https://example.com/live?sub={clickid}',
      payout: 500,
      geo: 'RU',
      vertical: 'Fintech',
      currency: 'RUB',
    },
    { dryRun: false, applyDirect: false, ownerUserId: OWNER_ID },
  );
  assert.equal(run.status, 'done', run.error || '');
  assert.ok(run.context.tracker?.campaign?.key);
  const camp = db
    .prepare(`SELECT * FROM campaigns WHERE key = ?`)
    .get(run.context.tracker.campaign.key);
  assert.ok(camp);
  assert.equal(camp.user_id, OWNER_ID);
  assert.equal(camp.currency, 'RUB');
  delete process.env.PIPELINE_SKIP_QA;
});

test('traffic optimization run completes without Direct token', async () => {
  const prevToken = process.env.YANDEX_DIRECT_TOKEN;
  const prevLogin = process.env.YANDEX_DIRECT_LOGIN;
  delete process.env.YANDEX_DIRECT_TOKEN;
  delete process.env.YANDEX_DIRECT_LOGIN;

  const run = await runTrafficOptimization({
    directCampaignIds: ['713057647'],
    dryRun: true,
    applyTraffic: false,
    ownerUserId: OWNER_ID,
  });

  assert.equal(run.status, 'done', run.error || '');
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].agent, 'traffic_analyst');
  assert.equal(run.steps[0].status, 'done');
  assert.ok(run.context.traffic_analysis);
  assert.ok(run.context.kind === 'traffic_optimization');
  assert.ok(run.steps[0].output?.summary);

  if (prevToken) process.env.YANDEX_DIRECT_TOKEN = prevToken;
  else delete process.env.YANDEX_DIRECT_TOKEN;
  if (prevLogin) process.env.YANDEX_DIRECT_LOGIN = prevLogin;
  else delete process.env.YANDEX_DIRECT_LOGIN;
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
