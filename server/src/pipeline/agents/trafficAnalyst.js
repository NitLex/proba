/**
 * Traffic analyst — post-launch optimizer for moderated Direct РСЯ campaigns.
 * Goals: cut junk placements, flag weak ads/groups, suggest CPC/bid changes from tests.
 */

import { db } from '../../db.js';
import { directApiRetry } from '../../lib/directApi.js';
import { fetchPlacementReport, moscowDate } from '../../lib/directReports.js';
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

function trackerStatsForUser(userId, { from, to } = {}) {
  if (!userId) return { campaigns: [], byToken: [] };
  const fromTs = from ? `${from} 00:00:00` : null;
  const toTs = to ? `${to} 23:59:59` : null;

  const camps = db
    .prepare(
      `SELECT c.id, c.name, c.key, c.currency, c.cost_value, c.status
       FROM campaigns c WHERE c.user_id = ? ORDER BY c.id DESC`,
    )
    .all(userId);

  const enriched = camps.map((c) => {
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
  });

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

function scorePlacements(rows, { minClicks = 5, maxCostNoConv = 30 } = {}) {
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

function buildCampaignAdvice(directCamp, trackerCamp, placementActions) {
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

  if (trackerCamp) {
    if (trackerCamp.clicks < 20) {
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
  } else {
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

/**
 * @param {{ offer, context, dryRun, apply, ownerUserId }} args
 */
export async function runTrafficAnalyst({ offer = {}, context = {}, dryRun, apply, ownerUserId } = {}) {
  const dateTo = context.traffic_date_to || moscowDate(0);
  const dateFrom = context.traffic_date_from || moscowDate(-7);
  const minClicks = Number(context.traffic_min_clicks || 5);
  const maxCostNoConv = Number(context.traffic_max_cost_no_conv || 30);
  const applyChanges = Boolean(apply) && !dryRun;

  const listed = await listModeratedDirectCampaigns();
  const requestedIds = (context.direct_campaign_ids || offer.direct_campaign_ids || [])
    .map(String)
    .filter(Boolean);

  let targetCampaigns = listed.campaigns || [];
  if (requestedIds.length) {
    targetCampaigns = targetCampaigns.filter((c) => requestedIds.includes(c.id));
    // allow explicit ids even if list filter missed them
    for (const id of requestedIds) {
      if (!targetCampaigns.find((c) => c.id === id)) {
        targetCampaigns.push({
          id,
          name: `Campaign ${id}`,
          state: '?',
          status: '?',
          moderated: true,
          serving: false,
        });
      }
    }
  } else {
    // Default: only ACCEPTED (passed moderation)
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
  if (moderatedIds.length && !listed.skipped) {
    placementReport = await fetchPlacementReport(moderatedIds, { dateFrom, dateTo });
  } else if (listed.skipped) {
    placementReport = { ok: false, skipped: true, rows: [], dateFrom, dateTo };
  }

  const placementActions = scorePlacements(placementReport.rows || [], {
    minClicks,
    maxCostNoConv,
  });

  const perCampaign = targetCampaigns.map((dc) => {
    const trackerCamp =
      tracker.campaigns.find((t) => (dc.name || '').includes(t.name)) ||
      tracker.campaigns.find((t) => t.name && (dc.name || '').includes(t.key)) ||
      null;
    // Prefer tracker campaign linked via pipeline context
    const linked =
      tracker.campaigns.find((t) => t.id === context.tracker?.campaign?.id) || trackerCamp;

    const cut = placementActions.filter((a) => a.campaign_id === dc.id);
    const advice = buildCampaignAdvice(dc, linked, placementActions);
    return {
      direct: dc,
      tracker: linked,
      placements_to_cut: cut.slice(0, 40),
      advice,
    };
  });

  const toApply = placementActions.filter((a) => a.auto_apply).slice(0, 120);
  const byCamp = {};
  for (const a of toApply) {
    if (!byCamp[a.campaign_id]) byCamp[a.campaign_id] = [];
    byCamp[a.campaign_id].push(normalizePlacement(a.placement));
  }
  for (const id of Object.keys(byCamp)) {
    byCamp[id] = uniquePlacements(byCamp[id]);
  }

  let applyResult = null;
  if (applyChanges && Object.keys(byCamp).length) {
    applyResult = await applyPlacementExclusions(byCamp);
  } else if (dryRun || !applyChanges) {
    applyResult = {
      dry_run: true,
      would_exclude: Object.fromEntries(
        Object.entries(byCamp).map(([id, sites]) => [id, sites.length]),
      ),
      note: applyChanges
        ? 'нечего применять'
        : 'Режим рекомендаций — включи «Применить правки» чтобы запретить площадки в Директе',
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
        : `отчёт площадок: ошибка`,
    `к запрету ${toApply.length}`,
    applyChanges && applyResult && !applyResult.dry_run
      ? 'правки применены'
      : 'только рекомендации',
  ];

  const traffic_analysis = {
    period: { from: dateFrom, to: dateTo, days: spanDays },
    thresholds: { min_clicks: minClicks, max_cost_no_conv_rub: maxCostNoConv },
    direct_list: listed.ok
      ? { count: listed.campaigns.length, moderated: listed.moderated_ids }
      : { error: listed.error || listed.reason, skipped: listed.skipped },
    placement_report: {
      ok: Boolean(placementReport.ok),
      skipped: Boolean(placementReport.skipped),
      error: placementReport.error || null,
      rows: (placementReport.rows || []).length,
    },
    tracker_summary: {
      campaigns: tracker.campaigns.length,
      total_clicks: tracker.campaigns.reduce((s, c) => s + c.clicks, 0),
      total_cost: round(tracker.campaigns.reduce((s, c) => s + c.cost, 0)),
      total_conversions: tracker.campaigns.reduce((s, c) => s + c.conversions, 0),
    },
    campaigns: perCampaign,
    actions: {
      exclude_placements: toApply,
      pending_manual: placementActions.filter((a) => !a.auto_apply).slice(0, 40),
    },
    apply: applyResult,
    handbook: {
      excluded_placements: DIRECT_EXCLUDED_PLACEMENTS.workflow,
      limit: DIRECT_EXCLUDED_PLACEMENTS.limit,
      source: DIRECT_EXCLUDED_PLACEMENTS.source,
    },
  };

  const mini_report = buildTrafficMiniReport(traffic_analysis, {
    summary: summaryParts.join(' · '),
  });

  const cursor_prompt = [
    'Роль: аналитик трафика РСЯ после модерации.',
    `Период: ${dateFrom} — ${dateTo}.`,
    `Кампании: ${targetCampaigns.map((c) => `${c.id} (${c.status}/${c.state})`).join(', ') || '—'}`,
    `Площадок к автозапрету: ${toApply.length}.`,
    toApply.length
      ? `Топ: ${toApply
          .slice(0, 8)
          .map((a) => `${a.placement} [${a.reasons.join('; ')}]`)
          .join(' | ')}`
      : 'Автозапретов нет — накопи клики или снизь пороги.',
    'Цель: улучшить качество трафика (EPC↑, мусорные площадки↓), не убить объём на тесте.',
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

/** Compact report for orchestrator UI («что сделали»). */
export function buildTrafficMiniReport(traffic_analysis, meta = {}) {
  const ta = traffic_analysis || {};
  const applyList = Array.isArray(ta.apply) ? ta.apply : [];
  const dryRun = Boolean(ta.apply?.dry_run);
  const cuts = ta.actions?.exclude_placements || [];
  const sitesAdded = applyList.reduce((s, a) => s + (a.ok ? Number(a.added || 0) : 0), 0);
  const applyFailed = applyList.some((a) => a.ok === false);
  const advice = (ta.campaigns || [])
    .flatMap((c) =>
      (c.advice || [])
        .filter((a) => a.level === 'warn' || a.level === 'action' || a.level === 'ok')
        .map((a) => a.text),
    )
    .slice(0, 6);

  let outcome = 'recommendations_only';
  if (!dryRun && applyList.length) {
    if (applyFailed && sitesAdded === 0) outcome = 'apply_failed';
    else if (applyFailed) outcome = 'partial';
    else if (sitesAdded > 0) outcome = 'applied';
    else outcome = 'nothing_new';
  } else if (cuts.length === 0) {
    outcome = 'no_action';
  }

  return {
    summary: meta.summary || null,
    outcome,
    period: ta.period || null,
    campaign_ids: (ta.campaigns || []).map((c) => c.direct?.id).filter(Boolean),
    placements_scanned: ta.placement_report?.rows || 0,
    report_ok: Boolean(ta.placement_report?.ok),
    candidates_to_ban: cuts.length,
    applied: !dryRun && applyList.length > 0,
    dry_run: dryRun,
    sites_added: sitesAdded,
    sites_total_after: applyList[0]?.total ?? null,
    apply_ok: applyList.length ? applyList.every((a) => a.ok) : null,
    apply_errors: applyList
      .filter((a) => a.ok === false)
      .map((a) => ({
        campaign_id: a.campaign_id,
        error: a.error,
      })),
    top_banned: cuts.slice(0, 10).map((p) => ({
      placement: p.placement,
      clicks: p.clicks,
      cost: p.cost,
      conversions: p.conversions,
      reasons: p.reasons || [],
    })),
    advice,
    tracker: ta.tracker_summary || null,
  };
}
