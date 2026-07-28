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
  /** JSON body may include large base64 — same as post, kept for clarity */
  postJson: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
};

export function money(n, currency = 'RUB') {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const code = String(currency || 'RUB').toUpperCase();
  const amount = Number(n);
  try {
    if (code === 'USDT') {
      return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} USDT`;
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
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

export function downloadCsvText(csvText, filename) {
  const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build Excel-friendly CSV (semicolon, RU locale). */
export function rowsToCsv(rows, columns, delimiter = ';') {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(delimiter);
  const lines = (rows || []).map((row) =>
    columns.map((c) => escape(typeof c.key === 'function' ? c.key(row) : row[c.key])).join(delimiter),
  );
  return [header, ...lines].join('\r\n');
}

export async function downloadCsv(path, filename) {
  const token = getAuthToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const text = await res.text();
  // If API returned JSON by mistake, surface it
  if (text.trim().startsWith('{')) {
    try {
      const j = JSON.parse(text);
      throw new Error(j.error || 'CSV export failed');
    } catch (e) {
      if (e instanceof SyntaxError) {
        /* fall through */
      } else {
        throw e;
      }
    }
  }
  downloadCsvText(text.replace(/^\uFEFF/, ''), filename);
}
