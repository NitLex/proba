/**
 * Wordstat / semantics agent.
 * Uses playbook angles; optionally calls Yandex Wordstat XML/API if WORDSTAT_* env set.
 * Without API — generates seed keywords + negatives from angles (usable in Direct).
 */

function seedsFromAngles(angles = []) {
  const seeds = [];
  for (const a of angles) {
    for (const h of a.hooks || []) seeds.push(h);
    if (a.id === 'travel') {
      seeds.push(
        'виртуальная карта для путешествий',
        'карта для оплаты за границей',
        'оплата за границей картой',
        'карта для поездок',
      );
    }
    if (a.id === 'services') {
      seeds.push(
        'оплата зарубежных сервисов',
        'карта для подписок',
        'виртуальная карта в долларах',
        'карта для зарубежных сервисов',
      );
    }
    if (a.id === 'premium') {
      seeds.push('премиальная виртуальная карта', 'карта с выгодным курсом');
    }
  }
  return [...new Set(seeds.filter(Boolean))];
}

const DEFAULT_NEGATIVES = [
  'бесплатно',
  'халява',
  'взлом',
  'кряк',
  'скачать',
  'торрент',
  'работа',
  'вакансия',
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
  'для детей',
  'школьник',
];

async function fetchWordstatIfConfigured(phrases) {
  // Placeholder for real Wordstat integration (Partner API / XML).
  // Env: WORDSTAT_TOKEN — when present, future HTTP call goes here.
  if (!process.env.WORDSTAT_TOKEN && !process.env.YANDEX_WORDSTAT_TOKEN) {
    return { mode: 'heuristic', phrases: [] };
  }
  // Not fully wired: return marker so UI shows "token present, need live call".
  return {
    mode: 'token_present_stub',
    note: 'WORDSTAT_TOKEN задан, но live-запрос ещё не подключён — используем эвристику + seeds.',
    phrases: phrases.map((p) => ({ phrase: p, shows: null })),
  };
}

export async function runWordstat({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [];
  const seeds = seedsFromAngles(angles);
  if (offer.name) seeds.unshift(String(offer.name).slice(0, 80));

  const remote = await fetchWordstatIfConfigured(seeds);
  const keywords = seeds.map((phrase, i) => ({
    phrase,
    group: angles[i % Math.max(angles.length, 1)]?.id || 'generic',
    context_bid_hint: playbook.economics?.cpc_max || 7,
    source: remote.mode === 'heuristic' ? 'heuristic' : 'wordstat_stub',
  }));

  const byGroup = {};
  for (const kw of keywords) {
    byGroup[kw.group] = byGroup[kw.group] || [];
    byGroup[kw.group].push(kw.phrase);
  }

  return {
    summary: `Семантика: ${keywords.length} фраз, минусов ${DEFAULT_NEGATIVES.length}. Режим: ${remote.mode}.`,
    semantics: {
      mode: remote.mode,
      remote_note: remote.note || null,
      keywords,
      groups: byGroup,
      negatives: DEFAULT_NEGATIVES,
      autotargeting: 'suspended_on_start',
    },
    cursor_prompt: [
      'Ты агент семантики (Wordstat) для Яндекс.Директ РСЯ.',
      `Оффер: ${offer.name || ''} / гео ${playbook.geo || offer.geo || ''}`,
      `Углы: ${JSON.stringify(angles)}`,
      `Seeds: ${JSON.stringify(seeds)}`,
      'Расширь ключи, дай частотность (если есть Wordstat), кластеры и минус-слова. JSON.',
    ].join('\n'),
    context_patch: {
      semantics: {
        keywords,
        groups: byGroup,
        negatives: DEFAULT_NEGATIVES,
      },
    },
  };
}
