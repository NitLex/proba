import { getRun, updateRun } from '../pipeline/store.js';
import {
  attachCreativesToRun,
  mergeGeneratedImages,
  verifyIngestToken,
} from '../lib/creativeAssets.js';
import { validateCreatives } from '../lib/creativeQa.js';

/**
 * Public token-gated ingest for Cursor creative agent.
 * Body: { run_id, token, images: [{ angle_id, mime, data_base64, format? }] }
 */
export async function ingestCreativesHandler(req, res) {
  const body = req.body || {};
  const runId = Number(body.run_id);
  const token = body.token || body.ingest_token;
  if (!runId || !token) {
    return res.status(400).json({ error: 'run_id и token обязательны' });
  }
  const run = getRun(runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const hash = run.context?.creative_ingest?.hash;
  if (!verifyIngestToken(token, hash)) {
    return res.status(403).json({ error: 'Неверный ingest token' });
  }

  const attached = attachCreativesToRun(runId, body.images || []);
  const prev = run.context?.creatives || {};
  const merged = mergeGeneratedImages(prev.generated_images || [], attached.generated_images);
  const verticalKey =
    run.context?.playbook?.vertical_key || run.context?.analysis?.vertical_key || '';
  const qa = validateCreatives(prev.briefs || [], {
    verticalKey,
    requireImages: true,
    generatedImages: merged,
  });

  updateRun(runId, {
    context: {
      ...(run.context || {}),
      creative_ingest: run.context?.creative_ingest
        ? {
            ...run.context.creative_ingest,
            // One-time: drop plaintext after successful upload
            token: undefined,
            consumed_at: new Date().toISOString(),
          }
        : run.context?.creative_ingest,
      creatives: {
        ...prev,
        generated_images: merged,
        awaiting_agent_images: false,
        qa,
        last_ingest_at: new Date().toISOString(),
      },
    },
  });

  return res.json({
    ok: true,
    run_id: runId,
    files: attached.files,
    images_ok: merged.filter((g) => g.ok).length,
    qa,
    next: 'POST /api/pipeline/runs/:id/apply-direct — применить объявления с новыми картинками',
  });
}
