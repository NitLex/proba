#!/usr/bin/env node
/**
 * Create ArbTrack entities for LeadGid offer «Плати по миру» (#7397).
 * Idempotent: skips if campaign with same notes marker exists.
 */
import { loadEnv, mask } from './lib/env.js';
import { findOfferByLegacyId } from './lib/leadgid.js';
import { db } from './db.js';
import { makeCampaignKey } from './lib/tracking.js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const MARKER = 'leadgid:7397';

function upsertSource() {
  const existing = db
    .prepare(`SELECT * FROM traffic_sources WHERE name = ? COLLATE NOCASE`)
    .get('Yandex Direct РСЯ');
  if (existing) return existing;

  const info = db
    .prepare(
      `INSERT INTO traffic_sources (name, cost_param, currency, token1, token2, token3, notes)
       VALUES (@name, 'cost', 'RUB', @token1, @token2, @token3, @notes)`
    )
    .run({
      name: 'Yandex Direct РСЯ',
      token1: 'utm_campaign',
      token2: 'utm_content',
      token3: 'utm_term',
      notes: 'Яндекс.Директ / РСЯ. cost передавать в ?cost= или через автоправила',
    });
  return db.prepare(`SELECT * FROM traffic_sources WHERE id = ?`).get(Number(info.lastInsertRowid));
}

function upsertOffer(lgOffer) {
  const name = lgOffer?.name || 'Плати по миру - Выпуск карты';
  const goals = (lgOffer?.goals || []).filter((g) => g.active);
  const first = goals.find((g) => /первой/i.test(g.name));
  const premium = goals.find((g) => /премиальн/i.test(g.name));
  const payout = Number(first?.payout?.amount || premium?.payout?.amount || 896);

  // Placeholder tracking URL — replace with real LeadGid affiliate link after connect
  const url =
    process.env.LEADGID_OFFER_URL ||
    `https://go.leadgid.ru/aff_c?aff_id=123072&offer_id=7397&p=adnetwork&aff_sub={clickid}&aff_sub2={campaign_id}&aff_sub3={token1}`;

  const existing = db.prepare(`SELECT * FROM offers WHERE notes LIKE ?`).get(`%${MARKER}%`);
  const notes = [
    MARKER,
    `goals: first=${first?.payout?.amount || '?'}₽ premium=${premium?.payout?.amount || '?'}₽`,
    `metrics: EPC=${lgOffer?.metrics?.epc_u ?? '?'} CR=${lgOffer?.metrics?.cr_u ?? '?'}% AR=${lgOffer?.metrics?.ar ?? '?'}%`,
    'Замени URL на реальную партнёрскую ссылку LeadGid (sub1={clickid}).',
  ].join('\n');

  if (existing) {
    db.prepare(
      `UPDATE offers SET name=@name, url=@url, payout=@payout, currency='RUB', geo='RU', network='LeadGid', status='active', notes=@notes WHERE id=@id`
    ).run({ id: existing.id, name, url: existing.url.includes('PLACEHOLDER') ? url : existing.url, payout, notes });
    return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(existing.id);
  }

  const info = db
    .prepare(
      `INSERT INTO offers (name, url, payout, currency, geo, network, status, notes)
       VALUES (@name, @url, @payout, 'RUB', 'RU', 'LeadGid', 'active', @notes)`
    )
    .run({ name, url, payout, notes });
  return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(Number(info.lastInsertRowid));
}

function upsertLanding() {
  const existing = db.prepare(`SELECT * FROM landings WHERE notes LIKE ?`).get(`%${MARKER}%`);
  const notes = `${MARKER}\nDirect-to-offer ок; преленд опционален. CTA → /to-offer?clickid={clickid}`;
  const url = 'https://platipomiru.com/?utm_source={campaign_name}&clickid={clickid}';
  if (existing) return existing;
  const info = db
    .prepare(`INSERT INTO landings (name, url, notes) VALUES (@name, @url, @notes)`)
    .run({
      name: 'PPM direct / preland stub',
      url,
      notes,
    });
  return db.prepare(`SELECT * FROM landings WHERE id = ?`).get(Number(info.lastInsertRowid));
}

function upsertCampaign(source, offer, landing) {
  const existing = db.prepare(`SELECT * FROM campaigns WHERE notes LIKE ?`).get(`%${MARKER}%`);
  const maxCpc = Number(process.env.MAX_CPC_RUB || 7);
  const notes = [
    MARKER,
    'РСЯ · гео РФ · CPC тест',
    `max CPC hint: ${maxCpc} ₽`,
    `daily budget hint: ${process.env.DAILY_BUDGET_RUB || 5000} ₽`,
    'Углы креативов: travel / services / premium',
  ].join('\n');

  if (existing) {
    db.prepare(
      `UPDATE campaigns SET traffic_source_id=@sid, offer_id=@oid, landing_id=@lid, cost_value=@cpc, status='active', notes=@notes WHERE id=@id`
    ).run({
      id: existing.id,
      sid: source.id,
      oid: offer.id,
      lid: landing.id,
      cpc: maxCpc,
      notes,
    });
    return db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(existing.id);
  }

  const key = makeCampaignKey();
  const info = db
    .prepare(
      `INSERT INTO campaigns (name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, status, notes)
       VALUES (@name, @key, @sid, @oid, @lid, 'cpc', @cpc, 'active', @notes)`
    )
    .run({
      name: 'РСЯ → Плати по миру (LeadGid 7397)',
      key,
      sid: source.id,
      oid: offer.id,
      lid: landing.id,
      cpc: maxCpc,
      notes,
    });
  return db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(Number(info.lastInsertRowid));
}

function alsoCreateBundle() {
  const existing = db.prepare(`SELECT id FROM bundles WHERE notes LIKE ?`).get(`%${MARKER}%`);
  if (existing) return existing.id;
  const info = db
    .prepare(
      `INSERT INTO bundles (
        name, vertical, geo, source, funnel, payout_model, bid_hint, heat, difficulty, rating,
        where_to_pour, creatives, landing_notes, offer_notes, risks, checklist, status, notes
      ) VALUES (
        @name, 'Fintech / Debit cards', 'RU', 'Yandex Direct РСЯ', 'direct+preland', 'CPA',
        @bid, 'hot', 'medium', 5,
        @where_to_pour, @creatives, @landing_notes, @offer_notes, @risks, @checklist, 'active', @notes
      )`
    )
    .run({
      name: 'РСЯ → Плати по миру (LeadGid)',
      bid: `CPC ${process.env.MAX_CPC_RUB || 7} ₽ (ориентир по EPC~8.5)`,
      where_to_pour:
        'Яндекс.Директ РСЯ, гео Россия. Старт: Москва, СПб, МО + города 500k+. Возраст 25–45. Минус мусорные площадки через 2–3 дня. Бюджет теста 3–5к ₽/день.',
      creatives:
        'Готовые паки: creatives/rsya/ppm-rsya-travel-premium-v2.zip и ppm-rsya-services-premium-v3.zip. Углы: travel / подписки / premium. Промо LG2026 / LGPREMIUM2026.',
      landing_notes: 'Можно direct на партнёрскую ссылку LeadGid или лёгкий преленд → /to-offer.',
      offer_notes:
        'LeadGid #7397. Цели: первая карта ~896₽, премиум ~2388₽. В URL оффера sub1={clickid}. Постбек на ArbTrack.',
      risks: 'Модерация РСЯ (финтех), апрув LeadGid, выгорание креативов, мусорные площадки.',
      checklist:
        '1) Подключить оффер в LeadGid\n2) Реальная tracking-ссылка в ArbTrack\n3) Постбек sale/lead\n4) Залить баннеры всех размеров\n5) 48–72ч тест → kill/scale',
      notes: MARKER,
    });
  return Number(info.lastInsertRowid);
}

async function main() {
  const env = loadEnv();
  console.log('=== Setup PPM campaign ===');
  console.log('.env:', env.missing ? 'НЕ НАЙДЕН — используем дефолты' : env.path);
  if (!env.missing) {
    console.log('LEADGID_TOKEN:', mask(process.env.LEADGID_TOKEN));
    console.log('LEADGID_OFFER_ID:', process.env.LEADGID_OFFER_ID || '7397');
  }

  let lgOffer = null;
  if (process.env.LEADGID_TOKEN) {
    const r = await findOfferByLegacyId(process.env.LEADGID_OFFER_ID || '7397', process.env.LEADGID_TOKEN);
    if (r.offer) {
      lgOffer = r.offer;
      console.log('LeadGid offer:', lgOffer.name);
    } else {
      console.log('Каталог LeadGid: оффер не подтянулся, ставим вручную по известным payout');
      lgOffer = {
        name: 'Плати по миру - Выпуск карты',
        metrics: { epc_u: 8.53, cr_u: 3.84, ar: 44 },
        goals: [
          {
            active: true,
            name: 'Выпуск и оплата пользователем первой карты',
            payout: { amount: '896', currency: 'RUB' },
          },
          {
            active: true,
            name: 'Выпуск и оплата пользователем премиальной карты',
            payout: { amount: '2388', currency: 'RUB' },
          },
        ],
      };
    }
  } else {
    console.log('Без токена — сидим оффер по известным данным #7397');
    lgOffer = {
      name: 'Плати по миру - Выпуск карты',
      metrics: { epc_u: 8.53, cr_u: 3.84, ar: 44 },
      goals: [
        {
          active: true,
          name: 'Выпуск и оплата пользователем первой карты',
          payout: { amount: '896', currency: 'RUB' },
        },
        {
          active: true,
          name: 'Выпуск и оплата пользователем премиальной карты',
          payout: { amount: '2388', currency: 'RUB' },
        },
      ],
    };
  }

  const source = upsertSource();
  const offer = upsertOffer(lgOffer);
  const landing = upsertLanding();
  const campaign = upsertCampaign(source, offer, landing);
  const bundleId = alsoCreateBundle();

  const pub = (process.env.ARBTRACK_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');

  console.log('\n=== Готово в ArbTrack ===');
  console.log('source id:', source.id, source.name);
  console.log('offer id:', offer.id, '| payout:', offer.payout, offer.currency);
  console.log('landing id:', landing.id);
  console.log('campaign id:', campaign.id, '| key:', campaign.key);
  console.log('bundle id:', bundleId);
  console.log('\nКлик:');
  console.log(`  ${pub}/click/${campaign.key}?cost={cost}&utm_campaign={campaign_id}&utm_content={ad_id}`);
  console.log('\nПостбек для LeadGid (вставь в настройках оффера/потока):');
  console.log(
    `  ${pub}/postback?clickid={sub1}&payout={payout}&status={status}&txid={transaction_id}`
  );
  console.log('  (имена макросов уточни в LeadGid — sub1 должен = clickid из ссылки)');
  console.log('\nДальше:');
  console.log('1) В LeadGid подключи оффер 7397 и скопируй реальную ссылку');
  console.log('2) Вставь её в оффер ArbTrack (замени PLACEHOLDER), оставь {clickid} в sub1');
  console.log('3) Когда будет Yandex OAuth — допишем запуск РСЯ');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
