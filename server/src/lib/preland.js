/**
 * Simple preland HTML generator for card/loan angles (РСЯ quality lever).
 * Served at /preland/:slug — tracker landing URL points here.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELAND_DIR = path.resolve(__dirname, '../../../prelands');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function templateHtml({ title, headline, sub, cta, brand, verticalKey }) {
  const loan = verticalKey === 'fintech_loans';
  const bg = loan
    ? 'linear-gradient(160deg, #0f2a1f 0%, #1a4d3a 45%, #0d1f18 100%)'
    : 'linear-gradient(160deg, #0b1c2c 0%, #163a5f 45%, #0a1624 100%)';
  const accent = loan ? '#3dd68c' : '#4da3ff';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; font-family: "Segoe UI", system-ui, sans-serif;
    background: ${bg}; color: #f4f7fb;
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
  }
  .wrap { max-width: 420px; width: 100%; text-align: center; }
  .brand { font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; margin-bottom: 1rem; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.1rem); line-height: 1.2; margin: 0 0 0.75rem; font-weight: 700; }
  p { margin: 0 0 1.75rem; opacity: 0.85; line-height: 1.45; font-size: 1.05rem; }
  a.cta {
    display: inline-block; padding: 0.95rem 1.6rem; border-radius: 10px;
    background: var(--accent); color: #041018; font-weight: 700; text-decoration: none;
    font-size: 1.05rem; transition: transform .15s ease, filter .15s;
  }
  a.cta:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .fine { margin-top: 1.5rem; font-size: 0.75rem; opacity: 0.55; }
</style>
</head>
<body>
  <main class="wrap">
    <div class="brand">${escapeHtml(brand)}</div>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(sub)}</p>
    <a class="cta" id="go" href="#">${escapeHtml(cta)}</a>
    <p class="fine">Реклама. Условия на сайте партнёра.</p>
  </main>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var clickid = q.get('clickid') || '';
  var ck = q.get('ck') || '';
  var base = location.origin;
  var href = base + '/to-offer?clickid=' + encodeURIComponent(clickid);
  if (ck) href += '&ck=' + encodeURIComponent(ck);
  document.getElementById('go').href = href;
})();
</script>
</body>
</html>`;
}

function copyForVertical(verticalKey, offer = {}, angle = {}) {
  const brand = String(offer.name || 'Оффер').slice(0, 40);
  if (verticalKey === 'fintech_loans') {
    return {
      title: `${brand} — онлайн-займ`,
      headline: angle.title || 'Займ онлайн на карту',
      sub: 'Оформление за минуты. Условия и решение — на сайте.',
      cta: 'Оформить заявку',
      brand,
    };
  }
  return {
    title: `${brand} — зарубежная карта`,
    headline: angle.title || 'Зарубежная карта онлайн',
    sub: 'Выпуск зарубежной карты. Пополнение по СБП. Оформление онлайн.',
    cta: 'Оформить карту',
    brand,
  };
}

/**
 * Write preland HTML and return public path + absolute URL.
 */
export function generatePreland({
  offer = {},
  angle = {},
  verticalKey = '',
  runId = 'run',
  publicBase = '',
} = {}) {
  if (!fs.existsSync(PRELAND_DIR)) fs.mkdirSync(PRELAND_DIR, { recursive: true });

  const slug = String(`${runId}-${angle.id || 'main'}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  const copy = copyForVertical(verticalKey, offer, angle);
  const html = templateHtml({ ...copy, verticalKey });
  const file = path.join(PRELAND_DIR, `${slug}.html`);
  fs.writeFileSync(file, html, 'utf8');

  const base = String(publicBase || '').replace(/\/$/, '');
  const publicPath = `/preland/${slug}`;
  return {
    ok: true,
    slug,
    file,
    path: publicPath,
    url: base ? `${base}${publicPath}` : publicPath,
    angle_id: angle.id || 'main',
    vertical_key: verticalKey,
  };
}

export function prelandFilePath(slug) {
  const safe = String(slug || '').replace(/[^a-z0-9_-]/gi, '');
  if (!safe) return null;
  const file = path.join(PRELAND_DIR, `${safe}.html`);
  return fs.existsSync(file) ? file : null;
}

export { PRELAND_DIR };
