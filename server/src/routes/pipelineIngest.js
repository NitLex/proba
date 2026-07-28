import { getRun, updateRun } from '../pipeline/store.js';
import {
  attachCreativesToRun,
  mergeGeneratedImages,
  verifyIngestToken,
} from '../lib/creativeAssets.js';
import { validateCreatives } from '../lib/creativeQa.js';

/**
 * Merge agent-supplied Title/Text into existing creative briefs (by angle_id).
 * Used when Cursor creative agent corrects copy for Direct moderation.
 */
export function mergeBriefCopy(existing = [], patch = []) {
  if (!Array.isArray(patch) || !patch.length) return existing || [];
  const byId = new Map((existing || []).map((b) => [b.angle_id, { ...b }]));
  for (const p of patch) {
    if (!p?.angle_id) continue;
    const prev = byId.get(p.angle_id) || { angle_id: p.angle_id };
    const next = { ...prev };
    if (Array.isArray(p.titles) && p.titles.length) {
      next.titles = p.titles.map((t) => String(t).slice(0, 56));
    }
    if (Array.isArray(p.texts) && p.texts.length) {
      next.texts = p.texts.map((t) => String(t).slice(0, 81));
    }
    if (Array.isArray(p.callouts) && p.callouts.length) next.callouts = p.callouts;
    if (Array.isArray(p.sitelinks) && p.sitelinks.length) next.sitelinks = p.sitelinks;
    if (Array.isArray(p.overlay_lines)) next.overlay_lines = p.overlay_lines;
    byId.set(p.angle_id, next);
  }
  // Preserve order of existing briefs; append unknown angle patches at end
  const ordered = [];
  const seen = new Set();
  for (const b of existing || []) {
    ordered.push(byId.get(b.angle_id) || b);
    seen.add(b.angle_id);
  }
  for (const [id, b] of byId) {
    if (!seen.has(id)) ordered.push(b);
  }
  return ordered;
}

/**
 * Public token-gated ingest for Cursor creative agent.
 * Body: {
 *   run_id, token,
 *   images: [{ angle_id, mime, data_base64, format? }],
 *   briefs?: [{ angle_id, titles?, texts?, callouts?, sitelinks? }]  // optional copy patch
 * }
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
  const hashes = [
    ...new Set(
      [...(run.context?.creative_ingest?.hashes || []), hash].filter(Boolean).map(String),
    ),
  ];
  if (!verifyIngestToken(token, hashes.length ? hashes : hash)) {
    return res.status(403).json({
      error: 'Неверный ingest token',
      hint:
        'Параллельные creative-спавны могли сменить hash. Возьми актуальный creative_ingest.token из run context или attach через UI.',
    });
  }

  const attached = attachCreativesToRun(runId, body.images || []);
  const prev = run.context?.creatives || {};
  const merged = mergeGeneratedImages(prev.generated_images || [], attached.generated_images);
  const briefs = mergeBriefCopy(prev.briefs || [], body.briefs || body.copy || []);
  const verticalKey =
    run.context?.playbook?.vertical_key || run.context?.analysis?.vertical_key || '';
  const qa = validateCreatives(briefs, {
    verticalKey,
    requireImages: true,
    generatedImages: merged,
  });

  updateRun(runId, {
    context: {
      ...(run.context || {}),
      creatives: {
        ...prev,
        briefs,
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
    briefs_patched: Boolean((body.briefs || body.copy || []).length),
    qa,
    next: 'POST /api/pipeline/runs/:id/apply-direct — применить объявления с новыми картинками',
  });
}
