import { DEFAULT_PIPELINE, OPTIMIZATION_PIPELINE, AGENT_ROLES } from './roles.js';
import {
  createRun,
  getRun,
  getSteps,
  updateRun,
  updateStep,
} from './store.js';
import { runAnalyst } from './agents/analyst.js';
import { runWordstat } from './agents/wordstat.js';
import { runCreative } from './agents/creative.js';
import { runTracker } from './agents/tracker.js';
import { runDirect } from './agents/direct.js';
import { runQa } from './agents/qa.js';
import { runTrafficAnalyst } from './agents/trafficAnalyst.js';
import { maybeSpawnCursorAgents } from './spawnCursor.js';

const HANDLERS = {
  analyst: runAnalyst,
  wordstat: runWordstat,
  creative: runCreative,
  tracker: runTracker,
  direct: runDirect,
  qa: runQa,
  traffic_analyst: runTrafficAnalyst,
};

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function startPipeline(offerInput = {}, options = {}) {
  const title =
    options.title ||
    `Запуск: ${offerInput.name || offerInput.offer_name || 'оффер'} / ${offerInput.geo || 'geo?'}`;

  const steps = (options.pipeline || DEFAULT_PIPELINE).map((s) => ({
    agent: s.agent,
    title: s.title || AGENT_ROLES[s.agent]?.name || s.agent,
    dependsOn: s.dependsOn || [],
  }));

  const runId = createRun({ title, offerInput, steps });
  return runId;
}

function depsSatisfied(step, stepsByAgent) {
  const deps = step.depends_on || [];
  return deps.every((agent) => stepsByAgent[agent]?.status === 'done');
}

export async function executeRun(runId, options = {}) {
  const run = getRun(runId);
  if (!run) throw new Error('Run not found');

  updateRun(runId, { status: 'running', error: '' });

  let context = { ...(run.context || {}), run_id: runId };
  const offer = run.offer_input || {};
  const dryRun = Boolean(options.dryRun);
  // Default: create Direct draft when token is present (never moderate).
  // dry-run never touches Direct unless applyDirect is explicitly true.
  const applyDirect =
    options.applyDirect !== undefined
      ? Boolean(options.applyDirect)
      : !dryRun &&
        Boolean(process.env.YANDEX_DIRECT_TOKEN && process.env.YANDEX_DIRECT_LOGIN);

  try {
    // Wave execution: repeatedly pick pending steps whose deps are done
    for (let guard = 0; guard < 20; guard++) {
      const steps = getSteps(runId);
      const byAgent = Object.fromEntries(steps.map((s) => [s.agent, s]));
      const pending = steps.filter((s) => s.status === 'pending' || s.status === 'failed');
      if (!pending.length) break;

      const ready = pending.filter((s) => depsSatisfied(s, byAgent));
      if (!ready.length) {
        const blocked = pending.map((s) => s.agent).join(', ');
        throw new Error(`Pipeline stuck, blocked steps: ${blocked}`);
      }

      // Parallel within wave; merge context patches after the wave
      const waveContext = { ...context };
      const results = await Promise.all(
        ready.map(async (step) => {
          updateStep(step.id, { status: 'running', started_at: nowIso(), error: '' });
          const handler = HANDLERS[step.agent];
          if (!handler) {
            updateStep(step.id, {
              status: 'failed',
              error: `Unknown agent ${step.agent}`,
              finished_at: nowIso(),
            });
            throw new Error(`Unknown agent ${step.agent}`);
          }
          try {
            const applyTraffic =
              options.applyTraffic !== undefined
                ? Boolean(options.applyTraffic)
                : false;
            const result = await handler({
              offer,
              context: waveContext,
              dryRun,
              apply:
                step.agent === 'direct'
                  ? applyDirect
                  : step.agent === 'traffic_analyst'
                    ? applyTraffic
                    : undefined,
              ownerUserId: options.ownerUserId || waveContext.owner_user_id || null,
            });
            const output = {
              summary: result.summary,
              ...(result.playbook ? { playbook: result.playbook } : {}),
              ...(result.semantics ? { semantics: result.semantics } : {}),
              ...(result.creatives ? { creatives: result.creatives } : {}),
              ...(result.tracker ? { tracker: result.tracker } : {}),
              ...(result.direct ? { direct: result.direct } : {}),
              ...(result.qa ? { qa: result.qa } : {}),
              ...(result.traffic_analysis ? { traffic_analysis: result.traffic_analysis } : {}),
              ...(result.ready_message ? { ready_message: result.ready_message } : {}),
              cursor_prompt: result.cursor_prompt,
              agent_role: AGENT_ROLES[step.agent] || { id: step.agent },
            };
            if (result?.failed) {
              updateStep(step.id, {
                status: 'failed',
                input: { offer_keys: Object.keys(offer) },
                output,
                error: result.summary || 'agent failed',
                finished_at: nowIso(),
              });
              return result;
            }
            updateStep(step.id, {
              status: 'done',
              input: { offer_keys: Object.keys(offer) },
              output,
              finished_at: nowIso(),
            });
            return result;
          } catch (err) {
            updateStep(step.id, {
              status: 'failed',
              error: err.message || String(err),
              finished_at: nowIso(),
            });
            throw err;
          }
        }),
      );

      for (const result of results) {
        if (result?.context_patch) context = { ...context, ...result.context_patch };
      }
      updateRun(runId, { context });
    }

    const finalSteps = getSteps(runId);
    const failed = finalSteps.filter((s) => s.status === 'failed');
    if (failed.length) {
      updateRun(runId, {
        status: 'failed',
        context,
        error: failed.map((s) => `${s.agent}: ${s.error}`).join('; '),
      });
    } else {
      updateRun(runId, { status: 'done', context, error: '' });
    }

    // Auto-launch Cursor cloud agents for follow-up work (creative / wordstat / direct)
    if (options.spawnCursorAgents && !failed.length) {
      try {
        await maybeSpawnCursorAgents(runId, {
          spawnCursorAgents: true,
          cursorAgents: options.cursorAgents,
          repoUrl: options.repoUrl,
          startingRef: options.startingRef,
          autoCreatePR: options.autoCreatePR,
          model: options.model,
        });
      } catch (spawnErr) {
        const cur = getRun(runId);
        updateRun(runId, {
          context: {
            ...(cur?.context || context),
            cursor_spawn_error: spawnErr.message || String(spawnErr),
          },
        });
      }
    }
  } catch (err) {
    updateRun(runId, { status: 'failed', context, error: err.message || String(err) });
  }

  return getRun(runId);
}

export async function runPipeline(offerInput, options = {}) {
  const id = startPipeline(offerInput, options);
  return executeRun(id, options);
}

/** Post-launch traffic optimization run (traffic_analyst only). */
export async function runTrafficOptimization(options = {}) {
  const ids = (options.directCampaignIds || []).map(String).filter(Boolean);
  const title =
    options.title ||
    (ids.length
      ? `Трафик: кампании ${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '…' : ''}`
      : 'Трафик: модерированные кампании');

  const runId = startPipeline(
    {
      name: 'Traffic optimization',
      direct_campaign_ids: ids,
      geo: options.geo || 'RU',
    },
    { title, pipeline: OPTIMIZATION_PIPELINE },
  );

  const cur = getRun(runId);
  updateRun(runId, {
    context: {
      ...(cur?.context || {}),
      run_id: runId,
      owner_user_id: options.ownerUserId || null,
      direct_campaign_ids: ids,
      traffic_date_from: options.dateFrom || null,
      traffic_date_to: options.dateTo || null,
      traffic_min_clicks: options.minClicks,
      traffic_max_cost_no_conv: options.maxCostNoConv,
      kind: 'traffic_optimization',
    },
  });

  return executeRun(runId, {
    dryRun: Boolean(options.dryRun),
    applyDirect: false,
    applyTraffic: Boolean(options.applyTraffic),
    ownerUserId: options.ownerUserId || null,
  });
}

export { AGENT_ROLES, DEFAULT_PIPELINE, OPTIMIZATION_PIPELINE, HANDLERS };
