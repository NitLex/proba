import { db } from '../../db.js';

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
  if (b.heat === 'warm') score += 6;
  if (b.difficulty === 'easy') score += 5;
  return score;
}

function inferAngles(offer, similar) {
  const name = String(offer.name || offer.offer_name || '').toLowerCase();
  const notes = `${offer.notes || ''} ${offer.description || ''}`.toLowerCase();
  const angles = [];

  if (/путешеств|travel|за грани|туризм|booking|отел/.test(name + notes)) {
    angles.push({
      id: 'travel',
      title: 'Путешествия / оплата за границей',
      hooks: ['виртуальная карта для поездок', 'оплата за границей', 'СБП пополнение'],
    });
  }
  if (/сервис|подписк|spotify|steam|chatgpt|usd|доллар/.test(name + notes)) {
    angles.push({
      id: 'services',
      title: 'Зарубежные сервисы и подписки',
      hooks: ['оплата зарубежных сервисов', 'карта в валюте', 'подписки онлайн'],
    });
  }
  if (/премиум|premium|курс/.test(name + notes)) {
    angles.push({
      id: 'premium',
      title: 'Премиум / выгодный курс',
      hooks: ['премиальная карта', 'выгодный курс', 'больше лимитов'],
    });
  }

  // From similar bundles creatives / where_to_pour
  for (const b of similar.slice(0, 5)) {
    const text = `${b.creatives || ''} ${b.where_to_pour || ''} ${b.name || ''}`.toLowerCase();
    if (/travel|путешеств/.test(text) && !angles.find((a) => a.id === 'travel')) {
      angles.push({
        id: 'travel',
        title: 'Путешествия (из похожих связок)',
        hooks: ['карта для поездок'],
        from_bundle_id: b.id,
      });
    }
    if (/сервис|подписк|subscription/.test(text) && !angles.find((a) => a.id === 'services')) {
      angles.push({
        id: 'services',
        title: 'Сервисы (из похожих связок)',
        hooks: ['зарубежные сервисы'],
        from_bundle_id: b.id,
      });
    }
  }

  if (!angles.length) {
    angles.push({
      id: 'generic',
      title: 'Основной офферный угол',
      hooks: [offer.name || 'оффер', 'оформление онлайн', 'быстрый выпуск'],
    });
  }
  return angles;
}

function cpcHint(offer, similar) {
  const payout = Number(offer.payout || offer.payout_first || 0);
  const epc = Number(offer.epc || 0);
  if (epc > 0) return Math.max(1, Math.round(epc * 0.6 * 10) / 10);
  if (payout > 0) {
    // rough: assume 1–2% CR to first action → CPC ≈ payout * 0.01 * 0.7
    return Math.max(3, Math.min(25, Math.round(payout * 0.007 * 10) / 10));
  }
  const bid = similar.find((b) => b.bid_hint)?.bid_hint;
  if (bid) {
    const m = String(bid).match(/(\d+[.,]?\d*)/);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return 7;
}

export async function runAnalyst({ offer, context }) {
  const bundles = db.prepare(`SELECT * FROM bundles WHERE status = 'active' ORDER BY rating DESC`).all();
  const scored = bundles
    .map((b) => ({ ...b, _score: scoreBundle(b, offer) }))
    .sort((a, b) => b._score - a._score);
  const similar = scored.filter((b) => b._score >= 20).slice(0, 8);
  const angles = inferAngles(offer, similar);
  const cpc = cpcHint(offer, similar);
  const geo = offer.geo || similar[0]?.geo || 'RU';
  const source = offer.source || offer.traffic_source || 'Yandex Direct РСЯ';
  const dailyBudget = Number(offer.daily_budget || 5000);
  const promo = offer.promo_code || offer.promocode || null;

  const playbook = {
    vertical: offer.vertical || similar[0]?.vertical || 'Fintech',
    geo,
    source,
    funnel: offer.funnel || 'direct',
    angles,
    economics: {
      payout: Number(offer.payout || 0),
      payout_premium: Number(offer.payout_premium || 0) || null,
      epc_hint: Number(offer.epc || 0) || null,
      cpc_max: cpc,
      daily_budget: dailyBudget,
      weekly_budget: dailyBudget * 7,
    },
    similar_bundles: similar.map((b) => ({
      id: b.id,
      name: b.name,
      source: b.source,
      geo: b.geo,
      heat: b.heat,
      rating: b.rating,
      bid_hint: b.bid_hint,
      creatives: b.creatives,
      where_to_pour: b.where_to_pour,
      risks: b.risks,
      score: b._score,
    })),
    risks: [
      ...new Set(
        similar
          .flatMap((b) => String(b.risks || '').split(/[;\n]/).map((s) => s.trim()))
          .filter(Boolean)
          .concat([
            'Модерация Директа: не писать про обход ограничений/санкций',
            'Следить за минус-площадками РСЯ через 2–3 дня',
          ]),
      ),
    ],
    promo_codes: promo
      ? [{ code: promo, note: offer.promo_note || '' }]
      : [
          { code: 'LG2026', note: '−500 ₽ (если актуально для оффера)' },
          { code: 'LGPREMIUM2026', note: '−1000 ₽ премиум' },
        ],
  };

  return {
    summary: `Найдено похожих связок: ${similar.length}. Углы: ${angles.map((a) => a.id).join(', ')}. CPC≤${cpc} ₽, бюджет ${dailyBudget} ₽/день, гео ${geo}.`,
    playbook,
    cursor_prompt: [
      'Ты аналитик арбитражных связок.',
      `Оффер: ${JSON.stringify(offer)}`,
      `Уже найденные похожие связки: ${JSON.stringify(playbook.similar_bundles)}`,
      'Уточни углы креативов, CPC, гео-срез и риски. Верни JSON playbook.',
    ].join('\n'),
    context_patch: { playbook, analysis: { similar_count: similar.length, cpc_max: cpc } },
  };
}
