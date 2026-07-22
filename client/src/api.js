const BASE = '';
const TOKEN_KEY = 'arbtrack_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
      clearAuthToken();
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export function money(n, currency = 'USD') {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

export function pct(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(2)}%`;
}

export function num(n) {
  return new Intl.NumberFormat('ru-RU').format(Number(n || 0));
}

export function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
