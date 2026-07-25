import { Router } from 'express';
import { AGENT_ROLES, DEFAULT_PIPELINE, executeRun, startPipeline } from '../pipeline/runner.js';
import { getRun, listRuns } from '../pipeline/store.js';

const router = Router();

router.get('/roles', (_req, res) => {
  res.json({ roles: Object.values(AGENT_ROLES), pipeline: DEFAULT_PIPELINE });
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
 * {
 *   name, url, payout, geo, vertical, network, source, epc, promo_code,
 *   daily_budget, notes, funnel, currency, network_offer_id,
 *   dry_run?: bool, apply_direct?: bool, async?: bool, title?: string
 * }
 */
router.post('/runs', async (req, res, next) => {
  try {
    const body = req.body || {};
    const {
      dry_run: dryRun = false,
      apply_direct: applyDirect = false,
      async: asyncMode = false,
      title,
      ...offer
    } = body;

    if (!offer.name && !offer.offer_name && !offer.url) {
      return res.status(400).json({
        error: 'Укажи хотя бы name или url оффера',
      });
    }

    const runId = startPipeline(offer, { title });

    if (asyncMode) {
      setImmediate(() => {
        executeRun(runId, { dryRun, applyDirect }).catch((err) => {
          console.error('pipeline async error', err);
        });
      });
      return res.status(202).json({ id: runId, status: 'pending', message: 'Pipeline started' });
    }

    const run = await executeRun(runId, { dryRun, applyDirect });
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

router.post('/runs/:id/retry', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const run = getRun(id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    // Re-execute only works cleanly for failed runs by resetting pending — simple path: full re-run new
    const newId = startPipeline(run.offer_input, { title: `Retry: ${run.title}` });
    const result = await executeRun(newId, {
      dryRun: Boolean(req.body?.dry_run),
      applyDirect: Boolean(req.body?.apply_direct),
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
