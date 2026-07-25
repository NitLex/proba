/**
 * Wordstat / semantics agent.
 * Live: Yandex Cloud Search API (WORDSTAT / YANDEX_CLOUD_*).
 * Fallback: heuristic seeds from analyst angles.
 */

import { expandSeeds, wordstatConfig } from '../../lib/wordstat.js';

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

function assignGroup(phrase, angles) {
  const p = phrase.toLowerCase();
  for (const a of angles) {
    if (a.id === 'travel' && /путешеств|границ|поезд|тур|отел|booking/.test(p)) return 'travel';
    if (a.id === 'services' && /сервис|подписк|доллар|spotify|steam|chatgpt/.test(p)) return 'services';
    if (a.id === 'premium' && /премиум|курс/.test(p)) return 'premium';
  }
  return angles[0]?.id || 'generic';
}

export async function runWordstat({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [];
  const seeds = seedsFromAngles(angles);
  if (offer.name) seeds.unshift(String(offer.name).slice(0, 80));

  const cfg = wordstatConfig();
  let mode = 'heuristic';
  let live = null;
  let keywords = [];

  if (cfg.configured) {
    live = await expandSeeds(seeds);
    mode = live.mode;
    if (live.keywords?.length) {
      keywords = live.keywords.slice(0, 80).map((k) => ({
        phrase: k.phrase,
        shows: k.shows,
        kind: k.kind,
        seed: k.seed,
        group: assignGroup(k.phrase, angles),
        context_bid_hint: playbook.economics?.cpc_max || 7,
        source: 'wordstat_live',
      }));
    }
  }

  if (!keywords.length) {
    mode = cfg.configured ? mode || 'heuristic_fallback' : 'heuristic';
    keywords = seeds.map((phrase) => ({
      phrase,
      shows: null,
      group: assignGroup(phrase, angles),
      context_bid_hint: playbook.economics?.cpc_max || 7,
      source: 'heuristic',
    }));
  }

  const byGroup = {};
  for (const kw of keywords) {
    byGroup[kw.group] = byGroup[kw.group] || [];
    byGroup[kw.group].push(kw.phrase);
  }

  const liveErrors = live?.errors || [];

  return {
    summary: cfg.configured
      ? `Wordstat live (${mode}): ${keywords.length} фраз, ошибок ${liveErrors.length}, seeds ${seeds.length}`
      : `Семантика heuristic: ${keywords.length} фраз (нет YANDEX_CLOUD_API_KEY + FOLDER_ID)`,
    semantics: {
      mode,
      configured: cfg.configured,
      live_errors: liveErrors,
      live_meta: live
        ? { maxSeeds: live.config?.maxSeeds, regions: live.config?.regions, blocks: live.items?.length }
        : null,
      keywords,
      groups: byGroup,
      negatives: DEFAULT_NEGATIVES,
      autotargeting: 'suspended_on_start',
      seeds,
    },
    cursor_prompt: [
      'Ты агент семантики (Wordstat) для Яндекс.Директ РСЯ.',
      `Оффер: ${offer.name || ''} / гео ${playbook.geo || offer.geo || ''}`,
      `Режим сбора: ${mode}`,
      `Углы: ${JSON.stringify(angles)}`,
      `Топ ключей: ${JSON.stringify(keywords.slice(0, 40))}`,
      `Минус-слова: ${JSON.stringify(DEFAULT_NEGATIVES)}`,
      'Дополни кластеры, убери мусор, подготовь финальные списки для групп Travel/Services. Сохрани в docs или creatives при необходимости.',
    ].join('\n'),
    context_patch: {
      semantics: {
        mode,
        keywords,
        groups: byGroup,
        negatives: DEFAULT_NEGATIVES,
      },
    },
  };
}
