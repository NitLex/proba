/**
 * Launch Cursor Cloud Agents via API.
 * Docs: https://cursor.com/docs/cloud-agent/api/endpoints
 *
 * Env:
 *   CURSOR_API_KEY          — Dashboard → API Keys / Cloud Agents key
 *   CURSOR_REPO_URL         — https://github.com/org/repo
 *   CURSOR_STARTING_REF     — branch or SHA (default: main)
 *   CURSOR_AUTO_CREATE_PR   — true/false
 *   CURSOR_AGENT_MODEL      — optional model id
 *   CURSOR_AGENTS_API_BASE  — default https://api.cursor.com
 */

export function cursorAgentsConfig() {
  const apiKey = process.env.CURSOR_API_KEY || process.env.CURSOR_CLOUD_API_KEY || '';
  const repoUrl =
    process.env.CURSOR_REPO_URL ||
    process.env.GITHUB_REPO_URL ||
    'https://github.com/NitLex/proba';
  const startingRef =
    process.env.CURSOR_STARTING_REF ||
    process.env.CURSOR_BRANCH ||
    'main';
  const autoCreatePR = String(process.env.CURSOR_AUTO_CREATE_PR || 'false').toLowerCase() === 'true';
  const model = process.env.CURSOR_AGENT_MODEL || '';
  const base = (process.env.CURSOR_AGENTS_API_BASE || 'https://api.cursor.com').replace(/\/$/, '');
  return {
    apiKey,
    repoUrl,
    startingRef,
    autoCreatePR,
    model,
    base,
    configured: Boolean(apiKey && repoUrl),
  };
}

function authHeaders(apiKey) {
  // Basic auth with empty password is the documented form (-u KEY:)
  const basic = Buffer.from(`${apiKey}:`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a cloud agent (v1 API). Falls back to legacy v0 on 404.
 */
export async function launchCursorAgent({
  prompt,
  name,
  repoUrl,
  startingRef,
  autoCreatePR,
  model,
} = {}) {
  const cfg = cursorAgentsConfig();
  if (!cfg.apiKey) {
    return { ok: false, skipped: true, reason: 'CURSOR_API_KEY missing' };
  }
  if (!prompt) {
    return { ok: false, skipped: true, reason: 'empty prompt' };
  }

  const bodyV1 = {
    prompt: { text: String(prompt).slice(0, 100_000) },
    name: (name || 'ArbTrack pipeline agent').slice(0, 100),
    repos: [
      {
        url: repoUrl || cfg.repoUrl,
        startingRef: startingRef || cfg.startingRef,
      },
    ],
    autoCreatePR: autoCreatePR ?? cfg.autoCreatePR,
  };
  if (model || cfg.model) {
    bodyV1.model = { id: model || cfg.model };
  }

  const tryV1 = await fetchJson(`${cfg.base}/v1/agents`, {
    method: 'POST',
    headers: authHeaders(cfg.apiKey),
    body: JSON.stringify(bodyV1),
  });

  if (tryV1.ok) {
    const agent = tryV1.data?.agent || tryV1.data;
    return {
      ok: true,
      api: 'v1',
      agent_id: agent?.id || tryV1.data?.id,
      url: agent?.url || (agent?.id ? `https://cursor.com/agents/${agent.id}` : null),
      run: tryV1.data?.run || null,
      raw: tryV1.data,
    };
  }

  // Legacy v0
  const bodyV0 = {
    prompt: { text: String(prompt).slice(0, 100_000) },
    source: {
      repository: repoUrl || cfg.repoUrl,
      ref: startingRef || cfg.startingRef,
    },
    target: {
      autoCreatePr: autoCreatePR ?? cfg.autoCreatePR,
    },
  };
  if (model || cfg.model) bodyV0.model = model || cfg.model;

  const tryV0 = await fetchJson(`${cfg.base}/v0/agents`, {
    method: 'POST',
    headers: authHeaders(cfg.apiKey),
    body: JSON.stringify(bodyV0),
  });

  if (tryV0.ok) {
    const id = tryV0.data?.id || tryV0.data?.agentId;
    return {
      ok: true,
      api: 'v0',
      agent_id: id,
      url: tryV0.data?.target?.url || (id ? `https://cursor.com/agents/${id}` : null),
      raw: tryV0.data,
    };
  }

  return {
    ok: false,
    error: tryV1.error || tryV0.error || 'Cursor Agents API failed',
    status: tryV0.status || tryV1.status,
    details: { v1: tryV1.data, v0: tryV0.data },
  };
}

async function fetchJson(url, init) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.message || data.error || data.raw || `HTTP ${res.status}`,
        data,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

/** Default agents that get a Cursor cloud follow-up after local step. */
export const DEFAULT_CURSOR_SPAWN_AGENTS = ['wordstat', 'creative', 'direct'];

/**
 * Spawn Cursor agents for completed pipeline steps that have cursor_prompt.
 */
export async function spawnCursorForPipelineSteps(steps, options = {}) {
  const cfg = cursorAgentsConfig();
  if (!cfg.configured && !options.force) {
    return {
      skipped: true,
      reason: 'CURSOR_API_KEY or CURSOR_REPO_URL missing',
      launches: [],
    };
  }

  const allow = new Set(
    options.agents?.length ? options.agents : DEFAULT_CURSOR_SPAWN_AGENTS,
  );
  const launches = [];

  for (const step of steps) {
    if (step.status !== 'done') continue;
    if (!allow.has(step.agent)) continue;
    const prompt = step.output?.cursor_prompt;
    if (!prompt) continue;

    const enriched = [
      `# ArbTrack pipeline → агент «${step.agent}»`,
      `Run step: ${step.title}`,
      '',
      prompt,
      '',
      '## Контекст шага (JSON)',
      '```json',
      JSON.stringify(
        {
          agent: step.agent,
          summary: step.output?.summary,
          playbook: step.output?.playbook,
          semantics: step.output?.semantics,
          creatives: step.output?.creatives,
          tracker: step.output?.tracker,
          direct: step.output?.direct,
        },
        null,
        2,
      ).slice(0, 40_000),
      '```',
      '',
      'Сделай конкретные изменения в репозитории (креативы / скрипты / конфиги) или подготовь артефакты. Закоммить на feature-ветку.',
    ].join('\n');

    const result = await launchCursorAgent({
      prompt: enriched,
      name: `PPM ${step.agent}: ${(step.title || '').slice(0, 60)}`,
      repoUrl: options.repoUrl,
      startingRef: options.startingRef,
      autoCreatePR: options.autoCreatePR,
      model: options.model,
    });

    launches.push({
      agent: step.agent,
      step_id: step.id,
      ...result,
    });
  }

  return { skipped: false, launches };
}
