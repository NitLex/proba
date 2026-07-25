import { DEFAULT_PIPELINE, AGENT_ROLES } from './roles.js';
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

const HANDLERS = {
  analyst: runAnalyst,
  wordstat: runWordstat,
  creative: runCreative,
  tracker: runTracker,
  direct: runDirect,
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

  let context = { ...(run.context || {}) };
  const offer = run.offer_input || {};
  const dryRun = Boolean(options.dryRun);
  const applyDirect = Boolean(options.applyDirect);

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
            const result = await handler({
              offer,
              context: waveContext,
              dryRun,
              apply: step.agent === 'direct' ? applyDirect : undefined,
            });
            const output = {
              summary: result.summary,
              ...(result.playbook ? { playbook: result.playbook } : {}),
              ...(result.semantics ? { semantics: result.semantics } : {}),
              ...(result.creatives ? { creatives: result.creatives } : {}),
              ...(result.tracker ? { tracker: result.tracker } : {}),
              ...(result.direct ? { direct: result.direct } : {}),
              cursor_prompt: result.cursor_prompt,
              agent_role: AGENT_ROLES[step.agent] || { id: step.agent },
            };
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
  } catch (err) {
    updateRun(runId, { status: 'failed', context, error: err.message || String(err) });
  }

  return getRun(runId);
}

export async function runPipeline(offerInput, options = {}) {
  const id = startPipeline(offerInput, options);
  return executeRun(id, options);
}

export { AGENT_ROLES, DEFAULT_PIPELINE, HANDLERS };
