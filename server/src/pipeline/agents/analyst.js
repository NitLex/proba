/**
 * Global market analyst — NOT limited to our sites/DB.
 * Priority: network offer metrics → Wordstat demand → global playbooks → (optional) web hints.
 * Local ArbTrack bundles are only a secondary "our history" signal.
 */

import { db } from '../../db.js';
import { expandSeeds, wordstatConfig } from '../../lib/wordstat.js';
import { findOfferByLegacyId } from '../../lib/leadgid.js';
import {
  buildOfferFacts,
  seedsFromOfferFacts,
} from '../../lib/offerFacts.js';
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
  const notes = `${offer.notes || ''} ${offer.description || ''} ${offer.network_description || ''}`.toLowerCase();
  const products = (offer.products || offer.product_brief?.products || [])
    .map((p) => (p.name || p || '').toLowerCase())
    .join(' ');
  const blob = `${name} ${notes} ${products}`;
  const angles = [];
  const brand = String(offer.facts?.brand || offer.name || '')
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');

  // Credit services / CPL leads (Finandos-class) — before card templates
  if (/кредитн.*сервис|credit\s*service|\bcpl\b/.test(blob) && !/зарубежн.*карт|выпуск карты|сбп/.test(blob)) {
    angles.push({
      id: 'speed',
      title: 'Быстрая заявка',
      hooks: [
        brand ? `${brand} онлайн` : 'кредит онлайн',
        'заявка на кредит онлайн',
        'оформить заявку за минуты',
      ].filter(Boolean),
      origin: 'offer_text',
    });
    angles.push({
      id: 'amount',
      title: 'Подбор кредита',
      hooks: ['подобрать кредит', 'кредитный сервис онлайн', brand ? `${brand} кредит` : 'кредит без лишних шагов'].filter(Boolean),
      origin: 'offer_text',
    });
    if (/\bcpl\b|заявк|lead/.test(blob)) {
      angles.push({
        id: 'passport',
        title: 'Лид / заявка',
        hooks: ['оставить заявку на кредит', 'заявка без обязательств'],
        origin: 'offer_text',
      });
    }
    return angles;
  }

  // Loans / MFO — product-first
  if (/займ|микрозайм|мфо|наличн|payday|loan|кредитн(ая|ой) истори|кредитн.*сервис/.test(blob)) {
    angles.push({
      id: 'speed',
      title: 'Быстрое решение',
      hooks: ['займ онлайн за минуты', 'деньги на карту срочно', 'одобрение онлайн'],
      origin: 'offer_text',
    });
    if (/паспорт/.test(blob)) {
      angles.push({
        id: 'passport',
        title: 'Только паспорт',
        hooks: ['займ по паспорту', 'минимум документов'],
        origin: 'offer_text',
      });
    }
    const amount = blob.match(/(\d[\d\s]{2,6})\s*(₽|руб|рубл)/i) || blob.match(/до\s+(\d[\d\s]{2,6})/i);
    if (amount || /сумм|на карту|наличн/.test(blob)) {
      angles.push({
        id: 'amount',
        title: 'Сумма на карту',
        hooks: [
          amount ? `займ до ${String(amount[1]).replace(/\s/g, '')}` : 'деньги на карту',
          'займ на карту онлайн',
        ],
        origin: 'offer_text',
      });
    }
    return angles;
  }

  if (/путешеств|travel|поезд|туризм|отел|зарубежн.*карт/.test(blob)) {
    angles.push({
      id: 'travel',
      title: 'Поездки',
      hooks: ['зарубежная карта для поездок', 'выпуск зарубежной карты'],
      origin: 'offer_text',
    });
  }
  if (/сервис|подписк|spotify|steam|chatgpt|usd|доллар/.test(blob)) {
    angles.push({
      id: 'services',
      title: 'Подписки и сервисы',
      hooks: ['зарубежная карта для подписок', 'оплата сервисов онлайн'],
      origin: 'offer_text',
    });
  }
  if (/сбп|промокод|выпуск|минут/.test(blob) && /карт/.test(blob)) {
    angles.push({
      id: 'sbp',
      title: 'СБП / быстрый выпуск',
      hooks: ['пополнение по СБП', 'выпуск зарубежной карты онлайн'],
      origin: 'offer_text',
    });
  }
  if (/премиум|premium|курс/.test(blob) && /карт/.test(blob)) {
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

async function loadWordstatDemand(offer, globalAngles, facts) {
  const verticalKey = detectVerticalKey(offer);
  const factSeeds = seedsFromOfferFacts(offer, facts || offer.facts || {});
  const angleHooks = (globalAngles || []).flatMap((a) => a.hooks || []).slice(0, 6);
  // Never inject card/SBP seeds unless vertical is actually cards
  const seeds = [
    ...factSeeds,
    ...angleHooks,
    ...(verticalKey === 'fintech_cards'
      ? ['виртуальная карта онлайн', 'оформить карту онлайн']
      : []),
  ].filter(Boolean);
  const regions = facts?.region_ids?.length ? facts.region_ids.map(String) : undefined;
  if (!wordstatConfig().configured) {
    return { mode: 'unconfigured', keywords: [], seeds, regions };
  }
  // Non-RU geos: still query with geo regions if mapped; else mark geo caution
  const live = await expandSeeds(seeds, regions ? { regions } : {});
  return {
    mode: live.mode,
    keywords: (live.keywords || []).slice(0, 40),
    errors: live.errors || [],
    seeds,
    regions: live.config?.regions || regions || null,
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
  const facts = offer.facts || buildOfferFacts(offer);
  const geo = facts.geo || offer.geo || null;
  const dailyBudget = Number(offer.daily_budget || 5000);
  const promo = offer.promo_code || offer.promocode || null;
  const verticalKey = detectVerticalKey(offer);

  const global = globalSourcesForOffer(offer);
  const primarySource =
    global.sources.find((s) =>
      String(offer.source || 'Yandex Direct РСЯ')
        .toLowerCase()
        .includes(s.source.toLowerCase().slice(0, 5)),
    ) || global.sources[0];

  // Offer-text angles first. Unknown: no invented playbook angles.
  // Cards playbook angles (travel/services/sbp) only for fintech_cards.
  const offerAngles = anglesFromOfferText({ ...offer, facts });
  const rawPlaybookAngles = primarySource?.angles || [];
  const playbookAngles =
    verticalKey === 'unknown'
      ? []
      : verticalKey === 'fintech_cards'
        ? rawPlaybookAngles
        : rawPlaybookAngles.filter((a) => !['travel', 'services', 'sbp', 'premium'].includes(a.id));

  const [network, wordstat, web] = await Promise.all([
    loadNetworkOffer(offer),
    loadWordstatDemand(offer, offerAngles.length ? offerAngles : playbookAngles, facts),
    fetchPublicMarketHints({
      ...offer,
      vertical: global.vertical,
      name: facts.brand || offer.name,
    }),
  ]);

  const internalHistory = loadInternalHistory(offer);

  const angles = mergeAngles(
    offerAngles,
    playbookAngles,
    // Wordstat angles only if they don't drag card clusters into non-card verticals
    verticalKey === 'fintech_cards' ? anglesFromWordstat(wordstat.keywords || []) : [],
  );
  if (!angles.length) {
    const brand = facts.brand || offer.name || 'оффер';
    angles.push({
      id: 'generic',
      title: 'Основной угол',
      hooks: [brand, `${brand} онлайн`, 'оформление заявки онлайн'],
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
      ...(facts.ru_traffic_fit === 'mismatch_rsya_ru'
        ? [
            `Гео оффера ${facts.geo} ≠ РФ: Яндекс.Директ РСЯ (регион 225) НЕ целевой канал по умолчанию`,
            'Для ES/RO/PL/CZ проверяй Google/FB/native или локальный трафик, не шаблон РФ',
          ]
        : []),
      ...(geo
        ? []
        : ['Гео не извлечено из оффера — не подставляй РФ автоматически']),
      ...(facts.non_resident_audience
        ? [
            'Аудитория «нерезиденты» — это угол оффера; гео трафика для РСЯ обычно РФ (225), не UZ/KZ',
          ]
        : []),
      'Модерация: только утверждения из фактов оффера, без чужих шаблонов',
      'Посадочная/клик должен открываться для ботов рекламной сети',
      'Сверять EPC сети vs CPC каждые 2–3 дня',
      ...(web.hints?.length
        ? ['Учесть внешние упоминания/конкурентов из web-сигналов']
        : []),
    ]),
  ];

  const playbook = {
    analysis_scope: 'offer_first',
    vertical: global.vertical,
    vertical_key: verticalKey,
    geo,
    geos: facts.geos || [],
    region_ids: facts.region_ids || [],
    brand: facts.brand || null,
    payout_model: facts.payout_model || null,
    products: facts.products || [],
    source:
      facts.ru_traffic_fit === 'mismatch_rsya_ru'
        ? 'Review traffic source (geo ≠ RU)'
        : offer.source || offer.traffic_source || primarySource?.source || 'Yandex Direct РСЯ',
    funnel: offer.funnel || primarySource?.funnel || 'direct',
    angles,
    economics: {
      payout: Number(offer.payout || network?.payout_first || 0),
      payout_premium: Number(offer.payout_premium || network?.payout_premium || 0) || null,
      currency: offer.currency || null,
      payout_model: facts.payout_model || null,
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
        regions: wordstat.regions || facts.region_ids || null,
        seeds: wordstat.seeds || [],
        top_phrases: (wordstat.keywords || []).slice(0, 15).map((k) => ({
          phrase: k.phrase,
          shows: k.shows,
        })),
      },
      web_hints: (web.hints || []).slice(0, 8),
      network_offer: network && !network.error ? network : null,
    },
    offer_facts: facts,
    // secondary only
    internal_history: internalHistory,
    risks,
    // Promo only if operator/offer provided — never invent LG2026 for EU CPL
    promo_codes: promo ? [{ code: promo, note: offer.promo_note || '' }] : [],
  };

  const summary = [
    `Offer-first (${playbook.vertical_key})`,
    facts.brand ? `бренд ${facts.brand}` : null,
    `гео ${geo || 'неизвестно'}`,
    facts.payout_model ? `модель ${facts.payout_model}` : null,
    facts.products?.length ? `продукт: ${facts.products.join(', ')}` : null,
    `углы ${angles.map((a) => a.id).join(', ') || '—'}`,
    `Wordstat ${wordstat.mode}${wordstat.keywords?.length ? ` (${wordstat.keywords.length})` : ''}`,
    network?.epc != null ? `EPC ${network.epc}` : null,
    offer.currency && offer.currency !== 'RUB' ? `pay ${offer.payout} ${offer.currency}` : `CPC≤${cpc}`,
    facts.ru_traffic_fit === 'mismatch_rsya_ru' ? '⚠ гео≠РФ' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    summary,
    playbook,
    cursor_prompt: [
      'Ты аналитик оффера. Сначала факты оффера, потом playbook. Запрещено подставлять «зарубежная карта/СБП/РФ», если этого нет в фактах.',
      `Facts: ${JSON.stringify(facts)}`,
      `Оффер: ${JSON.stringify(offer)}`,
      `Рыночные источники: ${JSON.stringify(marketCompetitors)}`,
      `Wordstat: ${JSON.stringify(playbook.market.wordstat)}`,
      `Сеть: ${JSON.stringify(network)}`,
      'Верни уточнённый playbook JSON строго от фактов.',
    ].join('\n'),
    context_patch: {
      playbook,
      offer_facts: facts,
      analysis: {
        scope: 'offer_first',
        vertical_key: playbook.vertical_key,
        geo: playbook.geo,
        geos: playbook.geos,
        region_ids: playbook.region_ids,
        brand: playbook.brand,
        payout_model: playbook.payout_model,
        products: playbook.products,
        evidence: facts.evidence || [],
        cpc_max: cpc,
        wordstat_mode: wordstat.mode,
        ru_traffic_fit: facts.ru_traffic_fit,
        market_sources: marketCompetitors.length,
        internal_history_count: internalHistory.length,
      },
    },
  };
}
