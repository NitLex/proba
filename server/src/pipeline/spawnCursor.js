import { getSteps, updateRun, updateStep, getRun } from './store.js';
import { spawnCursorForPipelineSteps } from '../lib/cursorAgents.js';

/**
 * After a pipeline run finishes, launch Cursor cloud agents for selected steps.
 */
export async function maybeSpawnCursorAgents(runId, options = {}) {
  if (!options.spawnCursorAgents) {
    return { skipped: true, reason: 'spawn_cursor_agents disabled' };
  }

  const steps = getSteps(runId);
  const result = await spawnCursorForPipelineSteps(steps, {
    agents: options.cursorAgents,
    repoUrl: options.repoUrl,
    startingRef: options.startingRef,
    autoCreatePR: options.autoCreatePR,
    model: options.model,
  });

  // Attach launch info onto each step output + run context
  const run = getRun(runId);
  const context = { ...(run?.context || {}), cursor_launches: result.launches || [], cursor_spawn: result };

  for (const launch of result.launches || []) {
    const step = steps.find((s) => s.id === launch.step_id);
    if (!step) continue;
    updateStep(step.id, {
      output: {
        ...(step.output || {}),
        cursor_agent: {
          ok: launch.ok,
          agent_id: launch.agent_id,
          url: launch.url,
          api: launch.api,
          error: launch.error,
          skipped: launch.skipped,
          reason: launch.reason,
        },
      },
    });
  }

  updateRun(runId, { context });
  return result;
}
