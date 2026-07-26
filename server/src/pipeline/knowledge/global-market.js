/**
 * Global market knowledge for arbitrage analysis (not tied to our sites).
 * Sources: typical RU RSYa/UAC playbooks by vertical + live Wordstat/network signals.
 */

export const GLOBAL_VERTICAL_PLAYBOOKS = {
  marketplace_rental: {
    vertical: 'Marketplace / аренда витрин',
    aliases: [
      /маркетплейс|marketplace|wildberries|ozon|аренд[аы].*(витрин|полк|магазин)|витрин[аы].*аренд|магазин\s+под\s+ключ|продавц.*маркет/i,
    ],
    sources: [
      {
        source: 'Yandex Direct РСЯ',
        heat: 'warm',
        funnel: 'direct',
        where_to_pour: 'РСЯ, гео РФ, 25–45, интерес к бизнесу/e-com. Чистить мусорные площадки на 2–3 день.',
        creatives: 'Витрина, аренда полки, запуск магазина, рост продаж. Без займов и «зарубежной карты».',
        bid_hint: 'CPC от теста; смотреть EPC оффера',
        risks: ['Оффер может требовать документы; не обещать «гарантию продаж»'],
        angles: [
          {
            id: 'rent',
            title: 'Аренда витрины',
            hooks: ['аренда витрины на маркетплейсе', 'полка под товар', 'магазин без склада'],
            creative_notes: 'Акцент на аренду места/витрины, не на кредиты.',
          },
          {
            id: 'shop',
            title: 'Свой магазин',
            hooks: ['магазин на маркетплейсе', 'запуск витрины', 'продажа на маркетплейсе'],
            creative_notes: 'Запуск магазина / витрины.',
          },
          {
            id: 'sales',
            title: 'Рост продаж',
            hooks: ['больше продаж на маркетплейсе', 'готовая витрина', 'трафик на магазин'],
            creative_notes: 'Без гарантий оборота.',
          },
        ],
      },
    ],
  },
  fintech_loans: {
    vertical: 'Fintech / МФО',
    aliases: [/займ|микрозайм|мфо|наличн|payday|loan|кредитн(ая|ой) истори|деньги сразу/i],
    sources: [
      {
        source: 'Yandex Direct РСЯ',
        heat: 'hot',
        funnel: 'direct',
        where_to_pour: 'РСЯ, гео РФ, 25–55. Жёсткая чистка площадок. Документы по займам — по правилам Директа.',
        creatives: 'Скорость, сумма, только паспорт, онлайн 24/7. Без гарантии 100% одобрения.',
        bid_hint: 'CPC от EPC×0.4–0.6; тест осторожный',
        risks: [
          'Тематика «Займы» — документы/ограничения в Директе',
          'Запрет гарантий одобрения и вводящих в заблуждение ставок',
        ],
        angles: [
          {
            id: 'speed',
            title: 'Быстрое решение',
            hooks: ['займ онлайн за минуты', 'деньги на карту срочно', 'одобрение онлайн'],
            creative_notes: 'Акцент на скорость, без «100% одобрим».',
          },
          {
            id: 'passport',
            title: 'Только паспорт',
            hooks: ['займ по паспорту', 'минимум документов', 'оформление онлайн'],
            creative_notes: 'Факт из оффера: нужен паспорт.',
          },
          {
            id: 'amount',
            title: 'Сумма на карту',
            hooks: ['займ до 30000', 'деньги на карту', 'наличные или карта'],
            creative_notes: 'Указывать сумму только если есть в описании оффера.',
          },
        ],
      },
    ],
  },
  fintech_cards: {
    vertical: 'Fintech',
    aliases: [/зарубежн.*карт|prepaid|плати по миру|виртуальн.*карт|дебетов|выпуск карты|сбп.*карт|подписк.*карт/i],
    sources: [
      {
        source: 'Yandex Direct РСЯ',
        heat: 'hot',
        funnel: 'direct',
        where_to_pour: 'РСЯ, гео РФ, города 500k+, возраст 25–45. Минус мусорные площадки на 2–3 день.',
        creatives: 'Нейтральные тексты без чужих брендов и «обхода ограничений». Углы: поездки / подписки / СБП.',
        bid_hint: 'CPC 5–8 ₽ при EPC ~9–12',
        risks: [
          'Модерация Директа по фин. тематике и чужим брендам',
          'Посадочная должна открываться для YandexBot (не 403)',
          'Минус kids/games площадки',
        ],
        angles: [
          {
            id: 'travel',
            title: 'Поездки / travel-оплаты',
            hooks: ['цифровая карта для поездок', 'карта онлайн', 'оформление за минуты'],
            creative_notes: 'Без Booking/Uber в тексте. Акцент на удобство и СБП.',
          },
          {
            id: 'services',
            title: 'Подписки и онлайн-сервисы',
            hooks: ['карта для подписок', 'оплата сервисов онлайн', 'выпуск карты онлайн'],
            creative_notes: 'Без Spotify/ChatGPT/Steam как «официальных». Общая формулировка «сервисы».',
          },
          {
            id: 'sbp',
            title: 'Быстрый выпуск + СБП',
            hooks: ['пополнение по СБП', 'карта за минуты', 'промокод на выпуск'],
            creative_notes: 'Сильный офферный крючок — промокод и скорость.',
          },
        ],
      },
      {
        source: 'VK Ads / myTarget',
        heat: 'warm',
        funnel: 'direct',
        where_to_pour: 'Look-alike + интересы финансы/travel. Крео статичные + короткое видео.',
        creatives: 'Офферный оффер: промокод, СБП, онлайн-выпуск.',
        bid_hint: 'Тест от 1–2к ₽/день',
        risks: ['Жёстче креативная модерация, чем в РСЯ'],
        angles: [
          {
            id: 'promo',
            title: 'Промокод / выгода',
            hooks: ['промокод на карту', 'скидка на выпуск'],
          },
        ],
      },
      {
        source: 'Telegram Ads',
        heat: 'warm',
        funnel: 'direct',
        where_to_pour: 'Каналы finance/travel/digital. Короткий оффер + промокод.',
        creatives: '1–2 коротких текста, без агрессивных обещаний.',
        bid_hint: 'CPM-тест',
        risks: ['Малый объём, дорогой клик'],
        angles: [
          {
            id: 'services',
            title: 'Цифровые сервисы',
            hooks: ['карта для сервисов', 'онлайн выпуск'],
          },
        ],
      },
    ],
  },
  nutra: {
    vertical: 'Nutra',
    aliases: [/похуд|нутри|витамин|бад|здоров|сустав|диабет|потенц/i],
    sources: [
      {
        source: 'Yandex Direct РСЯ',
        heat: 'hot',
        funnel: 'preland',
        where_to_pour: 'Квиз/статьи преленды → оффер. Гео по офферу.',
        creatives: 'Проблема→решение, до/после осторожно (модерация).',
        bid_hint: 'Зависит от payout, часто CPC 8–20 ₽',
        risks: ['Мед. модерация, запрет гарантий'],
        angles: [
          { id: 'problem', title: 'Боль/проблема', hooks: ['усталость', 'лишний вес'] },
          { id: 'solution', title: 'Решение/курс', hooks: ['натуральный комплекс', 'курс на 30 дней'] },
        ],
      },
    ],
  },
  gambling: {
    vertical: 'Gambling',
    aliases: [/казино|ставк|betting|1x|бонус.*казино/i],
    sources: [
      {
        source: 'Native / push / pop',
        heat: 'hot',
        funnel: 'direct',
        where_to_pour: 'Не РСЯ Яндекса (запрещено). Альтернативные сети.',
        creatives: 'Бонус, фриспины — по правилам ГЕО.',
        bid_hint: 'Высокий CPC/CPI',
        risks: ['Запрет в Яндекс.Директ РФ'],
        angles: [{ id: 'bonus', title: 'Бонус', hooks: ['приветственный бонус'] }],
      },
    ],
  },
  dating: {
    vertical: 'Dating',
    aliases: [/знаком|dating|约会|девушк/i],
    sources: [
      {
        source: 'Facebook / TikTok / native',
        heat: 'warm',
        funnel: 'direct',
        where_to_pour: 'Интересы dating, lookalike.',
        creatives: 'UGC-креативы, без NSFW.',
        bid_hint: 'Тест CPI/CPC',
        risks: ['Аккаунт-баны на FB'],
        angles: [{ id: 'local', title: 'Знакомства рядом', hooks: ['знакомства в городе'] }],
      },
    ],
  },
};

export function detectVerticalKey(offer = {}) {
  // Product text first — ignore vague UI default "Fintech" which used to force cards
  const productBlob = [
    offer.name,
    offer.offer_name,
    offer.notes,
    offer.description,
    offer.network_description,
    offer.category,
    offer.product_brief?.summary,
    offer.product_brief?.advantages,
    ...(Array.isArray(offer.product_brief?.goals)
      ? offer.product_brief.goals.map((g) => g.name)
      : []),
  ]
    .filter(Boolean)
    .join(' ');

  // Marketplace / rental before loans (names like Money.* must not force МФО)
  if (
    /маркетплейс|marketplace|wildberries|ozon|аренд[аы].*(витрин|полк|магазин)|витрин[аы].*аренд|магазин\s+под\s+ключ|аренд[аы]\s+(на\s+)?маркет|полк[аи]\s+под\s+товар|продавц.*(wb|ozon|маркет)/i.test(
      productBlob,
    )
  ) {
    return 'marketplace_rental';
  }
  if (
    /займ|микрозайм|мфо|payday|loan|наличн(ыми|ые)|кредитн(ая|ой) истори|деньги сразу|выдача.*займ/i.test(
      productBlob,
    )
  ) {
    return 'fintech_loans';
  }
  if (
    /зарубежн.*карт|prepaid|плати по миру|виртуальн(ая|ой) карт|дебетов|выпуск карты|карта.*сбп|сбп.*карт/i.test(
      productBlob,
    )
  ) {
    return 'fintech_cards';
  }

  for (const [key, pb] of Object.entries(GLOBAL_VERTICAL_PLAYBOOKS)) {
    if (pb.aliases.some((re) => re.test(productBlob))) return key;
  }

  const verticalField = String(offer.vertical || '');
  if (/маркет|аренд|marketplace/i.test(verticalField)) return 'marketplace_rental';
  if (/займ|мфо|loan|credit/i.test(verticalField)) return 'fintech_loans';
  if (/карт|card|debit|плат[её]ж/i.test(verticalField)) return 'fintech_cards';
  if (/нутри|бад|похуд/i.test(verticalField)) return 'nutra';
  // Last resort: cards playbook (PPM-era default)
  return 'fintech_cards';
}

export function globalSourcesForOffer(offer = {}) {
  const key = detectVerticalKey(offer);
  const pb = GLOBAL_VERTICAL_PLAYBOOKS[key];
  const preferred = String(offer.source || offer.traffic_source || '').toLowerCase();
  const sources = [...(pb?.sources || [])];
  sources.sort((a, b) => {
    const as = preferred && a.source.toLowerCase().includes(preferred.slice(0, 4)) ? 1 : 0;
    const bs = preferred && b.source.toLowerCase().includes(preferred.slice(0, 4)) ? 1 : 0;
    return bs - as;
  });
  return { verticalKey: key, vertical: pb?.vertical || offer.vertical || 'General', sources };
}

/**
 * Lightweight public web signals (no API key). Best-effort; failures are ignored.
 */
export async function fetchPublicMarketHints(offer = {}) {
  const q = encodeURIComponent(
    `${offer.name || offer.offer_name || ''} ${offer.vertical || ''} арбитраж РСЯ оффер`.trim(),
  );
  const hints = [];
  // DuckDuckGo lite — often works without key
  try {
    const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${q}`, {
      headers: {
        'User-Agent': 'ArbTrackResearch/1.0',
        Accept: 'text/html',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const titles = [...html.matchAll(/<a rel="nofollow" href="[^"]+" class="result-link">([^<]+)<\/a>/gi)]
        .map((m) => m[1].trim())
        .filter(Boolean)
        .slice(0, 8);
      // fallback parse
      const alt = [...html.matchAll(/<a[^>]+href="https?:\/\/[^"]+"[^>]*>([^<]{10,120})<\/a>/gi)]
        .map((m) => m[1].replace(/\s+/g, ' ').trim())
        .filter((t) => !/duckduckgo|javascript|login/i.test(t))
        .slice(0, 8);
      for (const t of titles.length ? titles : alt) {
        hints.push({ source: 'web', title: t });
      }
    }
  } catch {
    /* ignore */
  }
  return { query: decodeURIComponent(q), hints };
}
