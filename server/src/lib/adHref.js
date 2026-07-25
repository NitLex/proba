/**
 * Ad click / display URL helpers for Yandex Direct.
 *
 * Domain in the ad ALWAYS comes from Href host — Direct cannot fake it.
 * To show payservices.ru instead of trekerarbitrag.ru:
 *   1) point DNS A/CNAME of payservices.ru → tracker VPS
 *   2) add server_name + SSL in nginx
 *   3) set AD_DISPLAY_DOMAIN=payservices.ru (or offer.display_domain)
 *
 * DisplayUrlPath is the short path after the domain (≤20 chars), e.g. karta/poezdki.
 */

const PATH_BY_ANGLE = {
  travel: 'karta/poezdki',
  services: 'karta/servisy',
  premium: 'premium-karta',
  sbp: 'karta/sbp',
  generic: 'vypusk-karty',
};

const DOMAIN_ENV_BY_ANGLE = {
  travel: 'AD_DISPLAY_DOMAIN_TRAVEL',
  services: 'AD_DISPLAY_DOMAIN_SERVICES',
  premium: 'AD_DISPLAY_DOMAIN_PREMIUM',
  sbp: 'AD_DISPLAY_DOMAIN_SBP',
};

export function normalizeHost(raw) {
  if (!raw) return '';
  let h = String(raw).trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h)) return '';
  return h;
}

/** Prefer offer field → angle-specific env → AD_DISPLAY_DOMAIN → ARBTRACK_PUBLIC_URL host. */
export function resolveDisplayDomain(offer = {}, angle = {}) {
  const fromOffer = normalizeHost(offer.display_domain || offer.displayDomain || offer.brand_domain);
  if (fromOffer) return fromOffer;

  const angleKey = DOMAIN_ENV_BY_ANGLE[angle?.id];
  if (angleKey && process.env[angleKey]) {
    const fromAngle = normalizeHost(process.env[angleKey]);
    if (fromAngle) return fromAngle;
  }

  const fromEnv = normalizeHost(process.env.AD_DISPLAY_DOMAIN || process.env.BRAND_CLICK_DOMAIN);
  if (fromEnv) return fromEnv;

  try {
    const pub = process.env.ARBTRACK_PUBLIC_URL || '';
    if (pub) return normalizeHost(new URL(pub).host);
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * Rewrite click URL host to brand/display domain, keep path+query.
 * Falls back to original URL if rewrite is impossible.
 */
export function brandifyClickUrl(clickUrl, displayDomain) {
  const host = normalizeHost(displayDomain);
  if (!clickUrl || !host) return clickUrl || '';
  try {
    const u = new URL(clickUrl);
    u.protocol = 'https:';
    u.host = host;
    return u.toString().replace(/\/$/, '') === `https://${host}`
      ? u.toString()
      : u.toString();
  } catch {
    return clickUrl;
  }
}

/** Direct DisplayUrlPath: ≤20 chars, letters/digits/-/№/%/# and single /. */
export function sanitizeDisplayUrlPath(raw) {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9/\-№%#]/gi, '')
    .replace(/--+/g, '-')
    .replace(/\/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (s.length > 20) s = s.slice(0, 20).replace(/[/-]+$/g, '');
  return s;
}

export function displayUrlPathForAngle(angle = {}, offer = {}) {
  const custom =
    offer.display_url_path ||
    offer.displayUrlPath ||
    angle.display_url_path ||
    PATH_BY_ANGLE[angle?.id] ||
    PATH_BY_ANGLE.generic;
  return sanitizeDisplayUrlPath(custom);
}

/**
 * Build final ad link fields from tracker click URL + offer/angle.
 */
export function buildAdLinkFields({ clickUrl, offer = {}, angle = {} } = {}) {
  const domain = resolveDisplayDomain(offer, angle);
  const href = brandifyClickUrl(clickUrl, domain) || clickUrl || '';
  const displayUrlPath = displayUrlPathForAngle(angle, offer);
  let hrefHost = '';
  try {
    hrefHost = href ? new URL(href).host : domain;
  } catch {
    hrefHost = domain;
  }
  return {
    href,
    display_domain: hrefHost || domain,
    display_url_path: displayUrlPath,
    display_preview: hrefHost
      ? `${hrefHost}${displayUrlPath ? `/${displayUrlPath}` : ''}`
      : displayUrlPath || null,
  };
}
