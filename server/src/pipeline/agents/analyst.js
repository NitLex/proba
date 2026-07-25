/**
 * Global market analyst — NOT limited to our sites/DB.
 * Priority: network offer metrics → Wordstat demand → global playbooks → (optional) web hints.
 * Local ArbTrack bundles are only a secondary "our history" signal.
 */

import { db } from '../../db.js';
import { expandSeeds, wordstatConfig } from '../../lib/wordstat.js';
import { findOfferByLegacyId } from '../../lib/leadgid.js';
import {
  detectVerticalKey,
  fetchPublicMarketHints,
  globalSourcesForOffer,
} from '../knowledge/global-market.js';

function scoreBundle(b, offer) {
  let score = Number(b.rating || 0) * 10;
  const geo = String(offer.geo || '').toUpperCase();
  const vertical = String(offer.vertical || '').toLowerCase();
  const source = String(offer.source || offer.traffic_source || 'РСЯ').toLowerCase();
  if (geo && String(b.geo || '').toUpperCase().includes(geo.slice(0, 2))) score += 25;
  if (vertical && String(b.vertical || '').toLowerCase().includes(vertical)) score += 30;
  if (source && String(b.source || '').toLowerCase().includes(source.replace('yandex', 'рся').slice(0, 3))) {
    score += 15;
  }
  if (b.heat === 'hot') score += 12;
  return score;
}

function mergeAngles(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const a of list || []) {
      if (!a?.id) continue;
      const prev = map.get(a.id);
      if (!prev) {
        map.set(a.id, { ...a, hooks: [...(a.hooks || [])] });
      } else {
        prev.hooks = [...new Set([...(prev.hooks || []), ...(a.hooks || [])])];
        if (!prev.creative_notes && a.creative_notes) prev.creative_notes = a.creative_notes;
        if (!prev.title && a.title) prev.title = a.title;
      }
    }
  }
  return [...map.values()];
}

function anglesFromOfferText(offer) {
  const name = String(offer.name || offer.offer_name || '').toLowerCase();
  const notes = `${offer.notes || ''} ${offer.description || ''}`.toLowerCase();
  const blob = `${name} ${notes}`;
  const angles = [];
  if (/путешеств|travel|поезд|туризм|отел/.test(blob)) {
    angles.push({
      id: 'travel',
      title: 'Поездки',
      hooks: ['цифровая карта для поездок', 'карта онлайн'],
      origin: 'offer_text',
    });
  }
  if (/сервис|подписк|spotify|steam|chatgpt|usd|доллар/.test(blob)) {
    angles.push({
      id: 'services',
      title: 'Подписки и сервисы',
      hooks: ['карта для подписок', 'оплата сервисов онлайн'],
      origin: 'offer_text',
    });
  }
  if (/сбп|промокод|выпуск|минут/.test(blob)) {
    angles.push({
      id: 'sbp',
      title: 'СБП / быстрый выпуск',
      hooks: ['пополнение по СБП', 'выпуск карты онлайн'],
      origin: 'offer_text',
    });
  }
  if (/премиум|premium|курс/.test(blob)) {
    angles.push({
      id: 'premium',
      title: 'Премиум',
      hooks: ['премиальная карта', 'больше возможностей'],
      origin: 'offer_text',
    });
  }
  return angles;
}

function anglesFromWordstat(keywords = []) {
  const angles = [];
  const blob = keywords.map((k) => k.phrase).join(' ').toLowerCase();
  if (/поезд|путешеств|travel|туризм/.test(blob)) {
    angles.push({
      id: 'travel',
      title: 'Поездки (спрос Wordstat)',
      hooks: keywords
        .filter((k) => /поезд|путешеств|travel/i.test(k.phrase))
        .slice(0, 5)
        .map((k) => k.phrase),
      origin: 'wordstat',
    });
  }
  if (/подписк|сервис|онлайн/.test(blob)) {
    angles.push({
      id: 'services',
      title: 'Сервисы (спрос Wordstat)',
      hooks: keywords
        .filter((k) => /подписк|сервис|онлайн/i.test(k.phrase))
        .slice(0, 5)
        .map((k) => k.phrase),
      origin: 'wordstat',
    });
  }
  if (/сбп|оформить|выпуск|цифров/.test(blob)) {
    angles.push({
      id: 'sbp',
      title: 'Выпуск/СБП (спрос Wordstat)',
      hooks: keywords
        .filter((k) => /сбп|оформить|выпуск|цифров/i.test(k.phrase))
        .slice(0, 5)
        .map((k) => k.phrase),
      origin: 'wordstat',
    });
  }
  return angles;
}

function cpcHint({ offer, networkEpc, globalBidHint }) {
  const payout = Number(offer.payout || offer.payout_first || 0);
  const epc = Number(offer.epc || networkEpc || 0);
  if (epc > 0) return Math.max(1, Math.round(epc * 0.6 * 10) / 10);
  if (payout > 0) return Math.max(3, Math.min(25, Math.round(payout * 0.007 * 10) / 10));
  if (globalBidHint) {
    const m = String(globalBidHint).match(/(\d+[.,]?\d*)/);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return 7;
}

async function loadNetworkOffer(offer) {
  const legacyId = offer.network_offer_id || offer.offer_id || offer.leadgid_offer_id;
  const token = process.env.LEADGID_TOKEN || '';
  if (!legacyId || !token) return null;
  try {
    const found = await findOfferByLegacyId(legacyId, token);
    if (found?.offer) {
      const o = found.offer;
      const goals = (o.goals || []).filter((g) => g.active);
      const first = goals.find((g) => /перв/i.test(g.name));
      const premium = goals.find((g) => /преми/i.test(g.name));
      return {
        network: 'LeadGid',
        legacy_id: o.legacy_id || legacyId,
        name: o.name,
        metrics: o.metrics || {},
        payout_first: first?.payout?.amount ?? null,
        payout_premium: premium?.payout?.amount ?? null,
        epc: o.metrics?.epc_u ?? o.metrics?.epc ?? null,
        cr: o.metrics?.cr_u ?? o.metrics?.cr ?? null,
        categories: o.categories || [],
        raw_goals: goals.slice(0, 6).map((g) => ({
          name: g.name,
          payout: g.payout?.amount,
          currency: g.payout?.currency,
        })),
      };
    }
  } catch (e) {
    return { error: e.message };
  }
  return null;
}

async function loadWordstatDemand(offer, globalAngles) {
  const seeds = [
    offer.name,
    ...(globalAngles || []).flatMap((a) => a.hooks || []).slice(0, 6),
    'виртуальная карта онлайн',
    'оформить карту онлайн',
  ].filter(Boolean);
  if (!wordstatConfig().configured) {
    return { mode: 'unconfigured', keywords: [], seeds };
  }
  const live = await expandSeeds(seeds);
  return {
    mode: live.mode,
    keywords: (live.keywords || []).slice(0, 40),
    errors: live.errors || [],
    seeds,
  };
}

function loadInternalHistory(offer) {
  try {
    const bundles = db.prepare(`SELECT * FROM bundles WHERE status = 'active' ORDER BY rating DESC`).all();
    const scored = bundles
      .map((b) => ({ ...b, _score: scoreBundle(b, offer) }))
      .sort((a, b) => b._score - a._score)
      .filter((b) => b._score >= 20)
      .slice(0, 5);
    return scored.map((b) => ({
      id: b.id,
      name: b.name,
      source: b.source,
      geo: b.geo,
      heat: b.heat,
      rating: b.rating,
      bid_hint: b.bid_hint,
      score: b._score,
      note: 'internal_history_only',
    }));
  } catch {
    return [];
  }
}

export async function runAnalyst({ offer }) {
  const geo = offer.geo || 'RU';
  const dailyBudget = Number(offer.daily_budget || 5000);
  const promo = offer.promo_code || offer.promocode || null;

  const global = globalSourcesForOffer(offer);
  const primarySource =
    global.sources.find((s) =>
      String(offer.source || 'Yandex Direct РСЯ')
        .toLowerCase()
        .includes(s.source.toLowerCase().slice(0, 5)),
    ) || global.sources[0];

  const [network, wordstat, web] = await Promise.all([
    loadNetworkOffer(offer),
    loadWordstatDemand(offer, primarySource?.angles || []),
    fetchPublicMarketHints(offer),
  ]);

  const internalHistory = loadInternalHistory(offer);

  const angles = mergeAngles(
    primarySource?.angles || [],
    anglesFromOfferText(offer),
    anglesFromWordstat(wordstat.keywords || []),
  );
  if (!angles.length) {
    angles.push({
      id: 'generic',
      title: 'Основной угол',
      hooks: [offer.name || 'оффер', 'оформление онлайн'],
      origin: 'fallback',
    });
  }

  const networkEpc = Number(network?.epc || 0);
  if (network?.payout_first && !offer.payout) offer = { ...offer, payout: network.payout_first };
  if (networkEpc && !offer.epc) offer = { ...offer, epc: networkEpc };

  const cpc = cpcHint({
    offer,
    networkEpc,
    globalBidHint: primarySource?.bid_hint,
  });

  const marketCompetitors = global.sources.map((s) => ({
    source: s.source,
    heat: s.heat,
    funnel: s.funnel,
    where_to_pour: s.where_to_pour,
    creatives: s.creatives,
    bid_hint: s.bid_hint,
    risks: s.risks,
    angles: (s.angles || []).map((a) => a.id),
  }));

  const risks = [
    ...new Set([
      ...(primarySource?.risks || []),
      'Модерация Директа: без чужих брендов и «обхода ограничений»',
      'Посадочная/клик должен открываться для YandexBot (не 403)',
      'Сверять EPC сети vs CPC каждые 2–3 дня',
      ...(web.hints?.length
        ? ['Учесть внешние упоминания/конкурентов из web-сигналов']
        : []),
    ]),
  ];

  const playbook = {
    analysis_scope: 'global_market',
    vertical: global.vertical,
    vertical_key: detectVerticalKey(offer),
    geo,
    source: offer.source || offer.traffic_source || primarySource?.source || 'Yandex Direct РСЯ',
    funnel: offer.funnel || primarySource?.funnel || 'direct',
    angles,
    economics: {
      payout: Number(offer.payout || network?.payout_first || 0),
      payout_premium: Number(offer.payout_premium || network?.payout_premium || 0) || null,
      epc_hint: Number(offer.epc || networkEpc || 0) || null,
      cpc_max: cpc,
      daily_budget: dailyBudget,
      weekly_budget: dailyBudget * 7,
      network_metrics: network?.metrics || null,
    },
    market: {
      competitor_sources: marketCompetitors,
      primary_source_playbook: primarySource
        ? {
            source: primarySource.source,
            where_to_pour: primarySource.where_to_pour,
            creatives: primarySource.creatives,
            bid_hint: primarySource.bid_hint,
          }
        : null,
      wordstat: {
        mode: wordstat.mode,
        top_phrases: (wordstat.keywords || []).slice(0, 15).map((k) => ({
          phrase: k.phrase,
          shows: k.shows,
        })),
      },
      web_hints: (web.hints || []).slice(0, 8),
      network_offer: network && !network.error ? network : null,
    },
    // secondary only
    internal_history: internalHistory,
    risks,
    promo_codes: promo
      ? [{ code: promo, note: offer.promo_note || '' }]
      : [
          { code: 'LG2026', note: '−500 ₽ (если актуально)' },
          { code: 'LGPREMIUM2026', note: '−1000 ₽ премиум' },
        ],
  };

  const summary = [
    `Глобальный анализ (${playbook.vertical_key}): источники рынка ${marketCompetitors.length}`,
    `углы ${angles.map((a) => a.id).join(', ') || '—'}`,
    `Wordstat ${wordstat.mode}${wordstat.keywords?.length ? ` (${wordstat.keywords.length} фраз)` : ''}`,
    network?.epc != null ? `EPC сети ${network.epc}` : null,
    `CPC≤${cpc} ₽`,
    `гео ${geo}`,
    internalHistory.length ? `внутр.история ${internalHistory.length}` : 'без опоры на наши связки',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    summary,
    playbook,
    cursor_prompt: [
      'Ты глобальный аналитик арбитража (не ограничен нашими сайтами).',
      `Оффер: ${JSON.stringify(offer)}`,
      `Рыночные источники/связки: ${JSON.stringify(marketCompetitors)}`,
      `Wordstat top: ${JSON.stringify(playbook.market.wordstat.top_phrases)}`,
      `Сеть: ${JSON.stringify(network)}`,
      `Web hints: ${JSON.stringify(web.hints || [])}`,
      'Уточни углы, источники, CPC, креативные запреты и план теста. Верни JSON playbook.',
      'Не опирайся только на внутреннюю базу ArbTrack.',
    ].join('\n'),
    context_patch: {
      playbook,
      analysis: {
        scope: 'global_market',
        vertical_key: playbook.vertical_key,
        cpc_max: cpc,
        wordstat_mode: wordstat.mode,
        market_sources: marketCompetitors.length,
        internal_history_count: internalHistory.length,
      },
    },
  };
}
