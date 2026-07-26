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

export const JUNK_LEXICONS = {
  fintech_cards: {
    id: 'fintech_cards',
    placement_patterns: [
      'games',
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
      // GIS / weather / news maps (pollution from seed «карта онлайн»)
      'осадки',
      'осадок',
      'погода',
      'яндекс карты',
      'google maps',
      'навигатор',
      'маршрут',
      'мапс',
      'карта сайта',
      'бензин',
      'сво',
      'натальная',
      'матрица судьбы',
      'медкарта',
      'сим карта',
      'спутниковая',
      'в реальном времени',
      'пусть говорят',
    ],
    note: 'Карты: минус займы/игры/дети/вакансии/GIS; ядро — зарубежная карта / СБП / подписки',
  },
  fintech_loans: {
    id: 'fintech_loans',
    placement_patterns: [
      'games',
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
    ],
    keyword_negatives: [
      ...RSYA_AUTO_NEGATIVES,
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
    note: 'Займы: минус карты/игры/дети; не минусовать «займ/онлайн/паспорт»',
  },
  default: {
    id: 'default',
    placement_patterns: [
      'games',
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
