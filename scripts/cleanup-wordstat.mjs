#!/usr/bin/env node
/**
 * Cleanup raw Wordstat live output for Finandos RSYa (Travel / Services / SBP).
 *
 * Usage:
 *   node scripts/cleanup-wordstat.mjs [raw.json] > creatives/rsya/keywords-final.json
 *   node scripts/cleanup-wordstat.mjs docs/wordstat-raw-live.json --write
 *
 * If no input file is given, uses built-in curated final lists (post live cleanup).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const OFFER = 'Finandos ES RO PL CZ CPL';

const BASE_NEGATIVES = [
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
  'дети',
  'школьник',
  'игра',
  'игры',
];

/** Extra negatives learned from this live dump (maps / SVO / weather / SIM / TV). */
const EXTRA_NEGATIVES = [
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
  'симки',
  'спутниковая',
  'смотреть онлайн',
  'пусть говорят',
  'из бумаги',
  'в реальном времени',
  'украина',
  'карточка образцов',
  'инвентарная',
  'поквартирная',
  'учетная карточка',
  'сервисный портал',
  'пвз',
];

/** Avoid \\b — it does not work reliably for Cyrillic in JS. */
const JUNK_RE =
  /осадк|осадок|погод|яндекс\s*карт|google\s*maps|навигатор|проложить маршрут|построить маршрут|мапс|карта сайта|бензин|карта\s*сво|(^|\s)сво(\s|$)|украин|натальн|матрица онлайн|займ|микрозайм|медкарт|сим\s*карт|спутник|пусть говорят|из бумаги|я тебя не скоро|знать мир на пять|этот мир придуман|а может просто негром|схема онлайн|сервисный портал|инвентарн|учетн(ая|ой)\s+карточка|карточка образцов|поквартирн|карточка клиента|карта пвз|(^|\s)пвз(\s|$)|карты без интернета|карта интернета|оплатить интернет|оплатим\s*ру|плати\s*ру|заплати другому|service online|online payment|gryadka|все платежи|мои платежи/;

/** Broad «карта онлайн» = geo/weather maps, not payment cards. */
const MAP_ONLINE_RE =
  /^(карты? онлайн|карты онлайн бесплатно|карты онлайн время|карта онлайн в реальном|карта в реальном времени онлайн|карта на сегодня онлайн|онлайн карта без карты|карту осадок онлайн)$/i;

/** Too broad / brand-competitor / not fintech intent alone. */
const TOO_BROAD_RE =
  /^(подписки|электронная карта|моя электронная карта|карта пей|счет на оплату на сервис онлайн)$/i;

const HEURISTIC = {
  travel: [
    'цифровая карта для поездок',
    'виртуальная карта для путешествий',
    'зарубежная карта для поездок',
    'оплата за границей картой',
    'карта для поездок',
    'виртуальная карта для поездок',
    'карта для оплаты за границей',
    'оплата за границей',
    'карта для путешествий',
    'банковская карта для поездок',
    'карта для поездок за рубеж',
    'виртуальная карта для оплаты за границей',
    'оплата за границей виртуальной картой',
    'карта для туристов',
  ],
  services: [
    'карта для подписок',
    'оплата сервисов онлайн',
    'оплата зарубежных сервисов',
    'зарубежная карта для подписок',
    'карта для зарубежных сервисов',
    'карта для оплаты подписок',
    'виртуальная карта для подписок',
    'зарубежная карта для оплаты подписок',
    'виртуальная карта для оплаты подписок',
    'иностранная карта для подписок',
    'иностранная карта для оплаты подписок',
    'карта для пробных подписок',
    'цифровая карта для подписок',
    'карта для оплаты сервисов',
    'оплата иностранных сервисов',
    'виртуальная карта для сервисов',
  ],
  sbp: [
    'пополнение по СБП',
    'карта за минуты',
    'промокод на выпуск',
    'выпуск карты онлайн',
    'выпустить виртуальную карту',
    'оформление карты онлайн',
    'виртуальная карта за минуты',
    'карта с пополнением по СБП',
    'быстрый выпуск карты',
    'выпустить карту онлайн',
    'оформить виртуальную карту',
    'выпуск виртуальной карты',
    'карта онлайн с СБП',
    'промокод на карту',
    'заказать дебетовую карту',
  ],
};

export function assignGroup(phrase) {
  const p = phrase.toLowerCase();
  if (/сбп|за минут|промокод|выпуск карт|выпустить (виртуальн|карт)|оформлен(ие|ия)\s+карт|заказать дебетов/.test(p)) {
    return 'sbp';
  }
  if (/путешеств|границ|поезд|тур|отел|booking|отпуск|турист|за рубеж|за рубежом/.test(p)) {
    return 'travel';
  }
  if (/сервис|подпис|доллар|usd|валюте|spotify|steam|chatgpt|иностранн|зарубежн.*карт/.test(p)) {
    return 'services';
  }
  return null;
}

export function rejectReason(phrase) {
  const p = phrase.toLowerCase().trim();
  if (p.length < 4) return 'too short';
  if (MAP_ONLINE_RE.test(p)) return 'geo/weather map intent (not payment card)';
  if (TOO_BROAD_RE.test(p)) return 'too broad / not clusterable alone';
  if (JUNK_RE.test(p)) return 'junk/irrelevant association';
  if (/скачать|бесплатно/.test(p)) return 'download/free intent (minus)';
  return null;
}

function uniqPhrases(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const phrase = String(it.phrase || it).trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(typeof it === 'string' ? { phrase, shows: null, source: 'heuristic' } : { ...it, phrase });
  }
  return out;
}

export function cleanupSemantics(raw = {}) {
  const keywords = raw.keywords || raw.semantics?.keywords || [];
  const rejected = [];
  const kept = [];

  for (const kw of keywords) {
    const phrase = String(kw.phrase || '').trim();
    if (!phrase) continue;
    const reason = rejectReason(phrase);
    if (reason) {
      rejected.push({ phrase, reason, shows: kw.shows ?? null });
      continue;
    }
    const group = assignGroup(phrase);
    if (!group) {
      rejected.push({ phrase, reason: 'no matching cluster', shows: kw.shows ?? null });
      continue;
    }
    kept.push({
      phrase,
      shows: kw.shows ?? null,
      source: kw.source || 'wordstat_live',
      group,
    });
  }

  const groups = { travel: [], services: [], sbp: [] };
  for (const kw of kept) groups[kw.group].push(kw);

  for (const [g, phrases] of Object.entries(HEURISTIC)) {
    const existing = new Set(groups[g].map((k) => k.phrase.toLowerCase()));
    for (const phrase of phrases) {
      if (existing.has(phrase.toLowerCase())) continue;
      groups[g].push({ phrase, shows: null, source: 'heuristic', group: g });
    }
  }

  for (const g of Object.keys(groups)) {
    groups[g] = uniqPhrases(groups[g]).map((k) => ({ ...k, group: g }));
    groups[g].sort((a, b) => {
      const as = a.shows ?? -1;
      const bs = b.shows ?? -1;
      if (as !== bs) return bs - as;
      return a.phrase.localeCompare(b.phrase, 'ru');
    });
  }

  const negatives = [...new Set([...BASE_NEGATIVES, ...EXTRA_NEGATIVES])];

  return {
    offer: raw.offer || OFFER,
    geo: raw.geo || 'RU',
    region_ids: [225],
    channel: 'Yandex Direct РСЯ',
    source: 'wordstat_live+cleanup',
    mode: raw.mode || raw.semantics?.mode || 'live',
    vertical_key: raw.vertical_key || raw.semantics?.vertical_key || 'fintech_cards',
    notes: [
      'Сырой Wordstat live зашумлён сидом «карта онлайн»: осадки, СВО, натальные, навигаторы, GIS.',
      'Углы: Travel / Services / SBP. Services live дал ядро подписок — добито эвристикой.',
      'ТВ/песни/поделки к «оформление за минуты», SIM/ПВЗ/учётные карточки вычищены.',
      'Не минусовать ядро вертикали: виртуальная/зарубежная карта, подписки, СБП, выпуск.',
      'Seed «карта онлайн» в следующие прогоны не использовать — только уточнённые карточные фразы.',
    ],
    groups: {
      travel: { title: 'Поездки / travel-оплаты', keywords: groups.travel },
      services: { title: 'Подписки и онлайн-сервисы', keywords: groups.services },
      sbp: { title: 'Быстрый выпуск + СБП', keywords: groups.sbp },
    },
    negatives,
    rejected,
    autotargeting: 'suspended_on_start',
    bid_hint_rub: 1,
    stats: {
      raw_phrases: keywords.length,
      kept_travel: groups.travel.length,
      kept_services: groups.services.length,
      kept_sbp: groups.sbp.length,
      rejected: rejected.length,
      negatives: negatives.length,
    },
  };
}

function writeTxtLists(result) {
  const dir = path.join(root, 'creatives/rsya');
  fs.mkdirSync(dir, { recursive: true });
  const titles = {
    travel: 'Travel',
    services: 'Services',
    sbp: 'SBP',
  };
  for (const g of ['travel', 'services', 'sbp']) {
    const header =
      `# РСЯ | Finandos | ${titles[g]} — финальные ключи (вставка в группу)\n` +
      `# Оффер: ${OFFER} / гео RU / автотаргетинг выкл. на старте\n\n`;
    const body = result.groups[g].keywords.map((k) => k.phrase).join('\n') + '\n';
    fs.writeFileSync(path.join(dir, `keywords-${g}.txt`), header + body);
  }
  fs.writeFileSync(
    path.join(dir, 'negatives.txt'),
    `# Минус-слова кампании РСЯ | ${OFFER}\n\n` + result.negatives.join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'keywords-final.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'README_KEYWORDS.txt'),
    [
      `Семантика РСЯ «${OFFER}» (Wordstat cleanup)`,
      '================================================',
      '',
      'Файлы:',
      '- keywords-final.json     — полный результат чистки (для пайплайна / Директ-агента)',
      '- keywords-travel.txt     — группа Travel',
      '- keywords-services.txt   — группа Services',
      '- keywords-sbp.txt        — группа SBP (быстрый выпуск + СБП)',
      '- negatives.txt           — минус-слова кампании',
      '',
      'Документация: docs/SEMANTICS_PPM_WORDSTAT.md',
      '',
      'Как использовать в Директе:',
      '1) Создай группу объявлений под угол (Travel / Services / SBP)',
      '2) Вставь фразы из соответствующего .txt (по одной на строку, без строк с #)',
      '3) На кампанию добавь минус-слова из negatives.txt',
      '4) Автотаргетинг на старте выключи',
      '',
      'Пересборка:',
      '  npm run semantics:cleanup',
      '',
    ].join('\n'),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const file = args.find((a) => !a.startsWith('--'));
  let raw = {};
  if (file) {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    const curated = path.join(root, 'creatives/rsya/keywords-final.json');
    if (fs.existsSync(curated)) raw = JSON.parse(fs.readFileSync(curated, 'utf8'));
  }
  const input = raw.keywords || raw.semantics
    ? raw
    : {
        keywords: Object.values(raw.groups || {}).flatMap((g) =>
          (g.keywords || []).map((k) => ({ ...k, group: undefined })),
        ),
      };
  if (raw.groups && !raw.keywords && !raw.semantics) {
    const flat = [];
    for (const [group, block] of Object.entries(raw.groups)) {
      for (const k of block.keywords || []) flat.push({ ...k, group });
    }
    input.keywords = flat;
  }
  const result = cleanupSemantics(input);
  if (write) {
    writeTxtLists(result);
    console.error(
      `Wrote creatives/rsya/keywords-*.txt + keywords-final.json ` +
        `(${result.stats.kept_travel}+${result.stats.kept_services}+${result.stats.kept_sbp} kept, ` +
        `${result.stats.rejected} rejected)`,
    );
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}
