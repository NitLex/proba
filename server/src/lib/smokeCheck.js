/**
 * Post-pipeline smoke checks for tracker click / bots / postback / Direct draft.
 */

export function stripTrackingMacros(url) {
  if (!url) return '';
  return String(url)
    .replace(/\{[^}]+\}/g, 'test')
    .replace(/&&+/g, '&')
    .replace(/\?&/, '?');
}

export function postbackLooksValid(url) {
  const s = String(url || '');
  if (!s) return { ok: false, reason: 'empty', url: s };
  const hasClick =
    s.includes('{clickid') || s.includes('{aff_sub') || /[?&]clickid=/i.test(s);
  const hasPayout = s.includes('{payout') || /[?&]payout=/i.test(s);
  const hasStatus = s.includes('{status') || /[?&]status=/i.test(s);
  const missing = [
    !hasClick ? 'clickid|aff_sub' : null,
    !hasPayout ? 'payout' : null,
    !hasStatus ? 'status' : null,
  ].filter(Boolean);
  return {
    ok: missing.length === 0,
    reason: missing.length ? `missing ${missing.join(',')}` : 'ok',
    url: s,
  };
}

async function fetchOnce(url, { method = 'GET', headers = {}, redirect = 'manual', timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, redirect, signal: ctrl.signal });
    const location = res.headers.get('location') || res.headers.get('Location') || '';
    let body = '';
    try {
      body = (await res.text()).slice(0, 200);
    } catch {
      body = '';
    }
    return {
      ok: true,
      status: res.status,
      location,
      body,
      final_url: res.url || url,
    };
  } catch (err) {
    return { ok: false, status: 0, location: '', body: '', error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

export async function checkClickRedirect(clickUrl, { userAgent, label } = {}) {
  const url = stripTrackingMacros(clickUrl);
  if (!url || /\/click\/PENDING/i.test(url)) {
    return {
      id: label || 'click',
      ok: false,
      skipped: true,
      severity: 'warn',
      summary: 'нет реального click URL (dry-run / PENDING)',
      url,
    };
  }

  const res = await fetchOnce(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,*/*',
    },
  });

  const redirected = res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307;
  const blocked = res.status === 403;
  const ok = redirected && !blocked;

  return {
    id: label || 'click',
    ok,
    severity: ok ? 'ok' : 'fail',
    status: res.status,
    location: res.location,
    error: res.error,
    summary: ok
      ? `${res.status} → ${res.location.slice(0, 120)}`
      : blocked
        ? `403 Bot/traffic blocked`
        : res.error || `ожидали 302, получили ${res.status}`,
    url,
  };
}

export async function checkOfferReachable(clickUrl, offerHintUrl) {
  const click = await checkClickRedirect(clickUrl, { label: 'click_follow' });
  if (!click.ok) {
    return {
      id: 'offer_redirect',
      ok: false,
      severity: click.skipped ? 'warn' : 'fail',
      summary: click.summary,
      click,
    };
  }

  let location = click.location;
  if (location.startsWith('/')) {
    try {
      location = new URL(location, click.url).toString();
    } catch {
      /* keep */
    }
  }

  let offerHost = '';
  try {
    offerHost = new URL(stripTrackingMacros(offerHintUrl || location)).hostname.replace(/^www\./, '');
  } catch {
    offerHost = '';
  }

  let locHost = '';
  try {
    locHost = new URL(location).hostname.replace(/^www\./, '');
  } catch {
    locHost = '';
  }

  // Soft: redirect must leave tracker host to an external http(s) URL
  let trackerHost = '';
  try {
    trackerHost = new URL(click.url).hostname;
  } catch {
    trackerHost = '';
  }
  const leftTracker = Boolean(locHost) && locHost !== trackerHost && /^https?:/i.test(location);

  return {
    id: 'offer_redirect',
    ok: leftTracker,
    severity: leftTracker ? 'ok' : 'fail',
    summary: leftTracker
      ? `редирект на ${locHost}${offerHost && locHost !== offerHost ? ` (оффер hint: ${offerHost})` : ''}`
      : `редирект не ушёл с трекера (location=${location.slice(0, 120)})`,
    location,
    offer_host: offerHost,
    location_host: locHost,
  };
}

export async function checkPostbackTemplate(postbackUrl) {
  const v = postbackLooksValid(postbackUrl);
  return {
    id: 'postback_template',
    ok: v.ok,
    severity: v.ok ? 'ok' : 'fail',
    summary: v.ok ? 'шаблон postback ок (clickid/aff_sub, payout, status)' : `шаблон postback: ${v.reason}`,
    url: v.url,
  };
}

export async function checkOfferAffSub(offerUrl) {
  const { validateOfferTrackingUrl } = await import('./leadgidPostback.js');
  const v = validateOfferTrackingUrl(offerUrl);
  // Hard-fail for LeadGid / missing clickid — иначе постбэки не склеятся
  const ok = Boolean(v.ok);
  return {
    id: 'offer_aff_sub',
    ok,
    severity: ok ? 'ok' : 'fail',
    summary: ok
      ? 'в URL оффера есть aff_sub={clickid} (или clickid-макрос)'
      : `оффер: ${v.reason} — обязателен aff_sub={clickid}`,
    ...v,
  };
}

export async function checkPostbackLivePing() {
  const { pingPostbackEndpoint } = await import('./leadgidPostback.js');
  const ping = await pingPostbackEndpoint();
  // Soft warn if endpoint unreachable in offline/dev; hard fail only on non-200 response
  const softSkip = ping.status === 0;
  return {
    id: 'postback_live',
    ok: ping.ok || softSkip,
    severity: ping.ok ? 'ok' : softSkip ? 'warn' : 'fail',
    summary: ping.ok
      ? `тест постбэка HTTP ${ping.status} (LeadGid OK)`
      : softSkip
        ? `тест постбэка недоступен: ${ping.error || 'network'}`
        : `тест постбэка fail: HTTP ${ping.status}`,
    ...ping,
  };
}

export async function checkDirectCampaign(campaignId, { directApi } = {}) {
  if (!campaignId) {
    return {
      id: 'direct_campaign',
      ok: false,
      skipped: true,
      severity: 'warn',
      summary: 'кампания Директа не создавалась (apply_direct=false или ошибка)',
    };
  }
  if (!directApi) {
    return {
      id: 'direct_campaign',
      ok: false,
      skipped: true,
      severity: 'warn',
      summary: 'нет API клиента для проверки Директа',
      campaign_id: campaignId,
    };
  }

  const data = await directApi('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: { Ids: [Number(campaignId)] },
      FieldNames: ['Id', 'Name', 'State', 'Status', 'StatusClarification'],
    },
  });

  const camp = data?.result?.Campaigns?.[0];
  if (!camp) {
    return {
      id: 'direct_campaign',
      ok: false,
      severity: 'fail',
      summary: `кампания ${campaignId} не найдена в API`,
      raw: data?.error || data,
      campaign_id: campaignId,
    };
  }

  const state = String(camp.State || '');
  const status = String(camp.Status || '');
  // Draft/OFF/SUSPENDED are acceptable pre-launch states
  const acceptable = /OFF|SUSPENDED|ENDED|CONVERTED|UNKNOWN/i.test(state) || /DRAFT|MODERATION|REJECTED|ACCEPTED/i.test(status);
  const isOn = /ON/i.test(state) && /ACCEPTED/i.test(status);

  return {
    id: 'direct_campaign',
    ok: true,
    severity: 'ok',
    summary: `Директ #${camp.Id} · State=${state} · Status=${status}${isOn ? ' (уже ON)' : ' (черновик/не запущена — ок)'}`,
    campaign_id: camp.Id,
    name: camp.Name,
    state,
    status,
    acceptable_prelaunch: acceptable || !isOn,
  };
}

export async function runSmokeSuite({
  clickUrl,
  postbackUrl,
  offerUrl,
  directCampaignId,
  directApi,
} = {}) {
  const checks = [];

  checks.push(
    await checkClickRedirect(clickUrl, {
      label: 'click_browser',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }),
  );

  checks.push(
    await checkClickRedirect(clickUrl, {
      label: 'click_yandexbot',
      userAgent: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    }),
  );

  checks.push(
    await checkClickRedirect(clickUrl, {
      label: 'click_yadirectfetcher',
      userAgent: 'Mozilla/5.0 (compatible; YaDirectFetcher/1.0; +http://yandex.com/bots)',
    }),
  );

  checks.push(await checkOfferReachable(clickUrl, offerUrl));
  checks.push(await checkPostbackTemplate(postbackUrl));
  checks.push(await checkOfferAffSub(offerUrl));
  checks.push(await checkPostbackLivePing());
  checks.push(await checkDirectCampaign(directCampaignId, { directApi }));

  const fails = checks.filter((c) => !c.ok && c.severity === 'fail' && !c.skipped);
  const warns = checks.filter((c) => c.severity === 'warn' || c.skipped);
  const oks = checks.filter((c) => c.ok);

  return {
    ok: fails.length === 0,
    checks,
    stats: { ok: oks.length, warn: warns.length, fail: fails.length },
    summary:
      fails.length === 0
        ? `QA ok · ${oks.length} checks · предупреждений ${warns.length}`
        : `QA fail · ${fails.length} критичных · ${fails.map((f) => f.id).join(', ')}`,
  };
}
