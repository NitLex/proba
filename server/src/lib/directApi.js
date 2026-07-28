/**
 * Yandex Direct JSON API helper.
 * Ad/keyword IDs can exceed Number.MAX_SAFE_INTEGER — parse them as strings.
 */

function quoteLargeInts(text) {
  return String(text).replace(/:(\s*)(-?\d{16,})(\s*[,}\]])/g, ':$1"$2"$3');
}

export function parseDirectJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(quoteLargeInts(text));
  } catch {
    return JSON.parse(text);
  }
}

/** Re-serialize body so stringified big Id fields become raw JSON numbers. */
export function stringifyDirectBody(body) {
  let json = JSON.stringify(body);
  json = json.replace(/"(Id|AdGroupId|CampaignId|KeywordId)":"(\d+)"/g, '"$1":$2');
  return json;
}

function isTransientDirectError(data) {
  const code = Number(data?.error?.error_code || 0);
  // 1000 = temporarily unavailable, 506 = concurrent limit / try later
  return code === 1000 || code === 506;
}

export async function directApi(service, body, { retries = 0 } = {}) {
  const token = process.env.YANDEX_DIRECT_TOKEN;
  const login = process.env.YANDEX_DIRECT_LOGIN;
  if (!token || !login) return { skipped: true, reason: 'no_token' };

  const maxTries = Math.max(1, Number(retries) + 1);
  let last = null;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const res = await fetch(`https://api.direct.yandex.com/json/v5/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Login': login,
        'Accept-Language': 'ru',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: stringifyDirectBody(body),
    });
    const text = await res.text();
    last = parseDirectJson(text);
    if (!isTransientDirectError(last) || attempt === maxTries - 1) return last;
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return last;
}

/** Convenience: Direct calls with transient retry (error 1000/506). */
export async function directApiRetry(service, body, retries = 4) {
  // campaigns.add is NOT idempotent — a transient 1000 after a successful create
  // would spawn duplicate DRAFT campaigns on retry.
  const method = String(body?.method || '').toLowerCase();
  if (service === 'campaigns' && method === 'add') {
    return directApi(service, body, { retries: 0 });
  }
  return directApi(service, body, { retries });
}
