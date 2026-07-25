#!/usr/bin/env node
/**
 * Create PPM LeadGid campaign on remote ArbTrack (https://trekerarbitrag.ru).
 * Requires ARBTRACK_USERNAME + ARBTRACK_PASSWORD in SECRETS.env / .env
 */
import { loadEnv, mask } from './lib/env.js';
import { findOfferByLegacyId } from './lib/leadgid.js';
import path from 'path';
import { pathToFileURL } from 'url';

const MARKER = 'leadgid:7397';

function baseUrl() {
  return (process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru').replace(/\/$/, '');
}

async function api(token, method, pathname, body) {
  const res = await fetch(`${baseUrl()}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const err = new Error(json?.error || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function login() {
  const username = process.env.ARBTRACK_USERNAME || process.env.ARBTRACK_LOGIN || '';
  const password = process.env.ARBTRACK_PASSWORD || '';
  if (!username || !password) {
    throw new Error(
      'Нет ARBTRACK_USERNAME / ARBTRACK_PASSWORD в SECRETS.env — вставь логин и пароль от https://trekerarbitrag.ru'
    );
  }
  const data = await api(null, 'POST', '/api/auth/login', { username, password });
  if (!data?.token) throw new Error('Логин ок, но token не вернулся');
  return data;
}

function findByNotes(rows, marker) {
  return (rows || []).find((r) => String(r.notes || '').includes(marker));
}

async function upsertSource(token) {
  const list = await api(token, 'GET', '/api/sources');
  const existing = list.find((s) => /yandex|рся|direct/i.test(s.name));
  if (existing) return existing;
  return api(token, 'POST', '/api/sources', {
    name: 'Yandex Direct РСЯ',
    cost_param: 'cost',
    currency: 'RUB',
    token1: 'utm_campaign',
    token2: 'utm_content',
    token3: 'utm_term',
    notes: 'РСЯ · cost в ?cost=',
  });
}

async function upsertOffer(token, lgOffer) {
  const list = await api(token, 'GET', '/api/offers');
  const existing = findByNotes(list, MARKER);
  const goals = (lgOffer?.goals || []).filter((g) => g.active);
  const first = goals.find((g) => /первой/i.test(g.name));
  const premium = goals.find((g) => /премиальн/i.test(g.name));
  const payout = Number(first?.payout?.amount || 896);
  const url =
    process.env.LEADGID_OFFER_URL ||
    'https://go.leadgid.ru/aff_c?aff_id=123072&offer_id=7397&p=adnetwork&aff_sub={clickid}&aff_sub2={campaign_id}&aff_sub3={token1}';
  const notes = [
    MARKER,
    `goals: first=${first?.payout?.amount || 896}₽ premium=${premium?.payout?.amount || 2388}₽`,
    `metrics: EPC=${lgOffer?.metrics?.epc_u ?? '?'} CR=${lgOffer?.metrics?.cr_u ?? '?'} AR=${lgOffer?.metrics?.ar ?? '?'}`,
  ].join('\n');
  const body = {
    name: lgOffer?.name || 'Плати по миру - Выпуск карты',
    url,
    payout,
    currency: 'RUB',
    geo: 'RU',
    network: 'LeadGid',
    status: 'active',
    notes,
  };
  if (existing) return api(token, 'PUT', `/api/offers/${existing.id}`, body);
  return api(token, 'POST', '/api/offers', body);
}

async function upsertCampaign(token, source, offer) {
  const list = await api(token, 'GET', '/api/campaigns');
  const existing = findByNotes(list, MARKER);
  const maxCpc = Number(process.env.MAX_CPC_RUB || 7);
  const notes = [
    MARKER,
    'РСЯ · гео РФ · direct-to-offer',
    `max CPC hint: ${maxCpc} ₽`,
    `daily budget: ${process.env.DAILY_BUDGET_RUB || 5000} ₽`,
  ].join('\n');

  const pathPayload = {
    name: 'Main',
    weight: 100,
    landing_id: null,
    enabled: true,
    is_default: true,
    offers: [{ offer_id: Number(offer.id), weight: 100 }],
  };

  const body = {
    name: 'РСЯ → Плати по миру (LeadGid 7397)',
    traffic_source_id: Number(source.id),
    offer_id: Number(offer.id),
    landing_id: null,
    cost_model: 'cpc',
    cost_value: maxCpc,
    currency: 'RUB',
    status: 'active',
    unique_hours: 24,
    block_bots: true,
    notes,
    paths: [pathPayload],
    rules: [],
  };

  if (existing) {
    body.key = existing.key;
    return api(token, 'PUT', `/api/campaigns/${existing.id}`, body);
  }
  return api(token, 'POST', '/api/campaigns', body);
}

async function main() {
  const env = loadEnv();
  console.log('=== Remote PPM setup ===');
  console.log('secrets:', env.missing ? 'НЕ НАЙДЕНЫ' : env.path);
  console.log('tracker:', baseUrl());
  console.log('user:', process.env.ARBTRACK_USERNAME || process.env.ARBTRACK_LOGIN || '(пусто)');
  console.log('password:', mask(process.env.ARBTRACK_PASSWORD || ''));

  const health = await api(null, 'GET', '/api/health');
  console.log('health:', health);

  const { token, user } = await login();
  console.log('logged in as:', user?.username || user?.login || user?.id || 'ok');

  let lgOffer = null;
  if (process.env.LEADGID_TOKEN) {
    const r = await findOfferByLegacyId(process.env.LEADGID_OFFER_ID || '7397', process.env.LEADGID_TOKEN);
    lgOffer = r.offer || null;
  }
  if (!lgOffer) {
    lgOffer = {
      name: 'Плати по миру - Выпуск карты',
      metrics: { epc_u: 9.88, cr_u: 3.98, ar: 46.15 },
      goals: [
        { active: true, name: 'Выпуск и оплата пользователем первой карты', payout: { amount: '896' } },
        { active: true, name: 'Выпуск и оплата пользователем премиальной карты', payout: { amount: '2388' } },
      ],
    };
  }

  const source = await upsertSource(token);
  const offer = await upsertOffer(token, lgOffer);
  const campaign = await upsertCampaign(token, source, offer);

  const pub = baseUrl();
  console.log('\n=== Создано на', pub, '===');
  console.log('source:', source.id, source.name);
  console.log('offer:', offer.id, offer.url);
  console.log('campaign:', campaign.id, 'key=', campaign.key);
  console.log('\nКлик для РСЯ:');
  console.log(`  ${pub}/click/${campaign.key}?cost={cost}&utm_campaign={campaign_id}&utm_content={ad_id}`);
  console.log('\nПостбек в LeadGid:');
  console.log(`  ${pub}/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error('ERROR:', e.message);
    if (e.body) console.error(e.body);
    process.exit(1);
  });
}
