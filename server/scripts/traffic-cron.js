#!/usr/bin/env node
/**
 * Cron entry: run traffic analyst for campaigns in day 2+ schedule phase.
 * Example crontab (daily 10:00 MSK):
 *   0 7 * * * cd /var/www/arbtrack && node server/scripts/traffic-cron.js >> /var/log/arbtrack-traffic-cron.log 2>&1
 *
 * Env:
 *   TRAFFIC_CRON_APPLY=1  — apply Direct changes (default 0 = recommendations only)
 *   TRAFFIC_CRON_TOKEN    — optional Bearer if calling HTTP; this script uses in-process runner
 *   PIPELINE_OWNER_USER_ID / ARBTRACK_USERNAME — owner for tracker attribution
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '../..'));

await import('../src/lib/env.js');
const { initSchema, db } = await import('../src/db.js');
initSchema();

const { listModeratedDirectCampaigns } = await import('../src/pipeline/agents/trafficAnalyst.js');
const { findTrackerByDirectCampaignId } = await import('../src/lib/directTrackerLink.js');
const { daysSince } = await import('../src/lib/optimizationSchedule.js');
const { runTrafficOptimization } = await import('../src/pipeline/runner.js');

function resolveOwnerId() {
  if (process.env.PIPELINE_OWNER_USER_ID) return Number(process.env.PIPELINE_OWNER_USER_ID);
  const login = process.env.ARBTRACK_USERNAME || process.env.ARBTRACK_LOGIN || '';
  if (login) {
    const row = db.prepare(`SELECT id FROM users WHERE lower(username) = lower(?)`).get(login);
    if (row) return row.id;
  }
  return null;
}

const apply = String(process.env.TRAFFIC_CRON_APPLY || '0') === '1';
const listed = await listModeratedDirectCampaigns();
const due = (listed.campaigns || [])
  .filter((c) => c.moderated)
  .filter((c) => {
    const t = findTrackerByDirectCampaignId(c.id);
    const day = daysSince(t?.created_at);
    return (day ?? 3) >= 2;
  })
  .map((c) => c.id);

console.log(`[traffic-cron] ${new Date().toISOString()} due=${due.join(',') || 'none'} apply=${apply}`);

if (!due.length) {
  process.exit(0);
}

const run = await runTrafficOptimization({
  directCampaignIds: due,
  applyTraffic: apply,
  dryRun: false,
  ownerUserId: resolveOwnerId(),
  title: `Cron трафик: ${due.slice(0, 3).join(', ')}`,
});

console.log(`[traffic-cron] run #${run.id} status=${run.status} summary=${run.steps?.[0]?.output?.summary || run.error || ''}`);
process.exit(run.status === 'done' ? 0 : 1);
