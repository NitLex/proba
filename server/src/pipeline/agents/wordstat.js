/**
 * Wordstat / semantics agent.
 * Live: Yandex Cloud Search API (WORDSTAT / YANDEX_CLOUD_*).
 * Fallback: heuristic seeds from analyst angles.
 */

import { expandSeeds, wordstatConfig } from '../../lib/wordstat.js';
import {
  filterOfficeDocumentJunk,
  isOfficeDocumentJunk,
  junkLexiconForVertical,
  mergeNegatives,
} from '../../lib/junkLexicon.js';
import { seedsFromOfferFacts } from '../../lib/offerFacts.js';

function seedsFromAngles(angles = [], verticalKey = '', offer = {}, playbook = {}) {
  const facts = playbook.offer_facts || offer.facts || {};
  const seeds = [...seedsFromOfferFacts(offer, facts)];
  for (const a of angles) {
    for (const h of a.hooks || []) seeds.push(h);
  }
  if (verticalKey === 'fintech_loans') {
    seeds.push(
      'займ онлайн',
      'кредит онлайн',
      'заявка на кредит',
      'микрозайм срочно',
      'займ по паспорту',
    );
    return [...new Set(seeds.filter(Boolean))];
  }
  if (verticalKey === 'unknown') {
    return [...new Set(seeds.filter(Boolean))];
  }
  // Card seeds ONLY for cards vertical
  if (verticalKey === 'fintech_cards') {
    for (const a of angles) {
      if (a.id === 'travel') {
        seeds.push(
          'виртуальная карта для путешествий',
          'зарубежная карта для поездок',
          'оплата за границей картой',
          'карта для поездок',
        );
      }
      if (a.id === 'services') {
        seeds.push(
          'оплата зарубежных сервисов',
          'зарубежная карта для подписок',
          'карта для зарубежных сервисов',
        );
      }
      if (a.id === 'premium') {
        seeds.push('премиальная виртуальная карта', 'зарубежная карта премиум');
      }
    }
  }
  return [...new Set(seeds.filter(Boolean))];
}

/** Negatives from junk lexicon (per vertical). */
function negativesForVertical(verticalKey) {
  return mergeNegatives([], verticalKey);
}

function assignGroup(phrase, angles) {
  const p = phrase.toLowerCase();
  const has = (id) => angles.some((a) => a.id === id);
  if (has('speed') && /быстр|минут|срочно|онлайн/.test(p)) return 'speed';
  // Passport angle: only loan-intent docs, not bare «документ» (PDF/Word Wordstat bleed)
  if (
    has('passport') &&
    (/паспорт/.test(p) ||
      /минимум\s+документ|мало\s+документ|без\s+документ|документы?\s+для\s+(?:займ|кредит)/.test(p))
  ) {
    return 'passport';
  }
  if (has('amount') && /сумм|до \d|на карту|наличн/.test(p)) return 'amount';
  if (has('sbp') && /сбп|выпуск карт|открыть карт|пополнен/.test(p)) return 'sbp';
  if (has('services') && /сервис|подписк|доллар|spotify|steam|chatgpt|онлайн.?оплат/.test(p)) {
    return 'services';
  }
  if (has('travel') && /путешеств|границ|поезд|тур|отел|booking|за рубеж|зарубежн/.test(p)) {
    return 'travel';
  }
  if (has('premium') && /премиум|курс/.test(p)) return 'premium';
  return angles[0]?.id || 'generic';
}

/** If clustering collapsed into one angle, seed empty groups from angle hooks/fallbacks. */
function ensureGroupsHaveKeywords(byGroup, angles, keywords) {
  const pool = keywords.map((k) => k.phrase).filter(Boolean);
  for (const a of angles) {
    if ((byGroup[a.id] || []).length) continue;
    const hooks = (a.hooks || []).filter(Boolean);
    byGroup[a.id] = [...new Set([...hooks, ...pool.slice(0, 6)])].slice(0, 20);
  }
  return byGroup;
}

export async function runWordstat({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [];
  const verticalKey = playbook.vertical_key || context.analysis?.vertical_key || '';
  const seeds = seedsFromAngles(angles, verticalKey, offer, playbook);
  if (offer.name) seeds.unshift(String(offer.name).slice(0, 80));
  const negatives = negativesForVertical(verticalKey);
  const lexicon = junkLexiconForVertical(verticalKey);
  const regions = (playbook.region_ids || context.analysis?.region_ids || [])
    .map(String)
    .filter(Boolean);

  const cfg = wordstatConfig();
  let mode = 'heuristic';
  let live = null;
  let keywords = [];

  if (cfg.configured) {
    live = await expandSeeds(seeds, regions.length ? { regions } : {});
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

  // Strip PDF/Word/office Wordstat bleed (esp. around loan hook «минимум документов»)
  const scrub =
    verticalKey === 'fintech_loans' || keywords.some((k) => /документ|пдф|pdf|ворд|word/i.test(k.phrase))
      ? filterOfficeDocumentJunk(keywords)
      : { kept: keywords, dropped: [] };
  keywords = scrub.kept;
  const droppedJunk = scrub.dropped;

  let byGroup = {};
  for (const kw of keywords) {
    byGroup[kw.group] = byGroup[kw.group] || [];
    byGroup[kw.group].push(kw.phrase);
  }
  // Don't refill empty groups with office junk from the pool
  byGroup = ensureGroupsHaveKeywords(
    byGroup,
    angles,
    keywords.filter((k) => !isOfficeDocumentJunk(k.phrase)),
  );
  for (const id of Object.keys(byGroup)) {
    byGroup[id] = byGroup[id].filter((p) => !isOfficeDocumentJunk(p));
  }

  const liveErrors = live?.errors || [];

  return {
    summary: cfg.configured
      ? `Wordstat live (${mode}): ${keywords.length} фраз (−${droppedJunk.length} office-junk), ошибок ${liveErrors.length}, seeds ${seeds.length}`
      : `Семантика heuristic: ${keywords.length} фраз (нет YANDEX_CLOUD_API_KEY + FOLDER_ID)`,
    semantics: {
      mode,
      configured: cfg.configured,
      live_errors: liveErrors,
      live_meta: live
        ? {
            maxSeeds: live.config?.maxSeeds,
            regions: live.config?.regions || regions,
            blocks: live.items?.length,
          }
        : { regions },
      keywords,
      groups: byGroup,
      negatives,
      junk_lexicon: lexicon,
      dropped_office_junk: droppedJunk.slice(0, 40),
      autotargeting: 'suspended_on_start',
      seeds,
      vertical_key: verticalKey,
      note:
        'Кластеры по углам; минус дети/игры/скачать + junk lexicon; office/PDF Wordstat-мусор выкинут из плюс-фраз',
    },
    cursor_prompt: [
      'Ты агент семантики (Wordstat) для Яндекс.Директ РСЯ.',
      `Оффер: ${offer.name || ''} / гео ${playbook.geo || offer.geo || ''} / vertical ${verticalKey}`,
      `Режим сбора: ${mode}`,
      `Углы: ${JSON.stringify(angles)}`,
      `Топ ключей: ${JSON.stringify(keywords.slice(0, 40))}`,
      `Минус-слова: ${JSON.stringify(negatives)}`,
      `Выкинутый office-junk: ${JSON.stringify(droppedJunk.slice(0, 20))}`,
      `Junk lexicon: ${lexicon.note}`,
      'Дополни кластеры по углам оффера, убери мусор. Не минусуй ядро вертикали (займ/паспорт/минимум документов).',
    ].join('\n'),
    context_patch: {
      semantics: {
        mode,
        keywords,
        groups: byGroup,
        negatives,
        junk_lexicon: lexicon,
        dropped_office_junk: droppedJunk.slice(0, 40),
      },
    },
  };
}
