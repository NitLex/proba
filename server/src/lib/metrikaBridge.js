/**
 * Metrika bridge HTML for /click → offer.
 * Fires counter (binds yclid), then redirects to partner URL.
 */

import { getSetting } from '../db.js';

export function resolveMetrikaCounterId() {
  const fromEnv = Number(process.env.YANDEX_METRIKA_COUNTER_ID || 0);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const fromDb = Number(getSetting('yandex_metrika_counter_id', '') || 0);
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;
  return null;
}

export function resolveMetrikaSoftGoalName() {
  const fromEnv = String(process.env.YANDEX_METRIKA_SOFT_GOAL_NAME || '').trim();
  if (fromEnv) return fromEnv;
  const fromDb = String(getSetting('yandex_metrika_soft_goal_name', '') || '').trim();
  if (fromDb) return fromDb;
  // Default JS goal name we ask the operator to create in Metrika
  return 'soft_lead';
}

/** Skip bridge for Direct/moderation bots — they need a fast 302 to the offer. */
export function shouldServeMetrikaBridge(req, { isAdReview = false } = {}) {
  if (isAdReview) return false;
  if (String(req.query.nometrika || '') === '1') return false;
  return Boolean(resolveMetrikaCounterId());
}

/**
 * @param {{ counterId: number, redirectUrl: string, softGoalName?: string|null, delayMs?: number }} opts
 */
export function renderMetrikaBridgeHtml({
  counterId,
  redirectUrl,
  softGoalName = 'soft_lead',
  delayMs = 400,
} = {}) {
  const id = Number(counterId);
  const dest = String(redirectUrl || '');
  const goal = softGoalName ? String(softGoalName).trim() : '';
  const delay = Math.max(150, Math.min(2000, Number(delayMs) || 400));
  const destJson = JSON.stringify(dest);
  const goalJson = goal ? JSON.stringify(goal) : 'null';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Переход…</title>
  <style>
    html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f4f1ea;color:#1a241c}
    .w{min-height:100%;display:grid;place-items:center;padding:1.5rem;text-align:center}
    p{opacity:.7;font-size:.95rem}
    a{color:#1f5c45}
  </style>
  <!-- Yandex.Metrika counter -->
  <script type="text/javascript">
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
    (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
    ym(${id}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false });
  </script>
  <noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt="" /></div></noscript>
  <!-- /Yandex.Metrika counter -->
</head>
<body>
  <div class="w">
    <div>
      <p>Переходим к оформлению…</p>
      <p><a id="go" href=${destJson}>Продолжить</a></p>
    </div>
  </div>
  <script>
    (function () {
      var dest = ${destJson};
      var goal = ${goalJson};
      var delay = ${delay};
      function go() {
        try {
          if (goal && typeof ym === "function") {
            ym(${id}, "reachGoal", goal);
          }
        } catch (e) {}
        window.location.replace(dest);
      }
      // Give Metrika a tick to bind yclid from the URL, then redirect
      setTimeout(go, delay);
      // Fallback if JS timers fail
      setTimeout(go, delay + 2500);
    })();
  </script>
</body>
</html>`;
}
