#!/usr/bin/env node
/**
 * Link Yandex Metrika counter (+ optional goals) to a Direct TEXT campaign.
 *
 * Usage:
 *   node scripts/link-direct-metrika.mjs --campaign 713057647 --counter 12345678
 *   node scripts/link-direct-metrika.mjs --campaign 713057647 --counter 12345678 --soft 111 --hard 222
 *   node scripts/link-direct-metrika.mjs --campaign 713057647 --counter 12345678 --href-host finexpert24.online
 *
 * Needs YANDEX_DIRECT_TOKEN + YANDEX_DIRECT_LOGIN in env / SECRETS.env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadSecrets() {
  for (const p of [path.join(root, 'SECRETS.env'), path.join(root, '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

loadSecrets();

const campaignId = Number(arg('campaign') || process.env.DIRECT_CAMPAIGN_ID);
const counterId = Number(arg('counter') || process.env.YANDEX_METRIKA_COUNTER_ID);
const softGoalId = Number(arg('soft') || process.env.YANDEX_METRIKA_SOFT_GOAL_ID || 0);
const hardGoalId = Number(arg('hard') || process.env.YANDEX_METRIKA_HARD_GOAL_ID || 0);
const hrefHost = arg('href-host', ''); // e.g. finexpert24.online — rewrite ad Hrefs
const token = process.env.YANDEX_DIRECT_TOKEN;
const login = process.env.YANDEX_DIRECT_LOGIN;

if (!token || !login) {
  console.error('Need YANDEX_DIRECT_TOKEN + YANDEX_DIRECT_LOGIN');
  process.exit(1);
}
if (!Number.isFinite(campaignId) || campaignId <= 0) {
  console.error('Need --campaign <id>');
  process.exit(1);
}
if (!Number.isFinite(counterId) || counterId <= 0) {
  console.error('Need --counter <metrika_counter_id>');
  process.exit(1);
}

async function direct(service, body) {
  const res = await fetch(`https://api.direct.yandex.com/json/v5/${service}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Login': login,
      'Accept-Language': 'ru',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) {
    const err = new Error(JSON.stringify(json.error));
    err.raw = json;
    throw err;
  }
  return json;
}

function priorityGoals() {
  const items = [];
  if (Number.isFinite(softGoalId) && softGoalId > 0) {
    items.push({ GoalId: softGoalId, Value: 100_000_000, IsMetrikaSourceOfValue: 'NO' });
  }
  if (Number.isFinite(hardGoalId) && hardGoalId > 0) {
    items.push({ GoalId: hardGoalId, Value: 500_000_000, IsMetrikaSourceOfValue: 'NO' });
  }
  return items.length ? { Items: items } : undefined;
}

async function patchCampaign() {
  const textCampaign = {
    CounterIds: { Items: [counterId] },
    Settings: [{ Option: 'ADD_METRICA_TAG', Value: 'YES' }],
  };
  const goals = priorityGoals();
  if (goals) textCampaign.PriorityGoals = goals;

  const upd = await direct('campaigns', {
    method: 'update',
    params: {
      Campaigns: [
        {
          Id: campaignId,
          TextCampaign: textCampaign,
        },
      ],
    },
  });
  console.log('campaigns.update', JSON.stringify(upd?.result?.UpdateResults?.[0] || upd, null, 2));
}

async function rewriteAdHrefs() {
  if (!hrefHost) return;
  const ads = await direct('ads', {
    method: 'get',
    params: {
      SelectionCriteria: { CampaignIds: [campaignId] },
      FieldNames: ['Id', 'Type'],
      TextAdFieldNames: ['Href'],
    },
  });
  const list = ads?.result?.Ads || [];
  const updates = [];
  for (const ad of list) {
    const href = ad.TextAd?.Href;
    if (!href) continue;
    let u;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.hostname === hrefHost) continue;
    // Keep path/query ( /click/KEY?... ), swap host
    u.protocol = 'https:';
    u.hostname = hrefHost;
    updates.push({ Id: ad.Id, TextAd: { Href: u.toString() } });
  }
  if (!updates.length) {
    console.log('ads: no Href rewrites needed');
    return;
  }
  // Direct allows batches; keep small
  const chunk = updates.slice(0, 50);
  const res = await direct('ads', { method: 'update', params: { Ads: chunk } });
  const ok = (res?.result?.UpdateResults || []).filter((r) => r.Id).length;
  console.log(`ads.update: ${ok}/${chunk.length} → https://${hrefHost}/click/...`);
}

async function verify() {
  const camp = await direct('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: { Ids: [campaignId] },
      FieldNames: ['Id', 'Name', 'State'],
      TextCampaignFieldNames: ['CounterIds', 'Settings', 'PriorityGoals', 'TrackingParams'],
    },
  });
  const c = camp?.result?.Campaigns?.[0];
  const tag = (c?.TextCampaign?.Settings || []).find((s) => s.Option === 'ADD_METRICA_TAG');
  console.log(
    JSON.stringify(
      {
        id: c?.Id,
        name: c?.Name,
        CounterIds: c?.TextCampaign?.CounterIds,
        ADD_METRICA_TAG: tag?.Value,
        PriorityGoals: c?.TextCampaign?.PriorityGoals,
        TrackingParams: c?.TextCampaign?.TrackingParams,
      },
      null,
      2,
    ),
  );
}

await patchCampaign();
await rewriteAdHrefs();
await verify();
console.log('OK — Metrika linked. Check Direct UI: campaign → параметры → счётчики Метрики.');
