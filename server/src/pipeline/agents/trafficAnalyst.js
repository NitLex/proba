/**
 * Traffic analyst — post-launch optimizer for moderated Direct РСЯ campaigns.
 * Goals: cut junk placements, pause weak ads, bid modifiers, BidCeiling, spend stop.
 */

import { db } from '../../db.js';
import { directApiRetry } from '../../lib/directApi.js';
import {
  fetchPlacementReport,
  fetchAdPerformanceReport,
  moscowDate,
} from '../../lib/directReports.js';
import { resolveTrackerForDirect } from '../../lib/directTrackerLink.js';
import {
  DIRECT_EXCLUDED_PLACEMENTS,
  DIRECT_BID_MODIFIERS,
} from '../knowledge/direct-handbook.js';

const YANDEX_OWN = /^(yandex\.|ya\.ru|dzen\.ru|zen\.yandex)/i;

function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}

function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function matchesJunkPattern(placement, patterns) {
  const p = String(placement || '').toLowerCase();
  return patterns.some((pat) => p.includes(String(pat).toLowerCase()));
}

/** List Direct campaigns that passed moderation / can serve. */
export async function listModeratedDirectCampaigns() {
  const res = await directApiRetry('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: {
        States: ['ON', 'SUSPENDED', 'OFF'],
        Statuses: ['ACCEPTED', 'MODERATION', 'REJECTED', 'DRAFT'],
      },
      FieldNames: ['Id', 'Name', 'State', 'Status', 'Type', 'StatusClarification', 'Statistics'],
      Page: { Limit: 50 },
    },
  });
  if (res?.skipped) return { ok: false, skipped: true, campaigns: [] };
  if (res?.error) return { ok: false, error: res.error, campaigns: [] };

  const all = res?.result?.Campaigns || [];
  const moderated = all.filter(
    (c) =>
      c.Type === 'TEXT_CAMPAIGN' &&
      (c.Status === 'ACCEPTED' || (c.State === 'ON' && c.Status !== 'DRAFT')),
  );
  const watching = all.filter(
    (c) =>
      c.Type === 'TEXT_CAMPAIGN' &&
      ['ACCEPTED', 'MODERATION', 'REJECTED'].includes(c.Status) &&
      c.State !== 'ARCHIVED',
  );

  return {
    ok: true,
    campaigns: watching.map((c) => ({
      id: String(c.Id),
      name: c.Name,
      state: c.State,
      status: c.Status,
      status_clarification: c.StatusClarification || '',
      moderated: c.Status === 'ACCEPTED',
      serving: c.State === 'ON',
      clicks: c.Statistics?.Clicks ?? null,
      impressions: c.Statistics?.Impressions ?? null,
    })),
    moderated_ids: moderated.map((c) => String(c.Id)),
  };
}

async function getExcludedSites(campaignId) {
  const res = await directApiRetry('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: { Ids: [campaignId] },
      FieldNames: ['Id', 'ExcludedSites'],
    },
  });
  const camp = res?.result?.Campaigns?.[0];
  return camp?.ExcludedSites?.Items || [];
}

function normalizePlacement(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

/** Deduplicate placements (case-insensitive) preserving first-seen casing. */
function uniquePlacements(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const norm = normalizePlacement(raw);
    if (!norm || YANDEX_OWN.test(norm) || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

async function setExcludedSites(campaignId, sites) {
  const unique = uniquePlacements(sites).slice(0, DIRECT_EXCLUDED_PLACEMENTS.limit || 1000);
  return directApiRetry('campaigns', {
    method: 'update',
    params: {
      Campaigns: [
        {
          Id: campaignId,
          ExcludedSites: { Items: unique },
        },
      ],
    },
  });
}

function trackerStatsForCampaign(campaignId, { from, to } = {}) {
  if (!campaignId) return null;
  const fromTs = from ? `${from} 00:00:00` : null;
  const toTs = to ? `${to} 23:59:59` : null;
  const c = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(campaignId);
  if (!c) return null;

  const clickParams = [c.id];
  let clickWhere = 'campaign_id = ?';
  if (fromTs) {
    clickWhere += ' AND created_at >= ?';
    clickParams.push(fromTs);
  }
  if (toTs) {
    clickWhere += ' AND created_at <= ?';
    clickParams.push(toTs);
  }
  const clicks = db
    .prepare(
      `SELECT COUNT(*) AS clicks, COALESCE(SUM(cost),0) AS cost
       FROM clicks WHERE ${clickWhere}`,
    )
    .get(...clickParams);

  const convParams = [c.id];
  let convWhere = 'campaign_id = ?';
  if (fromTs) {
    convWhere += ' AND created_at >= ?';
    convParams.push(fromTs);
  }
  if (toTs) {
    convWhere += ' AND created_at <= ?';
    convParams.push(toTs);
  }
  const conv = db
    .prepare(
      `SELECT COUNT(*) AS conversions,
              COALESCE(SUM(CASE WHEN status IN ('lead','sale') THEN payout ELSE 0 END),0) AS revenue
       FROM conversions WHERE ${convWhere}`,
    )
    .get(...convParams);

  const clickN = Number(clicks.clicks || 0);
  const cost = Number(clicks.cost || 0);
  const conversions = Number(conv.conversions || 0);
  const revenue = Number(conv.revenue || 0);
  const profit = revenue - cost;
  return {
    id: c.id,
    name: c.name,
    key: c.key,
    currency: c.currency || 'RUB',
    direct_campaign_id: c.direct_campaign_id || null,
    cpc_plan: Number(c.cost_value || 0),
    status: c.status,
    clicks: clickN,
    cost: round(cost),
    conversions,
    revenue: round(revenue),
    profit: round(profit),
    roi: cost > 0 ? round((profit / cost) * 100) : null,
    epc: clickN > 0 ? round(revenue / clickN) : 0,
    cpc: clickN > 0 ? round(cost / clickN) : 0,
    cr: clickN > 0 ? round((conversions / clickN) * 100) : 0,
  };
}

function trackerStatsForUser(userId, { from, to } = {}) {
  if (!userId) return { campaigns: [], byToken: [] };
  const camps = db
    .prepare(
      `SELECT id FROM campaigns WHERE user_id = ? ORDER BY id DESC`,
    )
    .all(userId);
  const enriched = camps
    .map((c) => trackerStatsForCampaign(c.id, { from, to }))
    .filter(Boolean);

  const fromTs = from ? `${from} 00:00:00` : null;
  const toTs = to ? `${to} 23:59:59` : null;
  const tokenParams = [userId];
  let tokenDate = '';
  if (fromTs) {
    tokenDate += ' AND cl.created_at >= ?';
    tokenParams.push(fromTs);
  }
  if (toTs) {
    tokenDate += ' AND cl.created_at <= ?';
    tokenParams.push(toTs);
  }
  const byToken = db
    .prepare(
      `SELECT cl.token2 AS ad_id, cl.token1 AS campaign_token, cl.token3 AS source_token,
              COUNT(*) AS clicks, COALESCE(SUM(cl.cost),0) AS cost
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ?${tokenDate}
       GROUP BY cl.token2, cl.token1, cl.token3
       HAVING clicks >= 5
       ORDER BY cost DESC
       LIMIT 40`,
    )
    .all(...tokenParams);

  return { campaigns: enriched, byToken };
}

export function scorePlacements(rows, { minClicks = 5, maxCostNoConv = 30 } = {}) {
  const patterns = DIRECT_EXCLUDED_PLACEMENTS.seed_blocklist_patterns || [];
  const actions = [];

  for (const r of rows) {
    if (!r.placement || YANDEX_OWN.test(r.placement)) continue;

    const reasons = [];
    let severity = 0;

    if (r.clicks >= minClicks && r.conversions <= 0 && r.cost >= maxCostNoConv) {
      reasons.push(`≥${minClicks} кликов, 0 конв., расход ${round(r.cost)} ₽`);
      severity += 3;
    } else if (r.clicks >= minClicks * 2 && r.conversions <= 0) {
      reasons.push(`${r.clicks} кликов без конверсий`);
      severity += 2;
    }

    if (matchesJunkPattern(r.placement, patterns)) {
      reasons.push('паттерн мусора (games/kids/torrent/…)');
      severity += 2;
    }

    if (r.avg_cpc > 0 && r.clicks >= minClicks && r.conversions <= 0 && r.avg_cpc > 8) {
      reasons.push(`высокий CPC ${round(r.avg_cpc)} ₽ без конверсий`);
      severity += 1;
    }

    if (!reasons.length) continue;

    actions.push({
      type: 'exclude_placement',
      campaign_id: r.campaign_id,
      placement: r.placement,
      clicks: r.clicks,
      cost: round(r.cost),
      conversions: r.conversions,
      avg_cpc: round(r.avg_cpc),
      severity,
      reasons,
      auto_apply: severity >= 2,
    });
  }

  actions.sort((a, b) => b.severity - a.severity || b.cost - a.cost);
  return actions;
}

/** Weak ads: spend without conversions → pause. */
export function scoreWeakAds(
  rows,
  { minClicks = 12, maxCostNoConv = 40 } = {},
) {
  const actions = [];
  for (const r of rows || []) {
    if (!r.ad_id) continue;
    if (r.conversions > 0) continue;
    if (r.clicks < minClicks && r.cost < maxCostNoConv) continue;

    const reasons = [];
    if (r.clicks >= minClicks && r.conversions <= 0) {
      reasons.push(`${r.clicks} кликов без конверсий`);
    }
    if (r.cost >= maxCostNoConv && r.conversions <= 0) {
      reasons.push(`расход ${round(r.cost)} ₽ без конверсий`);
    }
    if (!reasons.length) continue;

    actions.push({
      type: 'pause_ad',
      campaign_id: String(r.campaign_id),
      ad_id: String(r.ad_id),
      ad_group_id: String(r.ad_group_id || ''),
      clicks: r.clicks,
      cost: round(r.cost),
      conversions: r.conversions,
      avg_cpc: round(r.avg_cpc || 0),
      reasons,
      auto_apply: true,
    });
  }
  actions.sort((a, b) => b.cost - a.cost);
  return actions;
}

function buildAttributionAlerts(directCamp, trackerCamp, linkMeta) {
  const alerts = [];
  const directClicks = Number(directCamp.clicks || 0);

  if (!trackerCamp) {
    alerts.push({
      type: 'no_tracker_link',
      level: 'warn',
      text: `Нет привязки трекера к Direct ${directCamp.id} — EPC/CR недоступны`,
    });
    return alerts;
  }

  if (linkMeta?.match === 'name_fuzzy') {
    alerts.push({
      type: 'weak_link',
      level: 'info',
      text: `Привязка по имени («${trackerCamp.name}») — лучше зафиксировать direct_campaign_id`,
    });
  }

  if (directClicks >= 10 && trackerCamp.clicks === 0) {
    alerts.push({
      type: 'direct_clicks_no_tracker',
      level: 'critical',
      text: `В Директе ${directClicks} кликов, в трекере 0 — проверь трекинг-URL / UTM / редирект`,
    });
  }

  if (trackerCamp.clicks >= 15 && trackerCamp.conversions === 0 && trackerCamp.cost >= 80) {
    alerts.push({
      type: 'no_postbacks',
      level: 'critical',
      text: `Трекер: ${trackerCamp.clicks} кликов / ${trackerCamp.cost} ₽, 0 постбэков — проверь LeadGid postback`,
    });
  }

  return alerts;
}

function buildCampaignAdvice(directCamp, trackerCamp, placementActions, extra = {}) {
  const advice = [];
  const daysHint = DIRECT_EXCLUDED_PLACEMENTS.when_to_clean;

  if (!directCamp.moderated) {
    advice.push({
      type: 'wait_moderation',
      level: 'info',
      text: `Кампания ${directCamp.id} ещё не ACCEPTED (${directCamp.status}) — оптимизацию площадок отложить`,
    });
    return advice;
  }

  for (const a of extra.alerts || []) {
    advice.push({
      type: a.type,
      level: a.level === 'critical' ? 'warn' : a.level,
      text: a.text,
    });
  }

  if (trackerCamp) {
    if (trackerCamp.clicks < 20 && !(extra.alerts || []).some((x) => x.level === 'critical')) {
      advice.push({
        type: 'need_more_data',
        level: 'info',
        text: `В трекере мало кликов (${trackerCamp.clicks}) — рано резать; ориентир ${daysHint}`,
      });
    }
    if (trackerCamp.cpc > 0 && trackerCamp.epc > 0 && trackerCamp.cpc > trackerCamp.epc) {
      advice.push({
        type: 'cpc_above_epc',
        level: 'warn',
        text: `CPC ${trackerCamp.cpc} ₽ > EPC ${trackerCamp.epc} ₽ — снизь BidCeiling / убери дорогие площадки`,
        suggested_bid_ceiling_rub: round(Math.max(2, trackerCamp.epc * 0.85), 1),
      });
    }
    if (trackerCamp.conversions === 0 && trackerCamp.cost >= 150) {
      advice.push({
        type: 'no_conversions',
        level: 'warn',
        text: `Расход ${trackerCamp.cost} ₽ без конверсий — проверь постбэк, креатив и минус-площадки`,
      });
    }
    if (trackerCamp.roi != null && trackerCamp.roi < 0 && trackerCamp.clicks >= 30) {
      advice.push({
        type: 'negative_roi',
        level: 'warn',
        text: `ROI ${trackerCamp.roi}% — оставь лучшие группы, остальное на паузу`,
      });
    }
    if (trackerCamp.roi != null && trackerCamp.roi >= 30 && trackerCamp.conversions >= 3) {
      advice.push({
        type: 'scale',
        level: 'ok',
        text: `ROI ${trackerCamp.roi}% при ${trackerCamp.conversions} конв. — можно аккуратно поднять недельный бюджет`,
      });
    }
  } else if (!(extra.alerts || []).length) {
    advice.push({
      type: 'no_tracker_link',
      level: 'info',
      text: 'Нет статистики трекера по этой кампании — опираемся на отчёт Директа по площадкам',
    });
  }

  const cut = placementActions.filter((a) => a.campaign_id === String(directCamp.id));
  if (cut.length) {
    advice.push({
      type: 'cut_placements',
      level: 'action',
      text: `К запрету: ${cut.length} площадок (лимит списка ${DIRECT_EXCLUDED_PLACEMENTS.limit})`,
      count: cut.length,
    });
  } else if (directCamp.moderated) {
    advice.push({
      type: 'placements_ok',
      level: 'info',
      text: 'Явного мусора по порогам не найдено — продолжай тест 1–2 дня',
    });
  }

  if (extra.adsToPause?.length) {
    advice.push({
      type: 'pause_ads',
      level: 'action',
      text: `Слабых объявлений к паузе: ${extra.adsToPause.length}`,
    });
  }
  if (extra.bidCeiling) {
    advice.push({
      type: 'bid_ceiling',
      level: 'action',
      text: `BidCeiling → ${extra.bidCeiling.suggested_rub} ₽ (сейчас ${extra.bidCeiling.current_rub ?? '?'} ₽)`,
    });
  }
  if (extra.spendStop) {
    advice.push({
      type: 'spend_stop',
      level: 'warn',
      text: extra.spendStop.reason,
    });
  }

  advice.push({
    type: 'bid_modifiers_hint',
    level: 'info',
    text: 'Корректировки возраста: дети −100%, ядро 25–44 чуть выше — после набора статистики',
    ref: DIRECT_BID_MODIFIERS.source,
  });

  return advice;
}

async function applyPlacementExclusions(byCampaign) {
  const results = [];
  for (const [campaignId, placements] of Object.entries(byCampaign)) {
    const existing = uniquePlacements(await getExcludedSites(campaignId));
    const merged = uniquePlacements([...existing, ...placements]);
    if (merged.length === existing.length) {
      results.push({
        campaign_id: campaignId,
        ok: true,
        added: 0,
        total: merged.length,
        note: 'уже в списке',
      });
      continue;
    }
    const upd = await setExcludedSites(campaignId, merged);
    const err = upd?.error || upd?.result?.UpdateResults?.[0]?.Errors;
    const ok = !err || (Array.isArray(err) && err.length === 0);
    results.push({
      campaign_id: campaignId,
      ok: ok && !upd?.skipped,
      added: merged.length - existing.length,
      total: merged.length,
      error: ok ? null : err,
      skipped: upd?.skipped || false,
      sample_added: placements.slice(0, 10).map(normalizePlacement),
    });
  }
  return results;
}

async function applyPauseAds(adIds) {
  const ids = [...new Set((adIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: true, paused: 0 };
  const res = await directApiRetry('ads', {
    method: 'suspend',
    params: { SelectionCriteria: { Ids: ids } },
  });
  const err = res?.error;
  const results = res?.result?.SuspendResults || [];
  const paused = results.filter((r) => !r.Errors?.length).length;
  return {
    ok: !err,
    paused: paused || (err ? 0 : ids.length),
    ids,
    error: err || null,
    raw: results.slice(0, 5),
  };
}

async function getCampaignDemographics(campaignId) {
  const res = await directApiRetry('bidmodifiers', {
    method: 'get',
    params: {
      SelectionCriteria: {
        CampaignIds: [campaignId],
        Types: ['DEMOGRAPHICS_ADJUSTMENT'],
        Levels: ['CAMPAIGN'],
      },
      FieldNames: ['Id', 'CampaignId', 'Type', 'Level'],
      DemographicsAdjustmentFieldNames: ['Age', 'Gender', 'BidModifier', 'Enabled'],
    },
  });
  return res?.result?.BidModifiers || [];
}

async function ensureKidsBidModifierOff(campaignId) {
  const existing = await getCampaignDemographics(campaignId);
  const kids = existing.find(
    (b) =>
      b.DemographicsAdjustment?.Age === 'AGE_0_17' &&
      (!b.DemographicsAdjustment?.Gender || b.DemographicsAdjustment.Gender == null),
  );
  if (kids) {
    const coef = Number(kids.DemographicsAdjustment?.BidModifier);
    if (coef === 0) {
      return { ok: true, already: true, campaign_id: String(campaignId), bid_modifier: 0 };
    }
    const set = await directApiRetry('bidmodifiers', {
      method: 'set',
      params: {
        BidModifiers: [{ Id: kids.Id, BidModifier: 0 }],
      },
    });
    const err = set?.error || set?.result?.SetResults?.[0]?.Errors;
    return {
      ok: !err || (Array.isArray(err) && !err.length),
      updated: true,
      campaign_id: String(campaignId),
      bid_modifier: 0,
      error: err || null,
    };
  }

  const add = await directApiRetry('bidmodifiers', {
    method: 'add',
    params: {
      BidModifiers: [
        {
          CampaignId: campaignId,
          DemographicsAdjustments: [{ Age: 'AGE_0_17', BidModifier: 0 }],
        },
      ],
    },
  });
  const err = add?.error || add?.result?.AddResults?.[0]?.Errors;
  return {
    ok: !err || (Array.isArray(err) && !err.length),
    added: true,
    campaign_id: String(campaignId),
    bid_modifier: 0,
    error: err || null,
  };
}

async function getCampaignNetworkStrategy(campaignId) {
  const res = await directApiRetry('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: { Ids: [campaignId] },
      FieldNames: ['Id', 'Type'],
      TextCampaignFieldNames: ['BiddingStrategy'],
    },
  });
  const camp = res?.result?.Campaigns?.[0];
  const network = camp?.TextCampaign?.BiddingStrategy?.Network;
  const wb = network?.WbMaximumClicks;
  return {
    ok: !res?.error,
    campaign_id: String(campaignId),
    strategy_type: network?.BiddingStrategyType || null,
    weekly_spend_limit_micros: wb?.WeeklySpendLimit ?? null,
    bid_ceiling_micros: wb?.BidCeiling ?? null,
    bid_ceiling_rub:
      wb?.BidCeiling != null ? round(Number(wb.BidCeiling) / 1_000_000, 2) : null,
    error: res?.error || null,
  };
}

async function updateBidCeiling(campaignId, bidCeilingRub, weeklySpendLimitMicros = null) {
  const current = await getCampaignNetworkStrategy(campaignId);
  if (current.strategy_type && current.strategy_type !== 'WB_MAXIMUM_CLICKS') {
    return {
      ok: false,
      skipped: true,
      campaign_id: String(campaignId),
      error: `strategy ${current.strategy_type} — BidCeiling только для WB_MAXIMUM_CLICKS`,
    };
  }
  const ceilingMicros = Math.round(Number(bidCeilingRub) * 1_000_000);
  const weekly =
    weeklySpendLimitMicros ??
    current.weekly_spend_limit_micros ??
    Math.round(3000 * 1_000_000);

  const upd = await directApiRetry('campaigns', {
    method: 'update',
    params: {
      Campaigns: [
        {
          Id: campaignId,
          TextCampaign: {
            BiddingStrategy: {
              Search: { BiddingStrategyType: 'SERVING_OFF' },
              Network: {
                BiddingStrategyType: 'WB_MAXIMUM_CLICKS',
                WbMaximumClicks: {
                  WeeklySpendLimit: weekly,
                  BidCeiling: ceilingMicros,
                },
              },
            },
          },
        },
      ],
    },
  });
  const err = upd?.error || upd?.result?.UpdateResults?.[0]?.Errors;
  return {
    ok: !err || (Array.isArray(err) && !err.length),
    campaign_id: String(campaignId),
    previous_rub: current.bid_ceiling_rub,
    new_rub: round(bidCeilingRub, 2),
    error: err || null,
  };
}

async function suspendCampaign(campaignId, reason) {
  const res = await directApiRetry('campaigns', {
    method: 'suspend',
    params: { SelectionCriteria: { Ids: [campaignId] } },
  });
  const err = res?.error || res?.result?.SuspendResults?.[0]?.Errors;
  return {
    ok: !err || (Array.isArray(err) && !err.length),
    campaign_id: String(campaignId),
    reason,
    error: err || null,
  };
}

/** Decide BidCeiling / spend-stop from tracker economics. */
export function planEconomicsActions(directCamp, trackerCamp, thresholds = {}) {
  const out = {
    bidCeiling: null,
    spendStop: null,
  };
  if (!trackerCamp || !directCamp?.moderated) return out;

  const drainRub = Number(thresholds.drain_cost_rub || 400);
  const drainClicks = Number(thresholds.drain_clicks || 40);
  const minBid = Number(thresholds.min_bid_ceiling_rub || 2);

  if (
    directCamp.serving &&
    trackerCamp.conversions === 0 &&
    trackerCamp.cost >= drainRub &&
    trackerCamp.clicks >= drainClicks
  ) {
    out.spendStop = {
      type: 'suspend_campaign',
      campaign_id: String(directCamp.id),
      reason: `Слив: ${trackerCamp.cost} ₽ / ${trackerCamp.clicks} кл. без конверсий — стоп показов`,
      auto_apply: true,
    };
  }

  if (
    trackerCamp.cpc > 0 &&
    trackerCamp.epc > 0 &&
    trackerCamp.cpc > trackerCamp.epc &&
    trackerCamp.clicks >= 20
  ) {
    const suggested = round(Math.max(minBid, trackerCamp.epc * 0.85), 1);
    out.bidCeiling = {
      type: 'lower_bid_ceiling',
      campaign_id: String(directCamp.id),
      suggested_rub: suggested,
      current_cpc: trackerCamp.cpc,
      epc: trackerCamp.epc,
      auto_apply: true,
    };
  }

  return out;
}

/**
 * @param {{ offer, context, dryRun, apply, ownerUserId }} args
 */
export async function runTrafficAnalyst({ offer = {}, context = {}, dryRun, apply, ownerUserId } = {}) {
  const dateTo = context.traffic_date_to || moscowDate(0);
  const dateFrom = context.traffic_date_from || moscowDate(-7);
  const minClicks = Number(context.traffic_min_clicks || 5);
  const maxCostNoConv = Number(context.traffic_max_cost_no_conv || 30);
  const adMinClicks = Number(context.traffic_ad_min_clicks || 12);
  const adMaxCost = Number(context.traffic_ad_max_cost_no_conv || 40);
  const applyChanges = Boolean(apply) && !dryRun;
  const applyAds = context.traffic_apply_ads !== false;
  const applyBids = context.traffic_apply_bids !== false;
  const applyCeiling = context.traffic_apply_ceiling !== false;
  const applySpendStop = context.traffic_apply_spend_stop !== false;

  const listed = await listModeratedDirectCampaigns();
  const requestedIds = (context.direct_campaign_ids || offer.direct_campaign_ids || [])
    .map(String)
    .filter(Boolean);

  let targetCampaigns = listed.campaigns || [];
  if (requestedIds.length) {
    targetCampaigns = targetCampaigns.filter((c) => requestedIds.includes(c.id));
    for (const id of requestedIds) {
      if (!targetCampaigns.find((c) => c.id === id)) {
        targetCampaigns.push({
          id,
          name: `Campaign ${id}`,
          state: '?',
          status: '?',
          moderated: true,
          serving: false,
          clicks: null,
        });
      }
    }
  } else {
    targetCampaigns = targetCampaigns.filter((c) => c.moderated);
  }

  const fromContextDirect = context.direct?.campaign_id
    ? String(context.direct.campaign_id)
    : null;
  if (!targetCampaigns.length && fromContextDirect) {
    targetCampaigns = [
      {
        id: fromContextDirect,
        name: context.direct?.plan?.name || `Campaign ${fromContextDirect}`,
        state: '?',
        status: 'ACCEPTED',
        moderated: true,
        serving: false,
        clicks: null,
      },
    ];
  }

  const userId =
    ownerUserId ||
    context.owner_user_id ||
    (process.env.PIPELINE_OWNER_USER_ID
      ? Number(process.env.PIPELINE_OWNER_USER_ID)
      : null);

  const tracker = trackerStatsForUser(userId, { from: dateFrom, to: dateTo });

  const moderatedIds = targetCampaigns.filter((c) => c.moderated).map((c) => c.id);
  let placementReport = { ok: false, rows: [], dateFrom, dateTo };
  let adReport = { ok: false, rows: [], dateFrom, dateTo };
  if (moderatedIds.length && !listed.skipped) {
    [placementReport, adReport] = await Promise.all([
      fetchPlacementReport(moderatedIds, { dateFrom, dateTo }),
      fetchAdPerformanceReport(moderatedIds, { dateFrom, dateTo }),
    ]);
  } else if (listed.skipped) {
    placementReport = { ok: false, skipped: true, rows: [], dateFrom, dateTo };
    adReport = { ok: false, skipped: true, rows: [], dateFrom, dateTo };
  }

  const placementActions = scorePlacements(placementReport.rows || [], {
    minClicks,
    maxCostNoConv,
  });
  const weakAds = scoreWeakAds(adReport.rows || [], {
    minClicks: adMinClicks,
    maxCostNoConv: adMaxCost,
  });

  const perCampaign = [];
  const bidCeilingPlans = [];
  const spendStopPlans = [];
  const bidModPlans = [];

  for (const dc of targetCampaigns) {
    const resolved = resolveTrackerForDirect({
      directCampaignId: dc.id,
      directName: dc.name,
      userId,
      context,
    });
    const linkedRow = resolved.campaign;
    const linked = linkedRow
      ? trackerStatsForCampaign(linkedRow.id, { from: dateFrom, to: dateTo })
      : null;

    const alerts = buildAttributionAlerts(dc, linked, resolved);
    const adsForCamp = weakAds.filter((a) => a.campaign_id === dc.id);
    const economics = planEconomicsActions(dc, linked, {
      drain_cost_rub: context.traffic_drain_cost_rub,
      drain_clicks: context.traffic_drain_clicks,
    });
    if (economics.bidCeiling) bidCeilingPlans.push(economics.bidCeiling);
    if (economics.spendStop) spendStopPlans.push(economics.spendStop);

    // Kids −100% always recommended for moderated serving campaigns
    if (dc.moderated) {
      bidModPlans.push({
        type: 'kids_off',
        campaign_id: dc.id,
        auto_apply: true,
      });
    }

    const advice = buildCampaignAdvice(dc, linked, placementActions, {
      alerts,
      adsToPause: adsForCamp,
      bidCeiling: economics.bidCeiling,
      spendStop: economics.spendStop,
    });

    perCampaign.push({
      direct: dc,
      tracker: linked,
      link: {
        match: resolved.match,
        tracker_campaign_id: linkedRow?.id || null,
        direct_campaign_id: dc.id,
      },
      alerts,
      placements_to_cut: placementActions.filter((a) => a.campaign_id === dc.id).slice(0, 40),
      ads_to_pause: adsForCamp.slice(0, 20),
      economics,
      advice,
    });
  }

  const toApply = placementActions.filter((a) => a.auto_apply).slice(0, 120);
  const byCamp = {};
  for (const a of toApply) {
    if (!byCamp[a.campaign_id]) byCamp[a.campaign_id] = [];
    byCamp[a.campaign_id].push(normalizePlacement(a.placement));
  }
  for (const id of Object.keys(byCamp)) {
    byCamp[id] = uniquePlacements(byCamp[id]);
  }

  const adsToPauseIds = weakAds.filter((a) => a.auto_apply).map((a) => a.ad_id).slice(0, 50);

  let applyResult = {
    placements: null,
    ads: null,
    bid_modifiers: [],
    bid_ceilings: [],
    spend_stops: [],
    dry_run: !applyChanges,
  };

  if (applyChanges) {
    if (Object.keys(byCamp).length) {
      applyResult.placements = await applyPlacementExclusions(byCamp);
    } else {
      applyResult.placements = [];
    }

    if (applyAds && adsToPauseIds.length) {
      applyResult.ads = await applyPauseAds(adsToPauseIds);
    }

    if (applyBids) {
      for (const plan of bidModPlans) {
        applyResult.bid_modifiers.push(await ensureKidsBidModifierOff(plan.campaign_id));
      }
    }

    if (applyCeiling) {
      for (const plan of bidCeilingPlans) {
        const strat = await getCampaignNetworkStrategy(plan.campaign_id);
        const current = strat.bid_ceiling_rub;
        if (current != null && plan.suggested_rub >= current) {
          applyResult.bid_ceilings.push({
            ok: true,
            skipped: true,
            campaign_id: plan.campaign_id,
            note: `текущий BidCeiling ${current} ≤ целевого ${plan.suggested_rub}`,
            previous_rub: current,
            new_rub: current,
          });
          continue;
        }
        applyResult.bid_ceilings.push(
          await updateBidCeiling(plan.campaign_id, plan.suggested_rub),
        );
      }
    }

    if (applySpendStop) {
      for (const plan of spendStopPlans) {
        applyResult.spend_stops.push(
          await suspendCampaign(plan.campaign_id, plan.reason),
        );
      }
    }
  } else {
    applyResult = {
      dry_run: true,
      would_exclude: Object.fromEntries(
        Object.entries(byCamp).map(([id, sites]) => [id, sites.length]),
      ),
      would_pause_ads: adsToPauseIds.length,
      would_bid_modifiers: bidModPlans.length,
      would_bid_ceilings: bidCeilingPlans.map((p) => ({
        campaign_id: p.campaign_id,
        suggested_rub: p.suggested_rub,
      })),
      would_spend_stops: spendStopPlans.map((p) => ({
        campaign_id: p.campaign_id,
        reason: p.reason,
      })),
      note: 'Режим рекомендаций — включи «Применить правки» для правок в Директе',
    };
  }

  const spanDays = daysBetween(dateFrom, dateTo);
  const summaryParts = [
    `Трафик-аналитик: ${targetCampaigns.length} кампаний`,
    `${dateFrom}…${dateTo} (${spanDays}д)`,
    placementReport.ok
      ? `площадок в отчёте ${placementReport.rows.length}`
      : placementReport.skipped
        ? 'отчёт Директа недоступен (нет токена)'
        : 'отчёт площадок: ошибка',
    `к запрету ${toApply.length}`,
    `слабых объявл. ${weakAds.length}`,
    applyChanges ? 'правки применены' : 'только рекомендации',
  ];

  const traffic_analysis = {
    period: { from: dateFrom, to: dateTo, days: spanDays },
    thresholds: {
      min_clicks: minClicks,
      max_cost_no_conv_rub: maxCostNoConv,
      ad_min_clicks: adMinClicks,
      ad_max_cost_no_conv_rub: adMaxCost,
    },
    direct_list: listed.ok
      ? { count: listed.campaigns.length, moderated: listed.moderated_ids }
      : { error: listed.error || listed.reason, skipped: listed.skipped },
    placement_report: {
      ok: Boolean(placementReport.ok),
      skipped: Boolean(placementReport.skipped),
      error: placementReport.error || null,
      rows: (placementReport.rows || []).length,
    },
    ad_report: {
      ok: Boolean(adReport.ok),
      skipped: Boolean(adReport.skipped),
      error: adReport.error || null,
      rows: (adReport.rows || []).length,
    },
    tracker_summary: {
      campaigns: tracker.campaigns.length,
      total_clicks: tracker.campaigns.reduce((s, c) => s + c.clicks, 0),
      total_cost: round(tracker.campaigns.reduce((s, c) => s + c.cost, 0)),
      total_conversions: tracker.campaigns.reduce((s, c) => s + c.conversions, 0),
      linked: perCampaign.filter((c) => c.tracker).length,
    },
    campaigns: perCampaign,
    actions: {
      exclude_placements: toApply,
      pending_manual: placementActions.filter((a) => !a.auto_apply).slice(0, 40),
      pause_ads: weakAds.slice(0, 40),
      bid_modifiers: bidModPlans,
      bid_ceilings: bidCeilingPlans,
      spend_stops: spendStopPlans,
    },
    apply: applyResult,
    handbook: {
      excluded_placements: DIRECT_EXCLUDED_PLACEMENTS.workflow,
      limit: DIRECT_EXCLUDED_PLACEMENTS.limit,
      source: DIRECT_EXCLUDED_PLACEMENTS.source,
      bid_modifiers: DIRECT_BID_MODIFIERS.source,
    },
  };

  const mini_report = buildTrafficMiniReport(traffic_analysis, {
    summary: summaryParts.join(' · '),
  });

  const cursor_prompt = [
    'Роль: аналитик трафика РСЯ после модерации.',
    `Период: ${dateFrom} — ${dateTo}.`,
    `Кампании: ${targetCampaigns.map((c) => `${c.id} (${c.status}/${c.state})`).join(', ') || '—'}`,
    `Площадок к автозапрету: ${toApply.length}. Слабых объявлений: ${weakAds.length}.`,
    `BidCeiling планов: ${bidCeilingPlans.length}. Стоп по сливу: ${spendStopPlans.length}.`,
    'Цель: качество трафика (EPC↑, мусор↓), не убить объём на тесте.',
    'Не банить поисковые проекты Яндекса. Лимит минус-площадок 1000.',
  ].join('\n');

  return {
    summary: summaryParts.join(' · '),
    traffic_analysis,
    mini_report,
    cursor_prompt,
    context_patch: { traffic_analysis, mini_report },
  };
}

function applyHasRealError(a) {
  if (!a || a.ok === true) return false;
  const err = a.error;
  if (err == null || err === false) return false;
  if (Array.isArray(err) && err.length === 0) return false;
  if (typeof err === 'object' && !Array.isArray(err) && !Object.keys(err).length) return false;
  if (Number(a.added || 0) > 0 && (err == null || (Array.isArray(err) && !err.length))) {
    return false;
  }
  return a.ok === false && Boolean(err);
}

/** Compact report for orchestrator UI («что сделали»). */
export function buildTrafficMiniReport(traffic_analysis, meta = {}) {
  const ta = traffic_analysis || {};
  const applyObj = ta.apply || {};
  const applyList = Array.isArray(applyObj.placements)
    ? applyObj.placements
    : Array.isArray(applyObj)
      ? applyObj
      : [];
  const dryRun = Boolean(applyObj.dry_run);
  const cuts = ta.actions?.exclude_placements || [];
  const sitesAdded = applyList.reduce((s, a) => {
    const n = Number(a.added || 0);
    if (n <= 0) return s;
    if (a.ok === true || !applyHasRealError(a)) return s + n;
    return s;
  }, 0);
  const adsPaused = Number(applyObj.ads?.paused || 0);
  const bidModsOk = (applyObj.bid_modifiers || []).filter((b) => b.ok).length;
  const ceilingsOk = (applyObj.bid_ceilings || []).filter((b) => b.ok && !b.skipped).length;
  const stopsOk = (applyObj.spend_stops || []).filter((b) => b.ok).length;
  const applyFailed =
    applyList.some((a) => applyHasRealError(a)) ||
    (applyObj.ads && applyObj.ads.ok === false) ||
    (applyObj.bid_modifiers || []).some((b) => b.ok === false) ||
    (applyObj.bid_ceilings || []).some((b) => b.ok === false && !b.skipped) ||
    (applyObj.spend_stops || []).some((b) => b.ok === false);

  const advice = (ta.campaigns || [])
    .flatMap((c) =>
      (c.advice || [])
        .filter((a) => a.level === 'warn' || a.level === 'action' || a.level === 'ok')
        .map((a) => a.text),
    )
    .slice(0, 8);

  const alerts = (ta.campaigns || [])
    .flatMap((c) => c.alerts || [])
    .slice(0, 8);

  const anyApplied =
    sitesAdded > 0 || adsPaused > 0 || ceilingsOk > 0 || stopsOk > 0 || bidModsOk > 0;

  let outcome = 'recommendations_only';
  if (!dryRun && (applyList.length || applyObj.ads || (applyObj.bid_modifiers || []).length)) {
    if (applyFailed && !anyApplied) outcome = 'apply_failed';
    else if (applyFailed) outcome = 'partial';
    else if (anyApplied) outcome = 'applied';
    else outcome = 'nothing_new';
  } else if (
    cuts.length === 0 &&
    !(ta.actions?.pause_ads || []).length &&
    !(ta.actions?.bid_ceilings || []).length &&
    !(ta.actions?.spend_stops || []).length
  ) {
    outcome = 'no_action';
  }

  return {
    summary: meta.summary || null,
    outcome,
    period: ta.period || null,
    campaign_ids: (ta.campaigns || []).map((c) => c.direct?.id).filter(Boolean),
    placements_scanned: ta.placement_report?.rows || 0,
    ads_scanned: ta.ad_report?.rows || 0,
    report_ok: Boolean(ta.placement_report?.ok),
    candidates_to_ban: cuts.length,
    candidates_pause_ads: (ta.actions?.pause_ads || []).length,
    applied: !dryRun && anyApplied,
    dry_run: dryRun,
    sites_added: sitesAdded,
    sites_total_after: applyList[0]?.total ?? null,
    ads_paused: adsPaused,
    bid_modifiers_ok: bidModsOk,
    bid_ceilings_updated: ceilingsOk,
    campaigns_suspended: stopsOk,
    apply_ok: dryRun
      ? null
      : !applyFailed,
    apply_errors: [
      ...applyList
        .filter((a) => applyHasRealError(a))
        .map((a) => ({ kind: 'placements', campaign_id: a.campaign_id, error: a.error })),
      ...(applyObj.ads?.ok === false
        ? [{ kind: 'ads', error: applyObj.ads.error }]
        : []),
      ...(applyObj.bid_modifiers || [])
        .filter((b) => b.ok === false)
        .map((b) => ({ kind: 'bid_modifiers', campaign_id: b.campaign_id, error: b.error })),
      ...(applyObj.bid_ceilings || [])
        .filter((b) => b.ok === false && !b.skipped)
        .map((b) => ({ kind: 'bid_ceiling', campaign_id: b.campaign_id, error: b.error })),
      ...(applyObj.spend_stops || [])
        .filter((b) => b.ok === false)
        .map((b) => ({ kind: 'spend_stop', campaign_id: b.campaign_id, error: b.error })),
    ],
    top_banned: cuts.slice(0, 10).map((p) => ({
      placement: p.placement,
      clicks: p.clicks,
      cost: p.cost,
      conversions: p.conversions,
      reasons: p.reasons || [],
    })),
    top_paused_ads: (ta.actions?.pause_ads || []).slice(0, 6).map((a) => ({
      ad_id: a.ad_id,
      campaign_id: a.campaign_id,
      clicks: a.clicks,
      cost: a.cost,
      reasons: a.reasons || [],
    })),
    advice,
    alerts: alerts.map((a) => a.text),
    tracker: ta.tracker_summary || null,
    would: dryRun
      ? {
          pause_ads: applyObj.would_pause_ads || 0,
          bid_modifiers: applyObj.would_bid_modifiers || 0,
          bid_ceilings: applyObj.would_bid_ceilings || [],
          spend_stops: applyObj.would_spend_stops || [],
        }
      : null,
  };
}
