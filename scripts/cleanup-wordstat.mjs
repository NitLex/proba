#!/usr/bin/env node
/**
 * Cleanup raw Wordstat live output for PPM RSYa (Travel / Services / SBP).
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

const BASE_NEGATIVES = [
  'бесплатно', 'халява', 'взлом', 'кряк', 'скачать', 'торрент',
  'работа', 'вакансия', 'займ', 'микрозайм', 'кредит наличными',
  'казино', 'ставки', '1xbet', 'крипта', 'bitcoin', 'p2p', 'обнал',
  'для детей', 'школьник',
];

/** Extra negatives learned from this live dump (maps / SVO / blue-card / SIM). */
const EXTRA_NEGATIVES = [
  'осадки', 'осадок', 'погода', 'яндекс карты', 'навигатор', 'маршрут',
  'мапс', 'карта сайта', 'бензин', 'сво', 'натальная', 'матрица судьбы',
  'медкарта', 'межевание', 'синяя карта', 'сим карта', 'симки',
  'платная дорога', 'платный проезд', 'смотреть онлайн', 'блог',
  'пусть говорят', 'из бумаги', 'картатай', 'в реальном времени',
  'украина', 'игры в поездку', 'госуслуги',
];

/** Avoid \\b — it does not work reliably for Cyrillic in JS. */
const JUNK_RE =
  /осадк|осадок|погод|яндекс\s*карт|навигатор|проложить маршрут|построить маршрут|мапс|карта сайта|бензин|карта\s*сво|(^|\s)сво(\s|$)|украин|натальн|матрица онлайн|займ|микрозайм|медкарт|межеван|синяя карта|син(юю|ей)\s+карт|сим\s*карт|платн(ая|ую|ый)\s+(дорог|проезд)|оплатить платн|как оплатить проезд|как платить за платн|госуслуги|блог путешествен|смотреть онлайн|пусть говорят|из бумаги|картатай|игры в поездку|я тебя не скоро|знать мир на пять|этот мир придуман|а может просто негром|схема онлайн|маршрут\s*\d|84г/;

/** Broad «карта онлайн» = geo/weather maps, not payment cards. */
const MAP_ONLINE_RE =
  /^(карты? онлайн|карты онлайн бесплатно|карты онлайн время|карта онлайн в реальном|карта в реальном времени онлайн|карта на сегодня онлайн|онлайн карта без карты)$/i;

const HEURISTIC = {
  travel: [
    'виртуальная карта для путешествий',
    'карта для оплаты за границей',
    'оплата за границей картой',
    'карта для поездок за рубеж',
    'виртуальная карта для поездок',
    'карта для путешествий',
    'оплата за границей',
    'карта для отпуска',
    'цифровая карта для поездок',
    'карта для туристов',
    'виртуальная карта онлайн',
    'карта для оплаты за рубежом',
    'банковская карта для поездок',
    'карта для путешествий за границу',
    'оплата за границей виртуальной картой',
  ],
  services: [
    'зарубежные сервисы',
    'оплата зарубежных сервисов',
    'карта для зарубежных сервисов',
    'карта для подписок',
    'виртуальная карта в долларах',
    'карта для зарубежных подписок',
    'виртуальная карта для сервисов',
    'карта для оплаты подписок',
    'онлайн карта для сервисов',
    'карта в валюте',
    'виртуальная карта usd',
    'оплата иностранных сервисов',
    'карта для оплаты сервисов',
    'цифровая карта для подписок',
    'виртуальная карта для подписок',
    'карта для онлайн подписок',
    'оплата сервисов онлайн',
    'виртуальная карта для зарубежных сервисов',
  ],
  sbp: [
    'пополнение по СБП',
    'карта за минуты',
    'промокод на выпуск',
    'выпуск карты онлайн',
    'оформление карты онлайн',
    'виртуальная карта за минуты',
    'карта с пополнением по СБП',
    'быстрый выпуск карты',
    'выпустить карту онлайн',
    'цифровая карта онлайн',
    'оформить виртуальную карту',
    'выпуск виртуальной карты',
    'карта онлайн с СБП',
    'промокод на карту',
  ],
};

function assignGroup(phrase) {
  const p = phrase.toLowerCase();
  if (/сбп|за минут|промокод|выпуск карт|оформлен(ие|ия)\s+карт|выпустить карт/.test(p)) {
    return 'sbp';
  }
  if (/путешеств|границ|поезд|тур|отел|booking|отпуск|турист|за рубеж|за рубежом/.test(p)) {
    return 'travel';
  }
  if (/сервис|подписк|доллар|usd|валюте|spotify|steam|chatgpt|иностранн/.test(p)) {
    return 'services';
  }
  return null;
}

function rejectReason(phrase) {
  const p = phrase.toLowerCase().trim();
  if (p.length < 4) return 'too short';
  if (MAP_ONLINE_RE.test(p)) return 'geo/weather map intent (not payment card)';
  if (JUNK_RE.test(p)) return 'junk/irrelevant association';
  if (/^электронная карта$|^моя электронная карта$/i.test(p)) {
    return 'too generic electronic card';
  }
  if (/скачать/.test(p)) return 'download intent (minus)';
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
      groups[g].push({ phrase, shows: null, source: 'heuristic' });
    }
  }

  for (const g of Object.keys(groups)) {
    groups[g] = uniqPhrases(groups[g]);
    // Prefer live phrases with shows first, then heuristics
    groups[g].sort((a, b) => {
      const as = a.shows ?? -1;
      const bs = b.shows ?? -1;
      if (as !== bs) return bs - as;
      return a.phrase.localeCompare(b.phrase, 'ru');
    });
  }

  const negatives = [...new Set([...BASE_NEGATIVES, ...EXTRA_NEGATIVES])];

  return {
    offer: raw.offer || 'Плати по миру (LeadGid 7397)',
    geo: raw.geo || 'RU',
    region_ids: [225],
    channel: 'Yandex Direct РСЯ',
    source: 'wordstat_live+cleanup',
    mode: raw.mode || raw.semantics?.mode || 'live',
    notes: [
      'Сырой Wordstat live зашумлён сидом «карта онлайн»: осадки, СВО, натальные, навигаторы, платные дороги.',
      'Углы аналитика: Travel / Services / SBP (не Premium). Services почти не пришли из live — добиты эвристикой.',
      'Синяя карта / SIM / межевание / ТВ-ассоциации к «оформление за минуты» вычищены.',
      'Seed «Плати по миру - Выпуск карты» дал Invalid query — не использовать бренд с тире как Wordstat-запрос.',
    ],
    groups: {
      travel: { title: 'Путешествия / оплата за границей', keywords: groups.travel },
      services: { title: 'Зарубежные сервисы и подписки', keywords: groups.services },
      sbp: { title: 'Быстрый выпуск + СБП', keywords: groups.sbp },
    },
    negatives,
    rejected,
    autotargeting: 'suspended_on_start',
    bid_hint_rub: 5,
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
      `# РСЯ | PPM | ${titles[g]} — финальные ключи (вставка в группу)\n` +
      `# Оффер: Плати по миру / гео RU / автотаргетинг выкл. на старте\n\n`;
    const body = result.groups[g].keywords.map((k) => k.phrase).join('\n') + '\n';
    fs.writeFileSync(path.join(dir, `keywords-${g}.txt`), header + body);
  }
  fs.writeFileSync(
    path.join(dir, 'negatives.txt'),
    '# Минус-слова кампании РСЯ | PPM\n\n' + result.negatives.join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'keywords-final.json'),
    JSON.stringify(result, null, 2) + '\n',
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
