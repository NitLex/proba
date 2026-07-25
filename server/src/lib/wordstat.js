/**
 * Live Yandex Wordstat via Yandex Cloud Search API v2.
 * Docs: https://yandex.cloud/docs/search-api/concepts/wordstat
 *
 * Env (any alias works):
 *   YANDEX_CLOUD_API_KEY / WORDSTAT_API_KEY / WORDSTAT_TOKEN
 *   YANDEX_CLOUD_FOLDER_ID / WORDSTAT_FOLDER_ID
 *
 * Optional:
 *   WORDSTAT_REGIONS=225   (comma-separated region ids; 225 = Russia)
 *   WORDSTAT_NUM_PHRASES=25
 */

const ROOT = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';

export function wordstatConfig() {
  const apiKey =
    process.env.YANDEX_CLOUD_API_KEY ||
    process.env.WORDSTAT_API_KEY ||
    process.env.WORDSTAT_TOKEN ||
    process.env.YANDEX_WORDSTAT_TOKEN ||
    '';
  const folderId =
    process.env.YANDEX_CLOUD_FOLDER_ID ||
    process.env.WORDSTAT_FOLDER_ID ||
    process.env.YANDEX_CLOUD_FOLDER ||
    '';
  const regions = String(process.env.WORDSTAT_REGIONS || '225')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const numPhrases = Math.min(
    100,
    Math.max(5, Number(process.env.WORDSTAT_NUM_PHRASES || 25) || 25),
  );
  return {
    apiKey,
    folderId,
    regions,
    numPhrases,
    configured: Boolean(apiKey && folderId),
  };
}

async function postWordstat(path, body, apiKey) {
  const res = await fetch(`${ROOT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      data?.raw ||
      `HTTP ${res.status}`;
    const err = new Error(`Wordstat ${path}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function toCount(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeTopResponse(data, phrase) {
  const results = (data.results || data.topRequests || []).map((r) => ({
    phrase: r.phrase || r.request || r.text || '',
    shows: toCount(r.count ?? r.shows ?? r.totalCount),
    kind: 'result',
  }));
  const associations = (data.associations || []).map((r) => ({
    phrase: r.phrase || r.request || r.text || '',
    shows: toCount(r.count ?? r.shows ?? r.totalCount),
    kind: 'association',
  }));
  return {
    seed: phrase,
    totalCount: toCount(data.totalCount ?? data.total_count),
    results,
    associations,
  };
}

/**
 * Fetch top requests + associations for one phrase.
 */
export async function fetchTopRequests(phrase, opts = {}) {
  const cfg = { ...wordstatConfig(), ...opts };
  if (!cfg.configured && !(opts.apiKey && opts.folderId)) {
    throw new Error('Wordstat not configured: need API key + folderId');
  }
  const apiKey = opts.apiKey || cfg.apiKey;
  const folderId = opts.folderId || cfg.folderId;
  const body = {
    phrase,
    folderId,
    numPhrases: opts.numPhrases || cfg.numPhrases,
  };
  if ((opts.regions || cfg.regions)?.length) {
    body.regions = opts.regions || cfg.regions;
  }
  const data = await postWordstat('/topRequests', body, apiKey);
  return normalizeTopResponse(data, phrase);
}

/**
 * Expand a list of seed phrases via live Wordstat (with small delay).
 */
export async function expandSeeds(seeds, opts = {}) {
  const cfg = wordstatConfig();
  if (!cfg.configured) {
    return { mode: 'unconfigured', items: [], errors: [] };
  }

  const delayMs = Number(process.env.WORDSTAT_DELAY_MS || 200);
  const maxSeeds = Math.min(seeds.length, Number(process.env.WORDSTAT_MAX_SEEDS || 8));
  const items = [];
  const errors = [];
  const seen = new Set();

  for (const seed of seeds.slice(0, maxSeeds)) {
    if (!seed || seen.has(seed)) continue;
    seen.add(seed);
    try {
      const top = await fetchTopRequests(seed, opts);
      items.push(top);
      for (const row of [...top.results, ...top.associations]) {
        if (row.phrase) seen.add(row.phrase);
      }
    } catch (err) {
      errors.push({ seed, error: err.message });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  // Flatten unique keywords sorted by shows desc
  const byPhrase = new Map();
  for (const block of items) {
    for (const row of [...block.results, ...block.associations]) {
      if (!row.phrase) continue;
      const prev = byPhrase.get(row.phrase);
      if (!prev || (row.shows || 0) > (prev.shows || 0)) {
        byPhrase.set(row.phrase, {
          phrase: row.phrase,
          shows: row.shows,
          kind: row.kind,
          seed: block.seed,
        });
      }
    }
  }

  const keywords = [...byPhrase.values()].sort(
    (a, b) => (b.shows || 0) - (a.shows || 0),
  );

  return {
    mode: errors.length && !items.length ? 'error' : 'live',
    items,
    keywords,
    errors,
    config: { folderId: cfg.folderId, regions: cfg.regions, maxSeeds },
  };
}
