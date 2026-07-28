/**
 * Per-vertical junk lexicon for РСЯ semantics + placement matching.
 */

export const RSYA_AUTO_NEGATIVES = [
  'для детей',
  'дети',
  'школьник',
  'игра',
  'игры',
  'скачать',
  'торрент',
  'вакансия',
  'работа',
  'бесплатно',
  'халява',
  'взлом',
  'кряк',
];

/**
 * Office / PDF / Wordstat bleed around loan hook «минимум документов».
 * Used as campaign negatives (safe single tokens) — never minus «документ» alone
 * (that would kill «минимум документов» / «займ без документов»).
 */
export const DOCUMENT_TOOL_NEGATIVES = [
  'пдф',
  'pdf',
  'ворд',
  'word',
  'ворлд',
  'excel',
  'эксель',
  'сжать',
  'конвертер',
  'преобразовать',
  'редактировать пдф',
  'объединить пдф',
  'папка для документов',
  'файлы для документов',
  'прожиточный минимум',
  'microsoft',
  'google docs',
];

/** Office/PDF/converter intent (Wordstat associations from «минимум документов»). */
const OFFICE_TOOL_RE =
  /пдф|\bpdf\b|ворд(?:е|а|у|ом)?\b|\bword\b|ворлд|excel|эксель|powerpoint|сжать|конвертер|преобразовать|объединить\s+(?:пдф|pdf|файл)|разделить\s+(?:пдф|pdf|файл)|редактировать\s+(?:пдф|pdf)|папка\s+для\s+документ|файлы?\s+для\s+документ|из\s+(?:пдф|pdf)\s+в|в\s+(?:пдф|pdf)|microsoft|гугл\s+док|google\s+docs?|шаблон\s+документ|бланк\s+документ/i;

const LOAN_INTENT_RE =
  /займ|заём|микрозайм|кредит|мфо|заем|по\s+паспорту|только\s+паспорт|без\s+справок|одобрен|на\s+карту|наличн/i;

const LOAN_DOCS_OK_RE =
  /минимум\s+документ|мало\s+документ|без\s+документ|документы?\s+для\s+(?:займ|кредит)/i;

/**
 * Drop Wordstat office/PDF junk while keeping loan-intent «минимум документов» / passport.
 * @returns {boolean} true = junk, strip from positives
 */
export function isOfficeDocumentJunk(phrase) {
  const p = String(phrase || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!p) return true;

  // Social benefits bleed (before «минимум документ» keep-rule)
  if (/прожиточн/.test(p)) return true;

  if (OFFICE_TOOL_RE.test(p)) return true;

  // Clear loan / passport intent stays when not an office tool query
  if (LOAN_INTENT_RE.test(p)) return false;
  if (LOAN_DOCS_OK_RE.test(p)) return false;

  // Bare office-doc neighbours without loan core
  if (
    /документ/.test(p) &&
    /(папк|файл|ворлд|word|pdf|пдф|сжать|конверт|преобраз|шаблон|бланк|microsoft)/.test(p)
  ) {
    return true;
  }
  return false;
}

/** Filter keyword list / phrase arrays; returns { kept, dropped }. */
export function filterOfficeDocumentJunk(phrases = []) {
  const kept = [];
  const dropped = [];
  for (const raw of phrases) {
    const phrase = typeof raw === 'string' ? raw : raw?.phrase;
    if (phrase == null || phrase === '') continue;
    if (isOfficeDocumentJunk(phrase)) dropped.push(phrase);
    else kept.push(raw);
  }
  return { kept, dropped };
}

export const JUNK_LEXICONS = {
  fintech_cards: {
    id: 'fintech_cards',
    placement_patterns: [
      'game',
      'kids',
      'children',
      'torrent',
      'anime',
      'manga',
      'wallpaper',
      'radio',
      'music-free',
      'file-hosting',
      'job',
      'vacancy',
      'rabota',
      'casino',
      'betting',
    ],
    keyword_negatives: [
      ...RSYA_AUTO_NEGATIVES,
      'займ',
      'микрозайм',
      'кредит наличными',
      'казино',
      'ставки',
      '1xbet',
      'крипта',
      'bitcoin',
      'p2p',
      'обнал',
    ],
    note: 'Карты: минус займы/игры/дети/вакансии; ядро — зарубежная карта / СБП / подписки',
  },
  fintech_loans: {
    id: 'fintech_loans',
    placement_patterns: [
      'game',
      'kids',
      'children',
      'torrent',
      'anime',
      'casino',
      'betting',
      'wallpaper',
      'job',
      'vacancy',
      'rabota',
      'pdf',
      'word',
      'converter',
    ],
    keyword_negatives: [
      ...RSYA_AUTO_NEGATIVES,
      ...DOCUMENT_TOOL_NEGATIVES,
      'зарубежная карта',
      'виртуальная карта',
      'сбп карта',
      'казино',
      'ставки',
      'крипта',
      'bitcoin',
      'p2p',
      'обнал',
    ],
    note:
      'Займы: минус карты/игры/дети + PDF/Word office-мусор; не минусовать «займ/онлайн/паспорт/минимум документов»',
  },
  default: {
    id: 'default',
    placement_patterns: [
      'game',
      'kids',
      'children',
      'torrent',
      'anime',
      'casino',
      'betting',
      'job',
      'vacancy',
    ],
    keyword_negatives: [...RSYA_AUTO_NEGATIVES, 'казино', 'ставки', 'крипта', 'p2p'],
    note: 'Базовый мусорный слой РСЯ',
  },
};

export function junkLexiconForVertical(verticalKey = '') {
  if (verticalKey && JUNK_LEXICONS[verticalKey]) return JUNK_LEXICONS[verticalKey];
  return JUNK_LEXICONS.default;
}

/** Merge auto-negatives with existing list; never drop core vertical seeds. */
export function mergeNegatives(existing = [], verticalKey = '') {
  const lex = junkLexiconForVertical(verticalKey);
  return [...new Set([...(existing || []), ...lex.keyword_negatives].map(String).filter(Boolean))];
}

export function placementPatternsForVertical(verticalKey = '') {
  return junkLexiconForVertical(verticalKey).placement_patterns || [];
}
