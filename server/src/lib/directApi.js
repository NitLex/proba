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

export async function directApi(service, body) {
  const token = process.env.YANDEX_DIRECT_TOKEN;
  const login = process.env.YANDEX_DIRECT_LOGIN;
  if (!token || !login) return { skipped: true, reason: 'no_token' };

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
  return parseDirectJson(text);
}
