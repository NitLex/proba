/**
 * Yandex Direct GeoRegions helpers: aliases + parse «РФ кроме …» exclusion lists.
 * LeadGid public catalog API does NOT return GEO exclusions — operators paste the
 * cabinet GEO block into geo_rules / notes, or we parse it from free text.
 */

/** Positive include regions (ISO-ish keys used by offerFacts). */
export const GEO_INCLUDE_IDS = {
  RU: 225,
  BY: 149,
  KZ: 159,
  UA: 187,
  UZ: 171,
};

/**
 * Common RU subject / city aliases → Direct GeoRegionId.
 * Keys are lowercase searchable stems (matched via includes).
 * Longer / more specific stems should win (sorted by length desc at match time).
 */
export const RU_REGION_ALIASES = [
  { id: 11010, stems: ['дагестан'] },
  { id: 11012, stems: ['ингушет'] },
  { id: 11013, stems: ['кабардин', 'кабардино'] },
  { id: 11015, stems: ['калмык'] },
  { id: 11020, stems: ['карачаев', 'черкес'] },
  { id: 11021, stems: ['осети', 'алани'] },
  { id: 10233, stems: ['тыва', 'тува', 'тыв'] },
  { id: 11024, stems: ['чечен'] },
  { id: 977, stems: ['крым'] },
  { id: 959, stems: ['севастопол'] },
  { id: 11330, stems: ['буряти'] },
  { id: 10645, stems: ['белгород'] },
  { id: 74, stems: ['якутск'] },
  { id: 11443, stems: ['якутия', 'саха (', 'республика саха'] },
  { id: 11004, stems: ['адыге'] },
  { id: 10231, stems: ['алтай'] },
  { id: 11111, stems: ['башкортостан', 'башкир'] },
  { id: 10933, stems: ['карел'] },
  { id: 10939, stems: ['коми'] },
  { id: 11077, stems: ['марий'] },
  { id: 11117, stems: ['мордов'] },
  { id: 11119, stems: ['татарстан', 'татар'] },
  { id: 11340, stems: ['хакас'] },
  { id: 11148, stems: ['удмурт'] },
  { id: 11156, stems: ['чуваш'] },
  { id: 213, stems: ['москва'] },
  { id: 1, stems: ['московская'] },
  { id: 2, stems: ['санкт-петербург', 'петербург', 'спб'] },
];

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Match one free-text region token to a Direct id (or null). */
export function matchRuRegionId(token) {
  const t = normText(token).replace(/^республика\s+/i, '');
  if (!t || t.length < 3) return null;
  // Prefer longer stems to avoid «крым» hitting «крымск» false? we use includes both ways carefully
  const ranked = [...RU_REGION_ALIASES].sort(
    (a, b) => Math.max(...b.stems.map((s) => s.length)) - Math.max(...a.stems.map((s) => s.length)),
  );
  for (const row of ranked) {
    for (const stem of row.stems) {
      if (t.includes(stem) || stem.includes(t)) return row.id;
    }
  }
  return null;
}

/**
 * Parse LeadGid-style GEO block:
 *   РФ
 *   Кроме городов и областей: Дагестан, Ингушетия, …
 * → { geos: ['RU'], include_ids: [225], exclude_ids: [11010, …], region_ids: [225, -11010, …] }
 */
export function parseGeoRulesText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) {
    return { geos: [], include_ids: [], exclude_ids: [], region_ids: [], unmatched: [], raw: '' };
  }

  const geos = [];
  if (/(?:^|[^a-zа-яё])(?:рф|россия|russia)(?:[^a-zа-яё]|$)/i.test(raw)) geos.push('RU');
  if (/\bKZ\b|казахстан/i.test(raw)) geos.push('KZ');
  if (/\bUZ\b|узбекистан/i.test(raw)) geos.push('UZ');
  if (/\bBY\b|беларусь/i.test(raw)) geos.push('BY');

  const excludeIds = [];
  const unmatched = [];

  // Split after «кроме …:» / «исключая …:» / «кроме:»
  const exclMatch = raw.match(
    /(?:кроме(?:\s+городов(?:\s+и\s+областей)?)?|исключая|exclude[sd]?)\s*:?\s*([\s\S]+)/i,
  );
  const exclBlob = exclMatch ? exclMatch[1] : '';
  if (exclBlob) {
    const parts = exclBlob
      .split(/[,;\n|/]+/)
      .map((p) => p.replace(/\(.*?\)/g, '').trim())
      .filter((p) => p && !/^(рф|россия|гео|кроме)$/i.test(p));
    for (const part of parts) {
      const id = matchRuRegionId(part);
      if (id && !excludeIds.includes(id)) excludeIds.push(id);
      else if (!id) unmatched.push(part);
    }
  }

  // Unique geos
  const uniqGeos = [...new Set(geos)];
  const includeIds = uniqGeos.map((g) => GEO_INCLUDE_IDS[g]).filter(Boolean);

  // Direct: must have ≥1 positive region; negatives are exclusions inside them
  const regionIds = [
    ...includeIds,
    ...excludeIds.map((id) => -Math.abs(id)),
  ];

  return {
    geos: uniqGeos,
    include_ids: includeIds,
    exclude_ids: excludeIds,
    region_ids: regionIds,
    unmatched,
    raw,
  };
}

/** Merge include geos + optional exclusion parse into final Direct RegionIds. */
export function buildDirectRegionIds({ geos = [], geoRulesText = '', extraExcludeIds = [] } = {}) {
  const fromRules = parseGeoRulesText(geoRulesText);
  const geoList = [...new Set([...(geos || []), ...fromRules.geos])];
  let include = geoList.map((g) => GEO_INCLUDE_IDS[String(g).toUpperCase()]).filter(Boolean);
  if (!include.length && fromRules.include_ids.length) include = [...fromRules.include_ids];
  if (!include.length && (fromRules.exclude_ids.length || geoRulesText)) {
    // Exclusions without explicit РФ still imply Russia for РСЯ MFO offers
    include = [225];
    if (!geoList.includes('RU')) geoList.push('RU');
  }
  const exclude = [
    ...new Set([...(fromRules.exclude_ids || []), ...(extraExcludeIds || []).map(Number)]),
  ].filter((n) => Number.isFinite(n) && n > 0);

  // Drop exclude ids that aren't under an include (Direct rejects orphan minus-regions)
  // For RU (225) almost all RF subjects are valid minus-regions.
  const regionIds = [...include, ...exclude.map((id) => -id)];
  return {
    geos: geoList.length ? geoList : include.includes(225) ? ['RU'] : [],
    include_ids: include,
    exclude_ids: exclude,
    region_ids: regionIds,
    unmatched: fromRules.unmatched,
    raw: fromRules.raw,
  };
}
