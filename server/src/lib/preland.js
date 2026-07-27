/**
 * Simple preland HTML generator for card/loan angles (РСЯ quality lever).
 * Served at /preland/:slug — tracker landing URL points here.
 *
 * Loan/MFO broker prelands must stay moderation-safe:
 * no approval guarantees, disclose intermediary role, PSK/contacts/18+.
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

function templateLoanBroker({ title, brand }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Source+Serif+4:opsz,wght@8..60,700&display=swap" rel="stylesheet"/>
<style>
:root{--bg:#07140f;--ink:#f3f7f4;--muted:#a8bdb2;--accent:#d7b56d;--line:rgba(243,247,244,.12)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Manrope,system-ui,sans-serif;color:var(--ink);background:radial-gradient(900px 420px at 15% -10%,rgba(215,181,109,.16),transparent 55%),linear-gradient(165deg,#07140f,#0d2a1f 55%,#081811);display:flex;justify-content:center;padding:1.5rem}
.wrap{max-width:420px;width:100%}
.brand{font-weight:800;letter-spacing:-.03em;margin-bottom:1.4rem}.brand span{color:var(--accent)}
h1{font-family:"Source Serif 4",Georgia,serif;font-size:clamp(1.7rem,5vw,2.2rem);line-height:1.15;margin:0 0 .75rem}
p{margin:0 0 1.2rem;color:var(--muted);line-height:1.45}
a.cta{display:inline-block;padding:.95rem 1.4rem;border-radius:12px;background:var(--accent);color:#1a1408;font-weight:800;text-decoration:none}
.warn{margin-top:1rem;padding:.8rem .9rem;border:1px solid rgba(215,181,109,.35);border-radius:12px;font-size:.8rem;color:#f0e2c0;line-height:1.4}
.fine{margin-top:1.2rem;font-size:.72rem;color:#8aa396;line-height:1.45}
</style>
</head>
<body>
<main class="wrap">
  <div class="brand">${escapeHtml(brand)}<span>.</span></div>
  <h1>Подбор предложений микрозаймов онлайн</h1>
  <p>Информационный сервис. Решение о выдаче и точные условия — на сайте МФО-партнёра. Без гарантии одобрения.</p>
  <a class="cta" id="go" href="#">Перейти к подбору →</a>
  <div class="warn">Изучите все условия кредита (займа) на сайте в соответствующем разделе. Оценивайте свои финансовые возможности и риски.</div>
  <p class="fine">Реклама. 18+. Сервис не является кредитором. ПСК и условия — у МФО-партнёра.</p>
</main>
<script>
(function(){
  var q=new URLSearchParams(location.search);
  var clickid=q.get('clickid')||'';
  var ck=q.get('ck')||'';
  var href=location.origin+'/to-offer?clickid='+encodeURIComponent(clickid);
  if(ck) href+='&ck='+encodeURIComponent(ck);
  document.getElementById('go').href=href;
})();
</script>
</body>
</html>`;
}

function templateHtml({ title, headline, sub, cta, brand, verticalKey }) {
  if (verticalKey === 'fintech_loans') {
    return templateLoanBroker({ title, brand });
  }
  const bg = 'linear-gradient(160deg, #0b1c2c 0%, #163a5f 45%, #0a1624 100%)';
  const accent = '#4da3ff';
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
    font-size: 1.05rem;
  }
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
  var href = location.origin + '/to-offer?clickid=' + encodeURIComponent(clickid);
  if (ck) href += '&ck=' + encodeURIComponent(ck);
  document.getElementById('go').href = href;
})();
</script>
</body>
</html>`;
}

function copyForVertical(verticalKey, offer = {}, angle = {}) {
  const brand = String(offer.name || offer.facts?.brand || 'Сервис').slice(0, 40);
  if (verticalKey === 'fintech_loans') {
    return {
      title: `${brand} — подбор микрозаймов`,
      headline: angle.title || 'Подбор предложений микрозаймов онлайн',
      sub: 'Информационный сервис. Условия и решение — на сайте МФО-партнёра.',
      cta: 'Перейти к подбору',
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
 * Prefer curated HTML for known slugs when present in PRELAND_DIR.
 */
export function generatePreland({
  offer = {},
  angle = {},
  verticalKey = '',
  runId = 'run',
  publicBase = '',
  slug: forcedSlug = '',
} = {}) {
  if (!fs.existsSync(PRELAND_DIR)) fs.mkdirSync(PRELAND_DIR, { recursive: true });

  const slug = String(forcedSlug || `${runId}-${angle.id || 'main'}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  const curated = path.join(PRELAND_DIR, `${slug}.html`);
  // Keep handcrafted finmfo (and similar) pages intact if already present
  if (!(forcedSlug && fs.existsSync(curated))) {
    const copy = copyForVertical(verticalKey, offer, angle);
    const html = templateHtml({ ...copy, verticalKey });
    fs.writeFileSync(path.join(PRELAND_DIR, `${slug}.html`), html, 'utf8');
  }

  const base = String(publicBase || '').replace(/\/$/, '');
  const publicPath = `/preland/${slug}`;
  return {
    ok: true,
    slug,
    file: path.join(PRELAND_DIR, `${slug}.html`),
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
