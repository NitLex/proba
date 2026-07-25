#!/usr/bin/env node
/**
 * Filter Wordstat live dump for PPM (Плати по миру) РСЯ.
 *
 * Usage:
 *   node scripts/filter-wordstat-ppm.mjs path/to/raw-keywords.json
 *   cat raw.json | node scripts/filter-wordstat-ppm.mjs
 *
 * Input: array of { phrase, shows?, seed?, group? } or { keywords: [...] }
 *        or full pipeline semantics object.
 * Output: cleaned JSON to stdout (also writes docs/ppm-semantics.filtered.json if --write).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const JUNK_RE =
  /осадк|осадок|погод|навигатор|маршрут|яндекс\s*карт|google\s*карт|\bмапс\b|бензин|азс|\bсво\b|украин|натальн|гороскоп|матриц|медкарт|медицин|сим[\s-]?карт|esim|синяя\s*карт|транспортн|тройка|студенческ|социальная\s*карт|межеван|кадастр|участка|пусть\s*говорят|смотреть\s*онлайн|текст\s*песн|из\s*бумаги|игры\s*в\s*поезд|блог\s*путешествен|платн(ая|ый)\s*(дорог|проезд)|госуслуги|карта\s*сайта|в\s*реальном\s*времени|на\s*сегодня|займ|микрозайм|скачать|торрент|казино|ставк|1xbet|крипт|bitcoin|\bp2p\b|обнал|халява|взлом|кряк|ваканси/;

const AMBIGUOUS_MAP_ONLY_RE =
  /^(карты онлайн|карта онлайн|карты онлайн бесплатно|карты онлайн время|онлайн карта без карты|схема онлайн)$/i;

const TRAVEL_RE =
  /границ|за\s+рубеж|поезд|путешеств|турист|турци|китай|беларус|белорус/;

const SERVICES_RE =
  /подпис|сервис|доллар|\busd\b|валют|онлайн\s*оплат|иностранн|зарубежн/;

const SBP_RE = /сбп|за\s*минут|промокод|выпуск\s*(карты|виртуал)|оформить\s*(карту|виртуал)|открыть\s*виртуал/;

const PAYMENT_CARD_RE =
  /виртуал|цифров|электронн|банковск|оплат|выпуск|оформить|пополнен|подпис|сервис|сбп|промокод|доллар|поезд|путешеств|границ/;

function normalizePhrase(p) {
  return String(p || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(phrase) {
  const p = normalizePhrase(phrase);
  if (!p) return { keep: false, reason: 'empty' };
  if (AMBIGUOUS_MAP_ONLY_RE.test(p)) return { keep: false, reason: 'ambiguous_map' };
  if (JUNK_RE.test(p)) return { keep: false, reason: 'junk' };
  if (!PAYMENT_CARD_RE.test(p) && !TRAVEL_RE.test(p) && !SERVICES_RE.test(p)) {
    return { keep: false, reason: 'weak_intent' };
  }

  let group = 'generic';
  // Services wins on подписк/сервис/доллар even if travel-ish tokens appear.
  if (SERVICES_RE.test(p)) group = 'services';
  else if (TRAVEL_RE.test(p)) group = 'travel';
  else if (SBP_RE.test(p)) group = 'sbp';

  return { keep: true, group, phrase: p };
}

function extractKeywords(input) {
  if (Array.isArray(input)) return input;
  if (input?.keywords) return input.keywords;
  if (input?.semantics?.keywords) return input.semantics.keywords;
  if (input?.groups) {
    const out = [];
    for (const [group, phrases] of Object.entries(input.groups)) {
      for (const phrase of phrases) out.push({ phrase, group });
    }
    return out;
  }
  throw new Error('Expected keywords array or semantics object');
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const path = args.find((a) => !a.startsWith('--'));

  let raw;
  if (path) {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } else if (!process.stdin.isTTY) {
    raw = JSON.parse(readFileSync(0, 'utf8'));
  } else {
    console.error('Usage: node scripts/filter-wordstat-ppm.mjs <raw.json> [--write]');
    process.exit(1);
  }

  const keywords = extractKeywords(raw);
  const kept = [];
  const rejected = [];
  const groups = { travel: [], services: [], sbp: [], generic: [] };

  const seen = new Set();
  for (const kw of keywords) {
    const phrase = kw.phrase || kw;
    const result = classify(phrase);
    if (!result.keep) {
      rejected.push({ phrase: normalizePhrase(phrase), reason: result.reason, shows: kw.shows ?? null });
      continue;
    }
    if (seen.has(result.phrase)) continue;
    seen.add(result.phrase);
    const item = {
      phrase: result.phrase,
      shows: kw.shows ?? null,
      seed: kw.seed ?? null,
      group: result.group,
      source: kw.source || 'filtered',
    };
    kept.push(item);
    groups[result.group].push(result.phrase);
  }

  const out = {
    summary: `kept ${kept.length} / rejected ${rejected.length} from ${keywords.length}`,
    groups: {
      travel: groups.travel,
      services: groups.services,
      sbp: groups.sbp,
    },
    keywords: kept,
    rejected: rejected.slice(0, 200),
  };

  const json = JSON.stringify(out, null, 2);
  process.stdout.write(json + '\n');

  if (write) {
    mkdirSync(join(root, 'docs'), { recursive: true });
    const dest = join(root, 'docs', 'ppm-semantics.filtered.json');
    writeFileSync(dest, json + '\n');
    console.error(`Wrote ${dest}`);
  }
}

main();
