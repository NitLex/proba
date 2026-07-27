/**
 * Offer-first fact extraction: geo, payout model, brand, network, product cues.
 * Used before vertical playbooks so we stop inventing RU/card templates.
 */

/** ISO2 → Yandex region ids (Wordstat / Direct). Incomplete by design; unknown → []. */
export const GEO_REGION_IDS = {
  RU: [225],
  BY: [149],
  KZ: [159],
  UA: [187],
  UZ: [171],
  ES: [202],
  PL: [985],
  CZ: [205],
  RO: [1004],
  DE: [96],
  TR: [983],
  US: [84],
  GB: [111],
  UK: [111],
  // Parsed from offer names even when Yandex region id is unknown ([])
  DK: [],
  SE: [],
  NO: [],
  FI: [],
  IT: [],
  FR: [],
  PT: [],
  HU: [],
  BG: [],
  SK: [],
  LT: [],
  LV: [],
  EE: [],
  NL: [],
  BE: [],
  AT: [],
  IE: [],
  GR: [],
};

/**
 * FinMi-class LeadGid geo:
 * все регионы РФ, кроме Северного Кавказа, ЛНР, ДНР, Запорожской, Херсонской
 * и других бывших украинских регионов (Крым и Севастополь — в показах).
 *
 * Direct: positive = include, negative = exclude (AdGroups.RegionIds).
 * 225 = Россия, 977 = Республика Крым (Севастополь 959 внутри),
 * -102444 = СКФО, -205xx = области Украины (кроме Крыма).
 */
export const RU_EXCEPT_CAUCASUS_AND_EX_UA_REGION_IDS = [
  225,
  977,
  -102444,
  // Украинские области / «новые территории» (Крым 977 не минусуем)
  -20530, -20531, -20533, -20534, -20535, -20536, -20537, -20538, -20539, -20540,
  -20541, -20542, -20543, -20544, -20545, -20546, -20547, -20548, -20549, -20551, -20552,
];

const ISO2 = Object.keys(GEO_REGION_IDS);

/** Offer copy that requires RF minus Caucasus / ex-UA (except Crimea). */
export function wantsRuExceptCaucasusExUa(text = '') {
  const t = String(text || '');
  const w = '[A-Za-zА-Яа-яЁё]*';
  const hasCaucasus = new RegExp(`северн${w}\\s*кавказ|скфо`, 'i').test(t);
  const hasExUa = new RegExp(
    `лнр|днр|запорож|херсон|бывш${w}\\s*республик${w}\\s*украин|кроме\\s*крыма|севастопол`,
    'i',
  ).test(t);
  return hasCaucasus && hasExUa;
}

const AFFILIATE_HOSTS = [
  { re: /leadgid\.(ru|eu|com)|go\.leadgid/i, network: 'LeadGid' },
  { re: /admitad\./i, network: 'Admitad' },
  { re: /cityads\./i, network: 'CityAds' },
  { re: /gdeslon\./i, network: 'GdeSlon' },
  { re: /actionpay\.|sellaction\./i, network: 'ActionPay' },
  { re: /bang\s*bang|bbcdn|bangbang/i, network: 'Bang Bang' },
  { re: /salesdoubler\./i, network: 'SalesDoubler' },
  { re: /affise\.|hasoffers\.|offer\./i, network: 'Affiliate' },
];

const JUNK_PAGE_RE =
  /©\s*\d{4}|ооо\s*«?\s*лидгид|leadgid\s*$|all rights reserved|privacy policy|cookie/i;

/** Country tokens in names like "Finandos ES RO PL CZ CPL". */
export function extractGeosFromText(text = '') {
  const raw = String(text || '');
  const found = new Set();
  // Prefer standalone ISO2 tokens (word boundaries)
  for (const code of ISO2) {
    const re = new RegExp(`(?:^|[^A-Za-z])${code}(?:[^A-Za-z]|$)`, 'i');
    if (re.test(raw)) found.add(code.toUpperCase());
  }
  // RU aliases
  if (/\b(?:РФ|Россия|Russia)\b/i.test(raw)) found.add('RU');
  return [...found];
}

export function extractPayoutModel(offer = {}) {
  const blob = [
    offer.name,
    offer.offer_name,
    offer.notes,
    offer.description,
    ...(Array.isArray(offer.product_brief?.goals)
      ? offer.product_brief.goals.map((g) => g.name)
      : []),
    ...(Array.isArray(offer.goals) ? offer.goals.map((g) => g.name) : []),
  ]
    .filter(Boolean)
    .join(' ');

  if (/\bCPL\b|cost[\s_-]?per[\s_-]?lead|заявк/i.test(blob)) return 'CPL';
  if (/\bCPI\b|cost[\s_-]?per[\s_-]?install|установк/i.test(blob)) return 'CPI';
  if (/\bCPS\b|revshare|revenue\s*share/i.test(blob)) return 'CPS';
  if (/\bCPA\b|cost[\s_-]?per[\s_-]?action|выдач|sale|покупк/i.test(blob)) return 'CPA';
  const goalModel = offer.product_brief?.goals?.[0]?.model || offer.goals?.[0]?.payout?.model;
  if (goalModel) return String(goalModel).toUpperCase();
  return null;
}

export function extractBrand(name = '') {
  const s = String(name || '').trim();
  if (!s) return '';
  // Drop trailing geo/model tokens: "Finandos ES RO PL CZ CPL" → Finandos
  const parts = s.split(/[\s|/–—-]+/).filter(Boolean);
  const keep = [];
  for (const p of parts) {
    const up = p.toUpperCase();
    if (ISO2.includes(up)) break;
    if (/^(CPL|CPA|CPI|CPS|CPC|RSYa|РФ)$/i.test(p)) break;
    keep.push(p);
  }
  return (keep.join(' ') || parts[0] || s).slice(0, 60);
}

export function detectAffiliateNetwork(url = '', explicit = '') {
  if (explicit) return String(explicit);
  try {
    const host = new URL(url).hostname;
    for (const row of AFFILIATE_HOSTS) {
      if (row.re.test(host) || row.re.test(url)) return row.network;
    }
  } catch {
    /* ignore */
  }
  return '';
}

export function isJunkPageText(text = '') {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length < 12) return true;
  return JUNK_PAGE_RE.test(t);
}

export function regionIdsForGeos(geos = []) {
  const ids = [];
  for (const g of geos) {
    for (const id of GEO_REGION_IDS[String(g).toUpperCase()] || []) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Build structured facts from enriched offer (+ optional enrich payload).
 */
export function buildOfferFacts(offer = {}, enrich = {}) {
  const name = offer.name || offer.offer_name || '';
  const textBlob = [
    name,
    offer.notes,
    offer.description,
    offer.network_description,
    offer.product_brief?.summary,
    offer.product_brief?.advantages,
    offer.product_brief?.category,
    ...(Array.isArray(offer.products) ? offer.products.map((p) => p.name || p) : []),
    enrich?.leadgid?.category,
  ]
    .filter(Boolean)
    .join(' ');

  let geos = [];
  if (Array.isArray(offer.geos) && offer.geos.length) {
    geos = offer.geos.map((g) => String(g).toUpperCase());
  } else if (offer.geo && String(offer.geo).includes(',')) {
    geos = String(offer.geo)
      .split(/[,\s]+/)
      .map((g) => g.toUpperCase())
      .filter((g) => ISO2.includes(g) || g === 'RU');
  } else {
    geos = extractGeosFromText(textBlob);
    if (!geos.length && offer.geo && String(offer.geo).length === 2) {
      geos = [String(offer.geo).toUpperCase()];
    }
  }

  const payoutModel = extractPayoutModel(offer);
  const brand = extractBrand(name);
  const network = detectAffiliateNetwork(offer.url || '', offer.network || '');

  // "Займы нерезидентам" = audience/product angle (who gets the loan), NOT traffic geo.
  // РСЯ for such offers is still РФ (region 225): advertise in Russia to non-resident borrowers.
  const nonResidentAudience = /нерезидент|non[-\s]?resident|foreigner|иностранц/i.test(textBlob);

  const products = Array.isArray(offer.products)
    ? offer.products
    : Array.isArray(enrich?.leadgid?.products)
      ? enrich.leadgid.products
      : [];
  const productNames = products.map((p) => p.name || p).filter(Boolean);

  // Default RU only when safe: RUB + Russian MFO/loan cues + no foreign ISO2 already found.
  // Never invent RU for EUR/multi-geo CPL (Finandos ES RO…).
  const currency = String(offer.currency || enrich?.leadgid?.currency || '').toUpperCase();
  const looksRuMfo =
    currency === 'RUB' &&
    (/мфо|займ|кредит/i.test(`${name} ${productNames.join(' ')} ${textBlob}`) ||
      nonResidentAudience);
  if (!geos.length && looksRuMfo) {
    geos = ['RU'];
  }

  // Explicit offer geo policy (FinMi etc.) overrides bare [225]
  const geoPolicyText = [
    textBlob,
    offer.geo_notes,
    offer.geo_policy,
    offer.targeting_geo,
    enrich?.leadgid?.geo,
    enrich?.leadgid?.description,
  ]
    .filter(Boolean)
    .join(' ');
  const ruExceptCaucasusExUa =
    wantsRuExceptCaucasusExUa(geoPolicyText) ||
    // FinMi non-resident МФО: standard LeadGid geo clause when notes empty
    (nonResidentAudience && looksRuMfo && /finmi|финкомпас/i.test(`${name} ${brand}`));

  let regionIds = regionIdsForGeos(geos);
  if (ruExceptCaucasusExUa && geos.length && geos.every((g) => g === 'RU')) {
    regionIds = [...RU_EXCEPT_CAUCASUS_AND_EX_UA_REGION_IDS];
  }

  const ruOnly = geos.length > 0 && geos.every((g) => g === 'RU');
  const nonRu = geos.some((g) => g !== 'RU');

  const evidence = [];
  if (payoutModel) evidence.push(`payout_model: ${payoutModel}`);
  if (productNames.length) evidence.push(`products: ${productNames.join('; ')}`);
  if (brand) evidence.push(`brand: ${brand}`);
  if (geos.length) evidence.push(`geo_from_name_or_offer: ${geos.join(',')}`);
  if (nonResidentAudience) {
    evidence.push('audience: non-residents (product angle; traffic geo still RU for РСЯ)');
  }
  if (looksRuMfo && geos.length === 1 && geos[0] === 'RU') {
    evidence.push('geo_default: RU from RUB+МФО/займ (нерезидентам ≠ foreign GEO)');
  }
  if (ruExceptCaucasusExUa) {
    evidence.push(
      'geo_policy: RF+Crimea except Northern Caucasus, LNR/DNR/Zaporizhzhia/Kherson and other ex-UA regions',
    );
  }
  if (offer.currency) evidence.push(`currency: ${offer.currency}`);
  if (offer.payout != null) evidence.push(`payout: ${offer.payout} ${offer.currency || ''}`.trim());
  if (offer.epc != null) evidence.push(`epc: ${offer.epc}`);

  return {
    brand,
    geos,
    geo: geos.join(',') || null,
    region_ids: regionIds,
    geo_policy: ruExceptCaucasusExUa ? 'ru_except_caucasus_ex_ua' : null,
    payout_model: payoutModel,
    network: network || offer.network || null,
    products: productNames,
    currency: offer.currency || null,
    payout: offer.payout ?? null,
    epc: offer.epc ?? null,
    non_resident_audience: nonResidentAudience,
    geo_required: false,
    ru_traffic_fit: ruOnly ? 'fit' : nonRu ? 'mismatch_rsya_ru' : 'unknown',
    evidence,
  };
}

/** Seeds for Wordstat / creatives from facts — never invent card/SBP queries. */
export function seedsFromOfferFacts(offer = {}, facts = {}) {
  const brand = facts.brand || extractBrand(offer.name || '');
  const geos = facts.geos?.length ? facts.geos : extractGeosFromText(offer.name || '');
  const products = facts.products || [];
  const seeds = [];

  if (brand) {
    seeds.push(brand);
    if (products.some((p) => /кредит|займ|loan|credit/i.test(p))) {
      seeds.push(`${brand} кредит`);
      seeds.push(`${brand} займ`);
      seeds.push(`${brand} кредит онлайн`);
    } else if (products.length) {
      seeds.push(`${brand} ${String(products[0]).split('(')[0].trim()}`);
    } else {
      seeds.push(`${brand} онлайн`);
      seeds.push(`${brand} официальный сайт`);
    }
  }

  if (products.some((p) => /кредитн.*сервис/i.test(p))) {
    seeds.push('кредитный сервис онлайн');
    seeds.push('подобрать кредит онлайн');
    seeds.push('заявка на кредит онлайн');
  }

  // Geo-local intent (language-light)
  if (geos.includes('ES')) seeds.push('préstamo online', 'credito online España');
  if (geos.includes('PL')) seeds.push('pożyczka online', 'kredyt online');
  if (geos.includes('CZ')) seeds.push('půjčka online');
  if (geos.includes('RO')) seeds.push('credit online');
  if (geos.includes('RU')) {
    if (/займ|кредит|loan|mfo|мфо|нерезидент/i.test(`${offer.name} ${products.join(' ')}`)) {
      seeds.push('займ онлайн', 'кредит онлайн');
      if (/нерезидент/i.test(String(offer.name || ''))) {
        seeds.push('займ нерезидентам', 'кредит для иностранцев');
      }
    }
  }

  return [...new Set(seeds.filter(Boolean))].slice(0, 12);
}
