/**
 * LeadGid postback template for ArbTrack.
 * LeadGid UI/API не даёт нам поставить постбэк программно — оператор копирует вручную.
 */

export function publicTrackerBase() {
  return (
    process.env.ARBTRACK_PUBLIC_URL ||
    process.env.ARBTRACK_LOCAL_URL ||
    'https://trekerarbitrag.ru'
  ).replace(/\/$/, '');
}

/** Canonical LeadGid → ArbTrack postback URL (macros as LeadGid expects). */
export function buildLeadgidPostbackUrl(base = publicTrackerBase()) {
  const b = String(base || publicTrackerBase()).replace(/\/$/, '');
  return `${b}/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}`;
}

export function leadgidPostbackInstructions(postbackUrl) {
  const url = postbackUrl || buildLeadgidPostbackUrl();
  return {
    network: 'LeadGid',
    manual: true,
    reason: 'LeadGid не даёт выставить постбэк через наш API — вставь вручную в кабинете оффера',
    where: 'LeadGid → оффер → Postback / Global postback (или Instrument → Postbacks)',
    url,
    macros: [
      { leadgid: '{aff_sub}', arbtrack: 'clickid' },
      { leadgid: '{payout}', arbtrack: 'payout' },
      { leadgid: '{status}', arbtrack: 'status' },
      { leadgid: '{transaction_id}', arbtrack: 'txid' },
    ],
    offer_url_must_contain: 'aff_sub={clickid}',
    note: 'В ссылке оффера должен быть aff_sub={clickid}, иначе clickid в постбеке будет пустым. Тест LeadGid с clickid=aff_sub_value должен вернуть HTTP 200.',
  };
}

export function offerUrlHasAffSub(url = '') {
  const s = String(url || '');
  return /aff_sub\s*=\s*\{clickid\}/i.test(s) || /[?&]aff_sub=/i.test(s);
}

export function isLeadgidOfferUrl(url = '', network = '') {
  return /leadgid|go\.leadgid\.ru/i.test(String(url || '')) || /leadgid/i.test(String(network || ''));
}

/**
 * Ensure offer destination carries a clickid macro LeadGid can echo as {aff_sub}.
 * Idempotent. For LeadGid always uses aff_sub={clickid}.
 */
export function ensureOfferTrackingUrl(url = '', { network = '' } = {}) {
  let s = String(url || '').trim();
  if (!s) return s;

  const leadgid = isLeadgidOfferUrl(s, network);

  // Already correct LeadGid form
  if (/aff_sub\s*=\s*\{clickid\}/i.test(s)) return s;

  // aff_sub present but not our macro → force {clickid}
  if (/[?&]aff_sub=/i.test(s)) {
    return s.replace(/([?&]aff_sub=)[^&]*/i, '$1{clickid}');
  }

  // Non-LeadGid already has some {clickid} macro
  if (!leadgid && /\{clickid\}/i.test(s)) return s;

  const sep = s.includes('?') ? '&' : '?';
  if (leadgid) return `${s}${sep}aff_sub={clickid}`;
  // Generic networks: clickid= is fine; LeadGid-style aff_sub also works if network echoes it
  return `${s}${sep}clickid={clickid}`;
}

/**
 * Runtime safety net after macros: if LeadGid URL still has no aff_sub, append live clickid.
 */
export function ensureLeadgidAffSubOnRedirect(destUrl = '', clickid = '') {
  const dest = String(destUrl || '');
  const cid = String(clickid || '');
  if (!dest || !cid) return dest;
  if (!isLeadgidOfferUrl(dest)) return dest;
  if (/[?&]aff_sub=/i.test(dest)) return dest;
  const sep = dest.includes('?') ? '&' : '?';
  return `${dest}${sep}aff_sub=${encodeURIComponent(cid)}`;
}

export function validateOfferTrackingUrl(url = '') {
  const s = String(url || '');
  if (!s) return { ok: false, reason: 'empty_offer_url' };
  const hasAffSubMacro = /aff_sub\s*=\s*\{clickid\}/i.test(s);
  const hasAffSub = offerUrlHasAffSub(s);
  const hasClickidMacro = /\{clickid\}/i.test(s);
  const leadgid = isLeadgidOfferUrl(s);
  // LeadGid: require aff_sub={clickid} specifically
  const ok = leadgid ? hasAffSubMacro : hasAffSub || hasClickidMacro;
  return {
    ok,
    has_aff_sub: hasAffSub,
    has_aff_sub_macro: hasAffSubMacro,
    has_clickid_macro: hasClickidMacro,
    leadgid,
    reason: hasAffSubMacro
      ? 'ok'
      : leadgid
        ? 'missing aff_sub={clickid}'
        : hasClickidMacro
          ? 'has {clickid} but prefer aff_sub={clickid} for LeadGid'
          : 'missing aff_sub={clickid}',
    required: 'aff_sub={clickid}',
  };
}

/**
 * Ping ArbTrack postback with fake LeadGid test clickid — must be HTTP 200.
 */
export async function pingPostbackEndpoint(base = publicTrackerBase()) {
  const b = String(base || publicTrackerBase()).replace(/\/$/, '');
  const url = `${b}/postback?clickid=aff_sub_value&payout=0&status=lead&txid=leadgid_test`;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    const text = await res.text().catch(() => '');
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    return {
      ok: res.status === 200,
      status: res.status,
      url,
      body: json || text.slice(0, 120),
    };
  } catch (err) {
    return { ok: false, status: 0, url, error: err.message || String(err) };
  }
}
