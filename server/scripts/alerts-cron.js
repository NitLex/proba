#!/usr/bin/env node
/**
 * Manual / cron entry for ops Telegram alerts.
 *   node server/scripts/alerts-cron.js
 *   ALERTS_FORCE=1 node server/scripts/alerts-cron.js
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '../..'));

await import('../src/lib/env.js').then((m) => m.loadEnv());
await import('../src/db.js');
const { runOpsAlerts } = await import('../src/lib/opsAlerts.js');

const force = String(process.env.ALERTS_FORCE || '0') === '1';
const r = await runOpsAlerts({ force });
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok || r.skipped ? 0 : 1);
