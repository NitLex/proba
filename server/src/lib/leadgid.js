#!/usr/bin/env node
/**
 * LeadGid API helper — catalog + (when token works) authenticated calls.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadEnv, mask } from './env.js';

const BASE = 'https://cpa.leadgid.ru';

export async function leadgidFetch(pathname, { token, query } = {}) {
  const url = new URL(pathname, BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ArbTrack/1.0',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json, url: url.toString() };
}

export async function findOfferByLegacyId(legacyId, token) {
  const id = Number(legacyId);
  let offset = 0;
  const limit = 50;
  while (offset < 2000) {
    const { status, json } = await leadgidFetch('/api/offers', {
      token,
      query: { limit, offset },
    });
    if (status !== 200 || !json?.data) {
      return { error: 'catalog_failed', status, json };
    }
    const hit = json.data.find((o) => Number(o.legacy_id) === id);
    if (hit) return { offer: hit };
    const total = Number(json.meta?.total || 0);
    offset += limit;
    if (offset >= total) break;
  }
  return { error: 'not_found' };
}

export async function checkToken(token) {
  // Public catalog works even without auth; authenticated probe:
  const probes = [
    'https://auth.leadgid.com/userinfo',
    `${BASE}/api/users/me`,
    `${BASE}/api/me`,
  ];
  const results = [];
  for (const u of probes) {
    try {
      const res = await fetch(u, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const body = (await res.text()).slice(0, 200);
      results.push({ url: u, status: res.status, body });
    } catch (e) {
      results.push({ url: u, status: null, body: String(e.message) });
    }
  }
  const authOk = results.some((r) => r.status === 200);
  return { authOk, results };
}

async function main() {
  const env = loadEnv();
  if (env.missing) {
    console.error('Нет файла .env в корне репозитория. Скопируй .env.example → .env');
    process.exit(1);
  }

  const token = process.env.LEADGID_TOKEN || '';
  const offerId = process.env.LEADGID_OFFER_ID || '7397';

  console.log('=== LeadGid check ===');
  console.log('env:', env.path);
  console.log('LEADGID_TOKEN:', mask(token));
  console.log('LEADGID_OFFER_ID:', offerId);

  if (!token) {
    console.error('LEADGID_TOKEN пустой — заполни .env');
    process.exit(2);
  }

  const auth = await checkToken(token);
  console.log('\nAuth probes:');
  for (const r of auth.results) {
    console.log(`  ${r.status} ${r.url}`);
  }
  console.log(auth.authOk ? '→ токен принят' : '→ токен пока НЕ принят приватным API (каталог всё равно читаем)');

  const { offer, error, status, json } = await findOfferByLegacyId(offerId, token);
  if (!offer) {
    console.error('Оффер не найден:', error, status, json);
    process.exit(3);
  }

  console.log('\n=== Offer', offer.legacy_id, '===');
  console.log('name:', offer.name);
  console.log('metrics:', offer.metrics);
  const goals = (offer.goals || []).filter((g) => g.active);
  for (const g of goals) {
    console.log(
      `goal: ${g.name} → ${g.payout?.amount} ${g.payout?.currency} (${g.payout?.model})`
    );
  }

  // unit economics hint
  const first = goals.find((g) => /первой карты/i.test(g.name));
  const premium = goals.find((g) => /премиальн/i.test(g.name));
  const epc = Number(offer.metrics?.epc_u || 0);
  const targetRoi = Number(process.env.TARGET_ROI_PCT || 30) / 100;
  if (epc > 0) {
    console.log('\n=== Рекомендации CPC (по EPC сети) ===');
    console.log(`EPC ≈ ${epc} ₽`);
    console.log(`max CPC @ ROI 0%  ≈ ${epc.toFixed(2)} ₽`);
    console.log(`max CPC @ ROI ${process.env.TARGET_ROI_PCT || 30}% ≈ ${(epc / (1 + targetRoi)).toFixed(2)} ₽`);
  }
  if (first) console.log('Выплата «первая карта»:', first.payout.amount, 'RUB');
  if (premium) console.log('Выплата «премиум»:', premium.payout.amount, 'RUB');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
