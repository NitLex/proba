#!/usr/bin/env node
/**
 * Apply a full РСЯ TextCampaign plan to Yandex Direct API v5.
 *
 * Requires: YANDEX_DIRECT_TOKEN + YANDEX_DIRECT_LOGIN in SECRETS.env / .env
 *
 * Usage:
 *   node src/apply-direct-plan.js [path/to/plan.json] [--dry-run] [--resume]
 *   npm run apply:direct --prefix server
 *
 * Flags:
 *   --dry-run   validate + print payload, no API writes
 *   --resume    after apply, resume campaign if Status=ACCEPTED
 *   --campaign-id=N  update existing campaign instead of creating
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, mask } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const LIMITS = {
  title: 56,
  title2: 30,
  text: 81,
  sitelinkTitle: 30,
  sitelinkDesc: 60,
  callout: 25,
  negative: 20,
};

loadEnv();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wantResume = args.includes('--resume');
const campArg = args.find((a) => a.startsWith('--campaign-id='));
const existingCampaignId = campArg ? Number(campArg.split('=')[1]) : null;
const planPath =
  args.find((a) => !a.startsWith('--')) ||
  path.join(ROOT, 'direct/plans/rsya-kredit365-premium-travel-services.json');

function rubToMicros(rub) {
  return Math.round(Number(rub) * 1_000_000);
}

function clip(s, n) {
  const t = String(s || '').trim();
  return t.length <= n ? t : t.slice(0, n);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function directApi(service, body) {
  const token = process.env.YANDEX_DIRECT_TOKEN;
  const login = process.env.YANDEX_DIRECT_LOGIN;
  if (!token || !login) {
    const err = new Error('YANDEX_DIRECT_TOKEN / YANDEX_DIRECT_LOGIN missing');
    err.code = 'NO_TOKEN';
    throw err;
  }
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
  const data = await res.json();
  if (data.error) {
    const e = data.error;
    throw new Error(`${service}: ${e.error_code} ${e.error_string} — ${e.error_detail || ''}`);
  }
  return data.result;
}

function firstIds(addResults = []) {
  const ids = [];
  const errors = [];
  for (const r of addResults) {
    if (r.Id != null) ids.push(r.Id);
    if (r.Errors?.length) errors.push(r);
  }
  return { ids, errors };
}

function campaignSettings(plan) {
  const s = plan.settings || {};
  const opts = [
    'ENABLE_SITE_MONITORING',
    'ENABLE_COMPANY_INFO',
    'ENABLE_AREA_OF_INTEREST_TARGETING',
    'ALTERNATIVE_TEXTS_ENABLED',
    'ADD_METRICA_TAG',
  ];
  return opts.map((Option) => ({
    Option,
    Value: s[Option] === 'YES' ? 'YES' : 'NO',
  }));
}

function buildCampaignBody(plan) {
  const weekly = rubToMicros(plan.strategy.weekly_spend_limit_rub);
  const ceiling = rubToMicros(plan.strategy.bid_ceiling_rub);
  return {
    Name: clip(plan.name, 255),
    StartDate: new Date().toISOString().slice(0, 10),
    TimeZone: 'Europe/Moscow',
    NegativeKeywords: { Items: (plan.negatives || []).slice(0, LIMITS.negative) },
    TextCampaign: {
      BiddingStrategy: {
        Search: { BiddingStrategyType: 'SERVING_OFF' },
        Network: {
          BiddingStrategyType: 'WB_MAXIMUM_CLICKS',
          WbMaximumClicks: {
            WeeklySpendLimit: weekly,
            BidCeiling: ceiling,
          },
        },
      },
      Settings: campaignSettings(plan),
      TrackingParams: plan.tracking_params,
    },
  };
}

async function uploadImage(imagePath) {
  const abs = path.isAbsolute(imagePath) ? imagePath : path.join(ROOT, imagePath);
  if (!fs.existsSync(abs)) throw new Error(`Image missing: ${abs}`);
  const b64 = fs.readFileSync(abs).toString('base64');
  const res = await directApi('adimages', {
    method: 'add',
    params: { AdImages: [{ ImageData: b64, Name: clip(path.basename(abs), 255) }] },
  });
  const row = res.AddResults?.[0] || {};
  const hash = row.AdImageHash || row.Hash;
  if (!hash) throw new Error(`adimages.add failed: ${JSON.stringify(row)}`);
  return hash;
}

async function applyPlan(plan) {
  const href = plan.href;
  const regionIds = plan.region_ids || [225];
  const out = {
    plan_name: plan.name,
    href,
    dry_run: dryRun,
    neuro_ads: 'OFF',
    direct_helps_auto: 'OFF',
    steps: {},
  };

  if (dryRun) {
    out.steps.campaign = { preview: buildCampaignBody(plan) };
    out.steps.ad_groups = plan.ad_groups.map((g) => ({
      name: g.name,
      keywords: g.keywords?.length || 0,
      ads: g.ads?.length || 0,
      image: g.image,
    }));
    return out;
  }

  // 1) Campaign
  let campaignId = existingCampaignId;
  if (!campaignId) {
    const add = await directApi('campaigns', {
      method: 'add',
      params: { Campaigns: [buildCampaignBody(plan)] },
    });
    const { ids, errors } = firstIds(add.AddResults);
    if (!ids[0]) throw new Error(`campaigns.add failed: ${JSON.stringify(errors || add)}`);
    campaignId = ids[0];
    out.steps.campaign = { action: 'add', id: campaignId, raw: add };
  } else {
    const upd = await directApi('campaigns', {
      method: 'update',
      params: {
        Campaigns: [
          {
            Id: campaignId,
            ...buildCampaignBody(plan),
            StartDate: undefined,
          },
        ],
      },
    });
    out.steps.campaign = { action: 'update', id: campaignId, raw: upd };
  }

  // 2) Ad groups
  const groupPayload = plan.ad_groups.map((g) => ({
    Name: clip(g.name, 255),
    CampaignId: campaignId,
    RegionIds: regionIds,
  }));
  const groupsRes = await directApi('adgroups', {
    method: 'add',
    params: { AdGroups: groupPayload },
  });
  const groupIds = firstIds(groupsRes.AddResults).ids;
  if (groupIds.length !== plan.ad_groups.length) {
    throw new Error(`adgroups.add partial: ${JSON.stringify(groupsRes)}`);
  }
  out.steps.adgroups = groupIds.map((id, i) => ({ id, name: plan.ad_groups[i].name }));

  // 3) Shared sitelinks + callouts (from first group; plan uses same set)
  const slSource = plan.ad_groups[0]?.sitelinks || [];
  const sitelinksRes = await directApi('sitelinks', {
    method: 'add',
    params: {
      SitelinksSets: [
        {
          Sitelinks: slSource.slice(0, 8).map((s) => ({
            Title: clip(s.title, LIMITS.sitelinkTitle),
            Href: href,
            Description: clip(s.description || '', LIMITS.sitelinkDesc),
          })),
        },
      ],
    },
  });
  const sitelinkSetId = sitelinksRes.AddResults?.[0]?.Id;
  out.steps.sitelink_set_id = sitelinkSetId;

  let extensionIds = [];
  try {
    const callouts = plan.ad_groups[0]?.callouts || [];
    const extRes = await directApi('adextensions', {
      method: 'add',
      params: {
        AdExtensions: callouts.map((t) => ({
          Callout: { CalloutText: clip(t, LIMITS.callout) },
        })),
      },
    });
    extensionIds = firstIds(extRes.AddResults).ids;
    out.steps.callouts = extensionIds;
  } catch (e) {
    out.steps.callouts_error = String(e.message || e);
  }

  // 4) Images, keywords, ads per group
  const adIds = [];
  const imageHashes = {};
  for (let i = 0; i < plan.ad_groups.length; i++) {
    const g = plan.ad_groups[i];
    const gid = groupIds[i];

    let imageHash = null;
    if (g.image) {
      imageHash = await uploadImage(g.image);
      imageHashes[g.name] = imageHash;
    }

    const kws = (g.keywords || []).filter(Boolean);
    if (kws.length) {
      // batch ≤ 1000
      for (let off = 0; off < kws.length; off += 900) {
        const chunk = kws.slice(off, off + 900).map((Keyword) => ({
          Keyword: clip(Keyword, 4096),
          AdGroupId: gid,
        }));
        await directApi('keywords', { method: 'add', params: { Keywords: chunk } });
      }
    }

    const ads = (g.ads || []).map((ad) => {
      const textAd = {
        Title: clip(ad.title, LIMITS.title),
        Title2: clip(ad.title2 || 'Оформление онлайн', LIMITS.title2),
        Text: clip(ad.text, LIMITS.text),
        Href: ad.href || href,
        Mobile: 'YES',
      };
      if (sitelinkSetId) textAd.SitelinkSetId = sitelinkSetId;
      if (imageHash) textAd.AdImageHash = imageHash;
      if (extensionIds.length) textAd.AdExtensionIds = extensionIds;
      return { AdGroupId: gid, TextAd: textAd };
    });

    if (ads.length) {
      const adsRes = await directApi('ads', { method: 'add', params: { Ads: ads } });
      const ids = firstIds(adsRes.AddResults).ids;
      adIds.push(...ids);
      out.steps[`ads_group_${i}`] = { group_id: gid, ad_ids: ids, errors: firstIds(adsRes.AddResults).errors };
    }
  }
  out.steps.images = imageHashes;
  out.steps.ad_ids = adIds;

  // 5) Bid modifiers (male+female × ages — GENDER_NONE rejected by API)
  const bm = plan.bid_modifiers || {};
  const ageMap = [
    ['AGE_25_34', bm.age_25_34 ?? 115],
    ['AGE_35_44', bm.age_35_44 ?? 115],
    ['AGE_0_17', bm.age_0_17 ?? 0],
    ['AGE_55', bm.age_55 ?? 50],
  ];
  const adjustments = [];
  for (const gender of ['GENDER_MALE', 'GENDER_FEMALE']) {
    for (const [Age, BidModifier] of ageMap) {
      adjustments.push({ Gender: gender, Age, BidModifier: Number(BidModifier) });
    }
  }
  try {
    const bmRes = await directApi('bidmodifiers', {
      method: 'add',
      params: {
        BidModifiers: [{ CampaignId: campaignId, DemographicsAdjustments: adjustments }],
      },
    });
    out.steps.bid_modifiers = bmRes;
  } catch (e) {
    out.steps.bid_modifiers_error = String(e.message || e);
  }

  // 6) Moderate
  if (adIds.length) {
    try {
      out.steps.moderate = await directApi('ads', {
        method: 'moderate',
        params: { SelectionCriteria: { Ids: adIds } },
      });
    } catch (e) {
      out.steps.moderate_error = String(e.message || e);
    }
  }

  // 7) Snapshot + optional resume
  const camp = await directApi('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: { Ids: [campaignId] },
      FieldNames: ['Id', 'Name', 'State', 'Status', 'StatusClarification'],
      TextCampaignFieldNames: ['BiddingStrategy', 'TrackingParams', 'Settings'],
    },
  });
  out.steps.snapshot = camp.Campaigns?.[0] || camp;

  const status = out.steps.snapshot?.Status;
  const state = out.steps.snapshot?.State;
  if (wantResume && status === 'ACCEPTED' && state === 'OFF') {
    out.steps.resume = await directApi('campaigns', {
      method: 'resume',
      params: { SelectionCriteria: { Ids: [campaignId] } },
    });
  } else {
    out.steps.resume = {
      skipped: true,
      reason:
        status === 'MODERATION'
          ? 'waiting_moderation — resume after ACCEPTED'
          : `status=${status} state=${state}`,
    };
  }

  out.campaign_id = campaignId;
  out.applied = true;
  return out;
}

async function pollAndResume(campaignId, { attempts = 12, delayMs = 30_000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const camp = await directApi('campaigns', {
      method: 'get',
      params: {
        SelectionCriteria: { Ids: [campaignId] },
        FieldNames: ['Id', 'Name', 'State', 'Status', 'StatusClarification'],
      },
    });
    const c = camp.Campaigns?.[0];
    console.log(`[poll ${i + 1}] status=${c?.Status} state=${c?.State} ${c?.StatusClarification || ''}`);
    if (c?.Status === 'ACCEPTED' && c?.State === 'OFF') {
      const r = await directApi('campaigns', {
        method: 'resume',
        params: { SelectionCriteria: { Ids: [campaignId] } },
      });
      return { resumed: true, campaign: c, resume: r };
    }
    if (c?.Status === 'REJECTED' || c?.State === 'ON') {
      return { resumed: false, campaign: c };
    }
    await sleep(delayMs);
  }
  return { resumed: false, timeout: true };
}

async function main() {
  if (!fs.existsSync(planPath)) {
    console.error('Plan not found:', planPath);
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  console.log('=== Apply Direct plan ===');
  console.log('plan:', planPath);
  console.log('name:', plan.name);
  console.log('href:', plan.href);
  console.log('token:', mask(process.env.YANDEX_DIRECT_TOKEN || ''));
  console.log('login:', process.env.YANDEX_DIRECT_LOGIN || '(empty)');
  console.log('dryRun:', dryRun);

  let result;
  try {
    result = await applyPlan(plan);
  } catch (e) {
    result = {
      applied: false,
      error: String(e.message || e),
      code: e.code || null,
      plan_name: plan.name,
      href: plan.href,
      hint:
        e.code === 'NO_TOKEN'
          ? 'Положи YANDEX_DIRECT_TOKEN и YANDEX_DIRECT_LOGIN в SECRETS.env и перезапусти: npm run apply:direct --prefix server'
          : 'Проверь ответ API / права приложения Директа',
    };
    console.error('APPLY FAILED:', result.error);
  }

  if (result.applied && wantResume && result.campaign_id) {
    console.log('Polling moderation for resume…');
    result.poll = await pollAndResume(result.campaign_id);
  }

  const outDir = path.join(ROOT, 'direct/apply-results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `rsya-kredit365-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  // also latest pointer
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(result, null, 2));
  console.log('wrote', outFile);
  console.log(JSON.stringify({ applied: result.applied, campaign_id: result.campaign_id, error: result.error }, null, 2));

  if (!result.applied && !dryRun) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
