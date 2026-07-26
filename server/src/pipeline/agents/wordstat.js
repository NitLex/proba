/**
 * Wordstat / semantics agent.
 * Live: Yandex Cloud Search API (WORDSTAT / YANDEX_CLOUD_*).
 * Fallback: heuristic seeds from analyst angles.
 */

import { expandSeeds, wordstatConfig } from '../../lib/wordstat.js';
import { mergeNegatives, junkLexiconForVertical } from '../../lib/junkLexicon.js';

/** Seeds that pull GIS/weather/news maps — never send to Wordstat for fintech_cards. */
const BAD_SEED_RE =
  /^(карты? онлайн|карта онлайн в реальном|карту? осадок онлайн|карта осадков онлайн)$/i;

const JUNK_PHRASE_RE =
  /осадк|осадок|погод|яндекс\s*карт|google\s*maps|навигатор|маршрут|мапс|карта сайта|бензин|карта\s*сво|(^|\s)сво(\s|$)|украин|натальн|матрица онлайн|займ|микрозайм|медкарт|сим\s*карт|спутник|пусть говорят|из бумаги|я тебя не скоро|знать мир на пять|этот мир придуман|а может просто негром|схема онлайн|сервисный портал|инвентарн|учетн(ая|ой)\s+карточка|карточка образцов|поквартирн|карточка клиента|карта пвз|карты без интернета|карта интернета|оплатить интернет|оплатим\s*ру|плати\s*ру|заплати другому|service online|online payment|gryadka|все платежи|мои платежи/;

const MAP_ONLINE_RE =
  /^(карты? онлайн|карты онлайн бесплатно|карты онлайн время|карта онлайн в реальном|карта в реальном времени онлайн|карта на сегодня онлайн|онлайн карта без карты|карту осадок онлайн|электронная карта|моя электронная карта|подписки)$/i;

function seedsFromAngles(angles = [], verticalKey = '') {
  const seeds = [];
  for (const a of angles) {
    for (const h of a.hooks || []) {
      if (BAD_SEED_RE.test(String(h).trim())) continue;
      seeds.push(h);
    }
  }
  if (verticalKey === 'fintech_loans') {
    seeds.push(
      'займ онлайн',
      'займ на карту',
      'микрозайм срочно',
      'деньги до зарплаты',
      'займ по паспорту',
    );
    return [...new Set(seeds.filter(Boolean))];
  }
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
        'виртуальная карта для подписок',
      );
    }
    if (a.id === 'sbp') {
      seeds.push(
        'пополнение по СБП',
        'выпуск виртуальной карты',
        'виртуальная карта за минуты',
        'промокод на карту',
      );
    }
    if (a.id === 'premium') {
      seeds.push('премиальная виртуальная карта', 'зарубежная карта премиум');
    }
  }
  return [...new Set(seeds.filter(Boolean))];
}

/** Negatives from junk lexicon (per vertical). */
function negativesForVertical(verticalKey) {
  return mergeNegatives([], verticalKey);
}

export function isJunkPhrase(phrase) {
  const p = String(phrase || '')
    .toLowerCase()
    .trim();
  if (!p || p.length < 4) return true;
  if (MAP_ONLINE_RE.test(p)) return true;
  if (JUNK_PHRASE_RE.test(p)) return true;
  if (/скачать|бесплатно/.test(p)) return true;
  return false;
}

export function assignGroup(phrase, angles) {
  const p = phrase.toLowerCase();
  const has = (id) => angles.some((a) => a.id === id);
  if (has('speed') && /быстр|минут|срочно|онлайн/.test(p)) return 'speed';
  if (has('passport') && /паспорт|документ/.test(p)) return 'passport';
  if (has('amount') && /сумм|до \d|на карту|наличн/.test(p)) return 'amount';
  if (has('sbp') && /сбп|выпуск карт|выпустить (виртуальн|карт)|открыть карт|пополнен|промокод|за минут|заказать дебетов/.test(p)) {
    return 'sbp';
  }
  if (has('services') && /сервис|подпис|доллар|spotify|steam|chatgpt|онлайн.?оплат|иностранн|зарубежн.*карт/.test(p)) {
    return 'services';
  }
  if (has('travel') && /путешеств|границ|поезд|тур|отел|booking|за рубеж|зарубежн/.test(p)) {
    return 'travel';
  }
  if (has('premium') && /премиум|курс/.test(p)) return 'premium';
  // Prefer a matching angle by hooks rather than dumping junk into angles[0]
  for (const a of angles) {
    const hooks = (a.hooks || []).map((h) => String(h).toLowerCase());
    if (hooks.some((h) => h && (p.includes(h) || h.includes(p)))) return a.id;
  }
  return angles.find((a) => a.id === 'services')?.id || angles[0]?.id || 'generic';
}

/** If clustering collapsed into one angle, seed empty groups from angle hooks/fallbacks. */
function ensureGroupsHaveKeywords(byGroup, angles, keywords) {
  const pool = keywords.map((k) => k.phrase).filter(Boolean);
  for (const a of angles) {
    if ((byGroup[a.id] || []).length) continue;
    const hooks = (a.hooks || []).filter((h) => h && !BAD_SEED_RE.test(h) && !isJunkPhrase(h));
    byGroup[a.id] = [...new Set([...hooks, ...pool.slice(0, 6)])].slice(0, 20);
  }
  return byGroup;
}

export async function runWordstat({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [];
  const verticalKey = playbook.vertical_key || context.analysis?.vertical_key || '';
  const seeds = seedsFromAngles(angles, verticalKey);
  if (offer.name && !/[-—]/.test(String(offer.name))) {
    seeds.unshift(String(offer.name).slice(0, 80));
  }
  const negatives = negativesForVertical(verticalKey);
  const lexicon = junkLexiconForVertical(verticalKey);

  const cfg = wordstatConfig();
  let mode = 'heuristic';
  let live = null;
  let keywords = [];
  const rejected = [];

  if (cfg.configured) {
    live = await expandSeeds(seeds);
    mode = live.mode;
    if (live.keywords?.length) {
      for (const k of live.keywords.slice(0, 120)) {
        if (isJunkPhrase(k.phrase)) {
          rejected.push({ phrase: k.phrase, reason: 'junk/map/irrelevant', shows: k.shows ?? null });
          continue;
        }
        keywords.push({
          phrase: k.phrase,
          shows: k.shows,
          kind: k.kind,
          seed: k.seed,
          group: assignGroup(k.phrase, angles),
          context_bid_hint: playbook.economics?.cpc_max || 7,
          source: 'wordstat_live',
        });
        if (keywords.length >= 80) break;
      }
    }
  }

  if (!keywords.length) {
    mode = cfg.configured ? mode || 'heuristic_fallback' : 'heuristic';
    keywords = seeds
      .filter((phrase) => !isJunkPhrase(phrase))
      .map((phrase) => ({
        phrase,
        shows: null,
        group: assignGroup(phrase, angles),
        context_bid_hint: playbook.economics?.cpc_max || 7,
        source: 'heuristic',
      }));
  }

  let byGroup = {};
  for (const kw of keywords) {
    byGroup[kw.group] = byGroup[kw.group] || [];
    byGroup[kw.group].push(kw.phrase);
  }
  byGroup = ensureGroupsHaveKeywords(byGroup, angles, keywords);

  const liveErrors = live?.errors || [];

  return {
    summary: cfg.configured
      ? `Wordstat live (${mode}): ${keywords.length} фраз, отброшено ${rejected.length}, ошибок ${liveErrors.length}, seeds ${seeds.length}`
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
      negatives,
      junk_lexicon: lexicon,
      rejected: rejected.slice(0, 80),
      autotargeting: 'suspended_on_start',
      seeds,
      vertical_key: verticalKey,
      note: 'Кластеры строго по углам; автоминуса дети/игры/скачать/вакансии + junk lexicon вертикали; GIS/осадки отфильтрованы',
    },
    cursor_prompt: [
      'Ты агент семантики (Wordstat) для Яндекс.Директ РСЯ.',
      `Оффер: ${offer.name || ''} / гео ${playbook.geo || offer.geo || ''} / vertical ${verticalKey}`,
      `Режим сбора: ${mode}`,
      `Углы: ${JSON.stringify(angles)}`,
      `Топ ключей: ${JSON.stringify(keywords.slice(0, 40))}`,
      `Минус-слова: ${JSON.stringify(negatives)}`,
      `Junk lexicon: ${lexicon.note}`,
      'Дополни кластеры по углам оффера, убери мусор. Не минусуй ядро вертикали.',
    ].join('\n'),
    context_patch: {
      semantics: {
        mode,
        keywords,
        groups: byGroup,
        negatives,
        junk_lexicon: lexicon,
        rejected: rejected.slice(0, 40),
      },
    },
  };
}
