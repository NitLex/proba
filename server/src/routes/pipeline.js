import { Router } from 'express';
import { requireRegistered } from '../middleware/auth.js';
import { AGENT_ROLES, DEFAULT_PIPELINE, executeRun, startPipeline } from '../pipeline/runner.js';
import { getRun, listRuns, updateRun } from '../pipeline/store.js';
import { wordstatConfig } from '../lib/wordstat.js';
import { cursorAgentsConfig, DEFAULT_CURSOR_SPAWN_AGENTS } from '../lib/cursorAgents.js';
import { remoteBase, remoteConfigured } from '../lib/arbtrackRemote.js';
import { maybeSpawnCursorAgents } from '../pipeline/spawnCursor.js';
import { imageGenConfig } from '../lib/imageGen.js';
import { enrichOfferInput } from '../lib/offerEnrich.js';
import {
  buildLeadgidPostbackUrl,
  leadgidPostbackInstructions,
  publicTrackerBase,
} from '../lib/leadgidPostback.js';
import { DIRECT_DOC_SOURCES } from '../pipeline/knowledge/direct-handbook.js';

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
    const runId = startPipeline(offer, {
      title: title || `Оффер: ${offer.name || offer.url}`,
    });

    const cur = getRun(runId);
    updateRun(runId, { context: { ...(cur?.context || {}), enrich, run_id: runId } });

    const execOpts = {
      dryRun,
      applyDirect,
      spawnCursorAgents,
      cursorAgents: Array.isArray(cursorAgents) ? cursorAgents : undefined,
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
    const newId = startPipeline(run.offer_input, { title: `Retry: ${run.title}` });
    const result = await executeRun(newId, {
      dryRun: Boolean(req.body?.dry_run),
      applyDirect: req.body?.apply_direct,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
