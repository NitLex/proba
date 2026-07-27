/**
 * HTTP client for remote ArbTrack (https://trekerarbitrag.ru).
 * Used by pipeline tracker-agent so local orchestrator can configure prod tracker.
 */

export function remoteBase() {
  return (process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru').replace(/\/$/, '');
}

export function remoteConfigured() {
  const user = process.env.ARBTRACK_USERNAME || process.env.ARBTRACK_LOGIN || '';
  const pass = process.env.ARBTRACK_PASSWORD || '';
  return Boolean(user && pass);
}

async function request(token, method, pathname, body) {
  const res = await fetch(`${remoteBase()}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const err = new Error(json?.error || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function remoteLogin() {
  if (!remoteConfigured()) {
    throw new Error('Нет ARBTRACK_USERNAME / ARBTRACK_PASSWORD для удалённого трекера');
  }
  const username = process.env.ARBTRACK_USERNAME || process.env.ARBTRACK_LOGIN;
  const password = process.env.ARBTRACK_PASSWORD;
  const data = await request(null, 'POST', '/api/auth/login', { username, password });
  if (!data?.token) throw new Error('Логин в трекер ок, но token не вернулся');
  return data.token;
}

export async function remoteApi(token, method, pathname, body) {
  return request(token, method, pathname, body);
}
