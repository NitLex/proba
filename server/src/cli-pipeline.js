#!/usr/bin/env node
/**
 * CLI: npm run pipeline -- --name "Оффер" --url "..." --payout 896 --geo RU
 */
import { loadEnv } from './lib/env.js';
import { runPipeline } from './pipeline/runner.js';

loadEnv();

function parseArgs(argv) {
  const out = { dry_run: false, apply_direct: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dry_run = true;
    else if (a === '--apply-direct') out.apply_direct = true;
    else if (a.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[a.slice(2).replace(/-/g, '_')] = argv[++i];
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const {
  dry_run: dryRun,
  apply_direct: applyDirect,
  title,
  ...offer
} = args;

if (offer.payout) offer.payout = Number(offer.payout);
if (offer.epc) offer.epc = Number(offer.epc);
if (offer.daily_budget) offer.daily_budget = Number(offer.daily_budget);

if (!offer.name && !offer.url) {
  console.error(`Usage:
  npm run pipeline -- --name "Плати по миру" --url "https://go.leadgid.ru/..." --payout 896 --geo RU --vertical Fintech --source "Yandex Direct РСЯ"
  Options: --dry-run  --apply-direct  --epc 9.5  --daily-budget 5000  --promo-code LG2026
`);
  process.exit(1);
}

const run = await runPipeline(offer, { dryRun, applyDirect, title });
console.log(JSON.stringify(run, null, 2));
process.exit(run.status === 'done' ? 0 : 1);
