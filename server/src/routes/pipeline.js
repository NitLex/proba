import { Router } from 'express';
import { requireRegistered } from '../middleware/auth.js';
import {
  AGENT_ROLES,
  DEFAULT_PIPELINE,
  OPTIMIZATION_PIPELINE,
  executeRun,
  startPipeline,
  runTrafficOptimization,
} from '../pipeline/runner.js';
import { getRun, listRuns, updateRun } from '../pipeline/store.js';
import { wordstatConfig } from '../lib/wordstat.js';
import { cursorAgentsConfig, DEFAULT_CURSOR_SPAWN_AGENTS } from '../lib/cursorAgents.js';
import { remoteBase, remoteConfigured } from '../lib/arbtrackRemote.js';
import { maybeSpawnCursorAgents } from '../pipeline/spawnCursor.js';
import { imageGenConfig } from '../lib/imageGen.js';
import { enrichOfferInput } from '../lib/offerEnrich.js';
import {
  saveReferenceBatch,
  attachCreativesToRun,
  mergeGeneratedImages,
} from '../lib/creativeAssets.js';
import { validateCreatives } from '../lib/creativeQa.js';
import { runDirect } from '../pipeline/agents/direct.js';
import {
  buildLeadgidPostbackUrl,
  leadgidPostbackInstructions,
  publicTrackerBase,
} from '../lib/leadgidPostback.js';
import { DIRECT_DOC_SOURCES } from '../pipeline/knowledge/direct-handbook.js';
import {
  listModeratedDirectCampaigns,
  buildTrafficMiniReport,
} from '../pipeline/agents/trafficAnalyst.js';
import {
  OPTIMIZATION_SCHEDULE,
  scheduleAdvice,
  daysSince,
} from '../lib/optimizationSchedule.js';
import { findTrackerByDirectCampaignId } from '../lib/directTrackerLink.js';

const router = Router();
// Double-guard: demo account must never use orchestrator (UI also hides the tab)
router.use(requireRegistered);

function trackerModeInfo() {
  const forcedLocal = String(process.env.PIPELINE_TRACKER_MODE || '') === 'local';
  const useRemote = remoteConfigured() && !forcedLocal;
  return {
    mode: useRemote ? 'remote' : 'local',
    url: useRemote ? remoteBase() : process.env.ARBTRACK_PUBLIC_URL || 'local',
    note: forcedLocal
      ? 'PIPELINE_TRACKER_MODE=local — пишет в эту же БД трекера'
      : useRemote
        ? 'Remote → создаёт сущности на ARBTRACK_PUBLIC_URL'
        : 'Локальный режим (нет remote credentials или local mode)',
  };
}

router.get('/roles', (_req, res) => {
  res.json({
    roles: Object.values(AGENT_ROLES),
    pipeline: DEFAULT_PIPELINE,
    optimization_pipeline: OPTIMIZATION_PIPELINE,
    integrations: {
      wordstat: {
        configured: wordstatConfig().configured,
        regions: wordstatConfig().regions,
      },
      cursor_agents: {
        configured: cursorAgentsConfig().configured,
        repo: cursorAgentsConfig().repoUrl,
        startingRef: cursorAgentsConfig().startingRef,
        default_spawn: DEFAULT_CURSOR_SPAWN_AGENTS,
      },
      tracker: trackerModeInfo(),
      leadgid_postback: leadgidPostbackInstructions(buildLeadgidPostbackUrl(publicTrackerBase())),
      direct: {
        configured: Boolean(process.env.YANDEX_DIRECT_TOKEN && process.env.YANDEX_DIRECT_LOGIN),
        login: process.env.YANDEX_DIRECT_LOGIN || null,
        draft_only: true,
        note: 'Кампания создаётся OFF, без ads.moderate — запуск вручную',
        handbook: {
          help_root: 'https://yandex.ru/support/direct/ru/',
          sources: DIRECT_DOC_SOURCES.length,
        },
      },
      images: imageGenConfig(),
      secrets: {
        from_server: true,
        note: 'Ключи берутся с сервера (SECRETS.env / .env), в UI вводить не нужно',
      },
    },
  });
});

router.get('/runs', (_req, res) => {
  res.json(listRuns(100));
});

router.get('/runs/:id', (req, res) => {
  const run = getRun(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

/**
 * Body: offer fields + options
 * Primary: url (offer link). Name/payout optional — обогащаются с LeadGid/страницы.
 * {
 *   url, name?, payout?, geo?, vertical?, network?, source?, epc?, promo_code?,
 *   daily_budget?, notes?, funnel?, currency?, network_offer_id?,
 *   reference_batch_id?, ad_format?,
 *   dry_run?: bool, apply_direct?: bool (default true if Direct token),
 *   async?: bool, title?: string,
 *   spawn_cursor_agents?: bool, cursor_agents?: string[]
 * }
 */
router.post('/runs', async (req, res, next) => {
  try {
    const body = req.body || {};
    const {
      dry_run: dryRun = false,
      apply_direct: applyDirect,
      async: asyncMode = false,
      spawn_cursor_agents: spawnCursorAgents = false,
      cursor_agents: cursorAgents,
      title,
      ...rawOffer
    } = body;

    if (!rawOffer.name && !rawOffer.offer_name && !rawOffer.url && !rawOffer.offer_url) {
      return res.status(400).json({
        error: 'Укажи ссылку на оффер (url) или name',
      });
    }

    const { offer, enrich } = await enrichOfferInput(rawOffer);
    // Default RUB only when network/currency unknown — never override EUR/USD from affiliate API
    if (!offer.currency) offer.currency = 'RUB';
    // Keep reference batch on offer for creative step
    if (rawOffer.reference_batch_id) {
      offer.reference_batch_id = rawOffer.reference_batch_id;
    }
    const runId = startPipeline(offer, {
      title: title || `Оффер: ${offer.name || offer.url}`,
    });

    const cur = getRun(runId);
    updateRun(runId, {
      context: {
        ...(cur?.context || {}),
        enrich,
        run_id: runId,
        owner_user_id: req.user?.id || null,
        reference_batch_id: offer.reference_batch_id || null,
      },
    });

    const execOpts = {
      dryRun,
      applyDirect,
      spawnCursorAgents,
      cursorAgents: Array.isArray(cursorAgents) ? cursorAgents : undefined,
      ownerUserId: req.user?.id || null,
    };

    if (asyncMode) {
      setImmediate(() => {
        executeRun(runId, execOpts).catch((err) => {
          console.error('pipeline async error', err);
        });
      });
      return res.status(202).json({ id: runId, status: 'pending', message: 'Pipeline started' });
    }

    const run = await executeRun(runId, execOpts);
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

/** Upload creative reference images (base64 JSON). */
router.post('/reference-images', (req, res, next) => {
  try {
    const files = req.body?.files || [];
    const batch = saveReferenceBatch(files, { note: req.body?.note || '' });
    res.status(201).json(batch);
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

/** Authenticated attach of creatives to a run (operator / UI). */
router.post('/runs/:id/attach-creatives', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const run = getRun(id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    const attached = attachCreativesToRun(id, req.body?.images || []);
    const prev = run.context?.creatives || {};
    const merged = mergeGeneratedImages(prev.generated_images || [], attached.generated_images);
    const verticalKey =
      run.context?.playbook?.vertical_key || run.context?.analysis?.vertical_key || '';
    const qa = validateCreatives(prev.briefs || [], {
      verticalKey,
      requireImages: true,
      generatedImages: merged,
    });
    updateRun(id, {
      context: {
        ...(run.context || {}),
        creatives: {
          ...prev,
          generated_images: merged,
          awaiting_agent_images: false,
          qa,
          last_attach_at: new Date().toISOString(),
        },
      },
    });
    res.json({ ok: true, files: attached.files, images_ok: merged.filter((g) => g.ok).length, qa });
  } catch (err) {
    next(err);
  }
});

/** Re-apply Direct draft using creatives already on the run. */
router.post('/runs/:id/apply-direct', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const run = getRun(id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    const result = await runDirect({
      offer: run.offer_input || {},
      context: { ...(run.context || {}), run_id: id },
      apply: true,
    });
    const context = {
      ...(run.context || {}),
      ...(result.context_patch || {}),
      direct: result.direct || result.context_patch?.direct || run.context?.direct,
    };
    updateRun(id, {
      context,
      status: result.failed ? 'failed' : run.status === 'failed' && !result.failed ? 'done' : run.status,
      error: result.failed ? result.summary : '',
    });
    res.json({ run: getRun(id), direct: result });
  } catch (err) {
    next(err);
  }
});
/** Re-spawn Cursor agents for an existing finished run */
router.post('/runs/:id/spawn-cursor', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const run = getRun(id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    const result = await maybeSpawnCursorAgents(id, {
      spawnCursorAgents: true,
      cursorAgents: req.body?.cursor_agents,
      autoCreatePR: req.body?.auto_create_pr,
    });
    res.json({ run: getRun(id), spawn: result });
  } catch (err) {
    next(err);
  }
});

router.post('/runs/:id/retry', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const run = getRun(id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    // Drop cached facts so analyst rebuilds geo/region_ids with current extractors.
    const offerInput = { ...(run.offer_input || {}) };
    delete offerInput.facts;
    const newId = startPipeline(offerInput, { title: `Retry: ${run.title}` });
    const result = await executeRun(newId, {
      dryRun: Boolean(req.body?.dry_run),
      applyDirect: req.body?.apply_direct,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** Campaigns in Direct that traffic analyst can watch (moderated / serving). */
router.get('/traffic/campaigns', async (_req, res, next) => {
  try {
    const listed = await listModeratedDirectCampaigns();
    res.json(listed);
  } catch (err) {
    next(err);
  }
});

/** Mini-reports: what traffic analyst did on recent runs. */
router.get('/traffic/reports', (_req, res) => {
  const reports = listRuns(60)
    .filter(
      (r) =>
        r.context?.kind === 'traffic_optimization' ||
        r.context?.traffic_analysis ||
        r.context?.mini_report ||
        /^Трафик:/i.test(r.title || ''),
    )
    .slice(0, 12)
    .map((r) => {
      const mini =
        r.context?.mini_report ||
        (r.context?.traffic_analysis
          ? buildTrafficMiniReport(r.context.traffic_analysis, {
              summary: r.title,
            })
          : null);
      return {
        run_id: r.id,
        title: r.title,
        status: r.status,
        updated_at: r.updated_at || r.created_at,
        created_at: r.created_at,
        error: r.error || '',
        report: mini,
      };
    });
  res.json({ reports });
});

/**
 * Post-launch traffic optimization.
 * Body: {
 *   direct_campaign_ids?: string[],
 *   apply?: bool,           // exclude junk placements in Direct
 *   dry_run?: bool,
 *   date_from?: YYYY-MM-DD,
 *   date_to?: YYYY-MM-DD,
 *   min_clicks?: number,
 *   max_cost_no_conv?: number
 * }
 */
router.post('/traffic/runs', async (req, res, next) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.direct_campaign_ids)
      ? body.direct_campaign_ids.map(String)
      : body.direct_campaign_id
        ? [String(body.direct_campaign_id)]
        : [];

    const run = await runTrafficOptimization({
      directCampaignIds: ids,
      applyTraffic: Boolean(body.apply),
      dryRun: Boolean(body.dry_run),
      dateFrom: body.date_from || undefined,
      dateTo: body.date_to || undefined,
      minClicks: body.min_clicks,
      maxCostNoConv: body.max_cost_no_conv,
      ownerUserId: req.user?.id || null,
      title: body.title,
    });
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

/** Playbook schedule (day 0 / 2–3 / 5–7) for moderated campaigns. */
router.get('/traffic/schedule', async (req, res, next) => {
  try {
    const listed = await listModeratedDirectCampaigns();
    const items = (listed.campaigns || []).map((c) => {
      const tracker = findTrackerByDirectCampaignId(c.id, req.user?.id) ||
        findTrackerByDirectCampaignId(c.id);
      const advice = scheduleAdvice({
        createdAt: tracker?.created_at,
        moderated: c.moderated,
        serving: c.serving,
      });
      return {
        direct: c,
        tracker: tracker
          ? { id: tracker.id, name: tracker.name, key: tracker.key, created_at: tracker.created_at }
          : null,
        ...advice,
      };
    });
    res.json({
      ok: true,
      playbook: OPTIMIZATION_SCHEDULE,
      campaigns: items,
      due_for_analyst: items.filter((i) => i.ready_for_traffic_analyst).map((i) => i.direct.id),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Run traffic analyst «по расписанию» for campaigns in day 2–7 phases.
 * Body: { apply?: bool, dry_run?: bool }
 */
router.post('/traffic/schedule/run', async (req, res, next) => {
  try {
    const body = req.body || {};
    const listed = await listModeratedDirectCampaigns();
    const due = (listed.campaigns || [])
      .filter((c) => c.moderated)
      .map((c) => {
        const tracker = findTrackerByDirectCampaignId(c.id, req.user?.id) ||
          findTrackerByDirectCampaignId(c.id);
        const day = daysSince(tracker?.created_at);
        return { id: c.id, day: day ?? 3, ready: (day ?? 3) >= 2 };
      })
      .filter((c) => c.ready)
      .map((c) => c.id);

    if (!due.length) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'нет кампаний в фазе день 2+',
        playbook: OPTIMIZATION_SCHEDULE,
      });
    }

    const run = await runTrafficOptimization({
      directCampaignIds: due,
      applyTraffic: Boolean(body.apply),
      dryRun: Boolean(body.dry_run),
      ownerUserId: req.user?.id || null,
      title: `Трафик по расписанию: ${due.slice(0, 3).join(', ')}`,
    });
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

export default router;
