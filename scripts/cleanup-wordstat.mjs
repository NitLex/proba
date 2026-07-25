#!/usr/bin/env node
/**
 * Cleanup raw Wordstat live output for PPM RSYa (Travel / Services / Premium).
 *
 * Usage:
 *   node scripts/cleanup-wordstat.mjs [raw.json] > creatives/rsya/keywords-final.json
 *   node scripts/cleanup-wordstat.mjs --write   # writes txt + json next to defaults
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

const EXTRA_NEGATIVES = [
  'кредит 365', 'credit365', 'личный кабинет', 'войти', 'вход',
  'обменник', 'обмен валюты', 'купить доллары', 'навигатор', 'маршрут',
  'смотреть онлайн', 'блог', 'войска', 'отряд', 'бункер',
  'разрешенная максимальная масса', 'размер м', 'размер л',
  'зарплата', 'просрочка', 'букмекер', 'купить готовые', 'без документов',
];

/** Avoid \\b — it does not work reliably for Cyrillic in JS. */
const JUNK_RE =
  /кредит\s*365|credit365|кабинет|(^|\s)вход(\s|$)|войти|займ|микрозайм|обменник|обмен валют|купить доллар|навигатор|проложить маршрут|построить маршрут|разрешенная максимальная масса|особо крупный размер|^(больш|большо)$|элитн(ые|ый)\s+(войска|отряд)|бункер|на тот большак|размер больше м|больше м или л|маршрут 7|села премиум|(^|\s)ре премиум(\s|$)|какое золото|не выгодно|доступная страна|самая (дорогая|дешевая) валюта|блог путешествен|смотреть онлайн|синяя карта|сбербанк|кошелька|кредиска|войска|отряд/;

const CASH_FX_RE =
  /обменник|обмен валют|купить доллар|купить сегодня по выгод|банки выгодный курс|выгодные курсы банков|где выгодно купить доллар|выгодный курс доллара|выгодный курс евро|выгодный курс сегодня|выгодный курс в моск|выгодный курс купить|выгодный курс обмена|выгодный курс в банке|выгодные курсы москва|доллар курс доллара/;

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
  ],
  premium: [
    'премиальная виртуальная карта',
    'карта с выгодным курсом',
    'премиальная карта с выгодным курсом',
    'виртуальная карта выгодный курс',
    'карта с большим лимитом',
    'премиум виртуальная карта',
  ],
};

function assignGroup(phrase) {
  const p = phrase.toLowerCase();
  if (/путешеств|границ|поезд|тур|отел|booking|отпуск|турист|за рубеж|за рубежом/.test(p)) {
    return 'travel';
  }
  if (/сервис|подписк|доллар|usd|валюте|spotify|steam|chatgpt|иностранн/.test(p)) {
    return 'services';
  }
  if (/премиум|премиальн|курс|лимит/.test(p)) return 'premium';
  return null;
}

function rejectReason(phrase) {
  const p = phrase.toLowerCase().trim();
  if (p.length < 4) return 'too short';
  // Token fragments / noise from bad associations
  if (/^(больш|большо|ре премиум)$/i.test(p)) return 'token fragment / noise';
  if (JUNK_RE.test(p)) return 'junk/irrelevant association or MFO';
  if (CASH_FX_RE.test(p)) return 'cash FX — not virtual card intent';
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
      rejected.push({ phrase, reason });
      continue;
    }
    const group = kw.group && ['travel', 'services', 'premium'].includes(kw.group)
      ? kw.group
      : assignGroup(phrase);
    if (!group) {
      rejected.push({ phrase, reason: 'no matching cluster' });
      continue;
    }
    // Drop cash-FX-ish premium that is only "курс" without card context when high-noise
    if (group === 'premium' && /курс/.test(phrase) && !/карт|лимит|преми/.test(phrase)) {
      // keep short seed "выгодный курс" / "выгодный курс валют" / "самый выгодный курс"
      if (!/^(выгодный курс|выгодный курс валют|самый выгодный курс)$/i.test(phrase)) {
        rejected.push({ phrase, reason: 'FX rate without card context' });
        continue;
      }
    }
    kept.push({
      phrase,
      shows: kw.shows ?? null,
      source: kw.source || 'wordstat_live',
      group,
    });
  }

  const groups = { travel: [], services: [], premium: [] };
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
      'Сырой Wordstat live дал много мусора (МФО «Кредит 365», навигаторы, размеры одежды, войска).',
      'Сиды оффера под виртуальную карту PPM; бренд-займы и cash-обмен валюты вычищены.',
      'Travel/Services дополнены эвристикой по углам аналитика — live почти не дал релевантных фраз.',
    ],
    groups: {
      travel: { title: 'Путешествия / оплата за границей', keywords: groups.travel },
      services: { title: 'Зарубежные сервисы и подписки', keywords: groups.services },
      premium: { title: 'Премиум / выгодный курс', keywords: groups.premium },
    },
    negatives,
    rejected,
    autotargeting: 'suspended_on_start',
    bid_hint_rub: 10.2,
    stats: {
      raw_phrases: keywords.length,
      kept_travel: groups.travel.length,
      kept_services: groups.services.length,
      kept_premium: groups.premium.length,
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
    premium: 'Premium',
  };
  for (const g of ['travel', 'services', 'premium']) {
    const header = [
      `# РСЯ | PPM | ${titles[g]} — финальные ключи (вставка в группу)`,
      '# Оффер: Плати по миру / гео RU / автотаргетинг выкл. на старте',
      '',
    ].join('\n');
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
  // If input is already curated final shape with groups, re-emit from keywords if present
  const input = raw.keywords || raw.semantics
    ? raw
    : {
        keywords: Object.values(raw.groups || {}).flatMap((g) =>
          (g.keywords || []).map((k) => ({ ...k, group: undefined })),
        ),
      };
  // Prefer flattening curated groups back for rewrite stability
  if (raw.groups && !raw.keywords) {
    const flat = [];
    for (const [group, block] of Object.entries(raw.groups)) {
      for (const k of block.keywords || []) flat.push({ ...k, group });
    }
    input.keywords = flat;
  }
  const result = cleanupSemantics(input);
  if (write) {
    writeTxtLists(result);
    console.error(`Wrote creatives/rsya/keywords-*.txt + keywords-final.json (${result.stats.kept_travel}+${result.stats.kept_services}+${result.stats.kept_premium} kept, ${result.stats.rejected} rejected)`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}
