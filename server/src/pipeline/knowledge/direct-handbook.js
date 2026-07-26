/**
 * Knowledge pack for the Direct agent — grounded in official Yandex Direct Help.
 * Source root: https://yandex.ru/support/direct/ru/
 *
 * Sections: strategies, bid modifiers, excluded placements, creative rules,
 * finance/payment moderation docs.
 *
 * This is NOT model fine-tuning.
 */

export const DIRECT_DOC_SOURCES = [
  {
    id: 'campaign-settings',
    title: 'Параметры кампаний',
    url: 'https://yandex.ru/support/direct/ru/campaigns/campaign-settings',
  },
  {
    id: 'bid-adjustments',
    title: 'Корректировки ставок',
    url: 'https://yandex.ru/support/direct/ru/impressions/bids-adjustment',
  },
  {
    id: 'moderation-rules',
    title: 'Правила и требования (модерация)',
    url: 'https://yandex.ru/support/direct/ru/moderation/adv-rules',
  },
  {
    id: 'ad-rules',
    title: 'Требования к сайту и оформлению объявления',
    url: 'https://yandex.ru/support/direct/ru/moderation/ad-rules',
  },
  {
    id: 'special-categories',
    title: 'Ограниченные / запрещённые тематики',
    url: 'https://yandex.ru/support/direct/ru/moderation/special-categories',
  },
  {
    id: 'finance-payment',
    title: 'Платежные системы и переводы денежных средств',
    url: 'https://yandex.ru/support/direct/ru/moderation/categories/finance-payment',
  },
  {
    id: 'finance-services',
    title: 'Финансовые услуги',
    url: 'https://yandex.ru/support/direct/ru/moderation/categories/finance-services',
  },
  {
    id: 'create-ads',
    title: 'Создание объявлений и модерация',
    url: 'https://yandex.ru/support/direct/ru/unified-performance-campaign/create-ads',
  },
  {
    id: 'images',
    title: 'Изображения в объявлениях',
    url: 'https://yandex.ru/support/direct/ru/efficiency/images',
  },
  {
    id: 'legal-direct-rules',
    title: 'Требования к рекламно-информационным материалам в Директе',
    url: 'https://yandex.ru/legal/direct_adv_rules/',
  },
];

/** Hard rules the orchestrator always follows when creating drafts. */
export const DIRECT_HARD_RULES = [
  'Кампанию создаём как черновик OFF; ads.moderate НЕ вызываем — модерацию и запуск делает пользователь.',
  'StartDate только в таймзоне Europe/Moscow (не UTC).',
  'Для арбитража РСЯ: поиск SERVING_OFF, сеть WB_MAXIMUM_CLICKS с потолком ставки и недельным лимитом.',
  'Neuro Ads / авторекомендации / альтернативные тексты — выключены.',
  'Посадочная (click URL трекера) должна открываться для YandexBot / YaDirectFetcher (не 403).',
  'Графическое = ImageAd (текст на баннере). Товарное/ТГО = TextAd (текст в полях, картинка без текста).',
  'Не обещать 100% одобрение, обход ограничений/санкций, чужие бренды (банки, платёжки, Booking и т.п.).',
  'Оффер зарубежной/prepaid-карты: в Title или Text явно писать «зарубежная карта» / «выпуск зарубежной карты» — иначе Директ требует лицензию на банковские операции.',
  'Финансовые/платёжные услуги: без «зарубежной карты» готовь лицензию; с явной формулировкой документы часто не нужны (ответ модерации Директа).',
  'Минус-площадки: до 1000 шт.; чистить по отчёту «Площадки» на 2–3 день, не банить всё подряд на старте.',
  'Корректировка −100% по срезу = фактически отключение показов на этот срез.',
];

/** Bid modifiers — from official Help. Coefficients applied sequentially, not summed. */
export const DIRECT_BID_MODIFIERS = {
  source: 'https://yandex.ru/support/direct/ru/impressions/bids-adjustment',
  range: {
    min_percent: -100,
    max_percent: 1200,
    note: '−100% исключает показы на срез; несколько корректировок применяются последовательно (перемножаются), не суммируются.',
  },
  levels: ['campaign', 'ad_group'],
  priority_note:
    'Если корректировка одного типа задана и на кампании, и на группе — действует групповая. 0% на группе отключает кампанийную корректировку для этой группы.',
  recommended_rsya_test: {
    age: [
      { slice: '0-17', coefficient_percent: -100, reason: 'дети — отключить' },
      { slice: '18-24', coefficient_percent: 0, reason: 'без изменения / слабо' },
      { slice: '25-34', coefficient_percent: 15, reason: 'ядро для fintech/travel' },
      { slice: '35-44', coefficient_percent: 15, reason: 'ядро' },
      { slice: '45-54', coefficient_percent: 0, reason: 'нейтрально' },
      { slice: '55+', coefficient_percent: -50, reason: 'снизить' },
    ],
    gender: 'не трогаем на тесте, пока нет статистики',
    mobile: {
      coefficient_percent: 0,
      reason: 'На тесте без мобильной наценки; смотреть CR по устройствам через 3–7 дней',
    },
    // API-friendly map used by Direct agent today (age multipliers as % of base bid)
    api_defaults: {
      age_0_17: 0, // -100%
      age_25_34: 115, // +15%
      age_35_44: 115,
      age_55: 50, // -50%
    },
  },
  operator_tips: [
    'Не ставь кучу повышающих корректировок сразу — при WB_MAXIMUM_CLICKS потолок CPC всё равно ограничен BidCeiling.',
    'После набора статистики поднимай/режь возраст и mobile по EPC/CR, а не «на глаз».',
    'Корректировки по региону имеет смысл только если льёшь не только РФ или режешь дорогие регионы.',
  ],
};

/** Excluded placements (запрет показов) — campaign settings + report workflow. */
export const DIRECT_EXCLUDED_PLACEMENTS = {
  source: 'https://yandex.ru/support/direct/ru/campaigns/campaign-settings',
  limit: 1000,
  cannot_block: 'поисковые проекты Яндекса запретить нельзя',
  when_to_clean: 'через 2–3 дня после старта по отчёту «Площадки» (Мастер отчётов → массовые действия → Запретить)',
  seed_blocklist_patterns: [
    // типовой мусор для fintech/карточных офферов — уточнять по отчёту
    'games',
    'kids',
    'children',
    'torrent',
    'anime',
    'manga',
    'wallpaper',
    'radio',
    'music-free',
    'file-hosting',
  ],
  seed_note:
    'На старте НЕ заливаем 1000 площадок в запрет — только паттерны-кандидаты. Реальные домены баним из отчёта.',
  workflow: [
    'Запусти кампанию и накопи клики 2–3 дня',
    'Мастер отчётов → группировка «Площадки» + кампания',
    'Включи «Режим массовых действий»',
    'Отметь площадки с кликами без целевых / с подозрительным CR',
    'Действие «Запретить»',
  ],
};

/** Creative / landing requirements from moderation/ad-rules. */
export const DIRECT_CREATIVE_RULES = {
  source: 'https://yandex.ru/support/direct/ru/moderation/ad-rules',
  text: [
    'Чётко указан объект продвижения (товар/услуга).',
    'Без КАПСА (кроме аббревиатур/брендов), без эмодзи-украшательств где возможно.',
    'Без превосходной степени («лучший», «№1») без независимого заключения на лендинге.',
    'Язык объявления = язык гео показа (для РФ — русский).',
    'Нельзя чужие бренды / введение в заблуждение / «обход ограничений».',
  ],
  landing: [
    'Страница должна открываться, без «сайт в разработке» / парковки домена.',
    'Соответствовать тексту объявления; акция/промокод — если обещаны в объявлении — видны на странице.',
    'Для части тематик (МФО, кредиты, промокоды и др.) на сайте обязательны контакты организации.',
    'Трекер-клик не должен отдавать 403 рекламным ботам (YandexBot / YaDirectFetcher).',
  ],
  images: [
    'Картинка соответствует тексту и посадочной, качественная, непрозрачный фон.',
    'Текст на изображении подчиняется тем же правилам, что текст объявления (контакты на баннере допустимы).',
    'Логотипы/текст на картинке желательно ≤ ~20% площади (кроме упаковки/скриншота/графического объявления).',
    'Запрещены элементы UI Яндекса, шок-контент, запрещённые тематики, вводящие в заблуждение кнопки (play/close).',
    'Не рекомендуются контрастные рамки.',
  ],
  format_mapping: {
    graphic: {
      ad_type: 'ImageAd',
      rule: 'Надписи оффера на креативе; Title/Text в API не дублируем.',
    },
    product: {
      ad_type: 'TextAd',
      rule: 'Чистая картинка без текста; заголовок/текст только в полях объявления.',
    },
  },
};

/** Finance / payment moderation docs — relevant for card / payment offers (e.g. PPM). */
export const DIRECT_FINANCE_DOCS = {
  hub: 'https://yandex.ru/support/direct/ru/moderation/special-categories',
  payment_systems: {
    url: 'https://yandex.ru/support/direct/ru/moderation/categories/finance-payment',
    title: 'Платежные системы и переводы денежных средств',
    applies_when: [
      'платёжные системы',
      'денежные переводы',
      'платёжные агенты / субагенты',
      'операторы / операционные центры платёжных систем',
      'виртуальные/цифровые карты с платёжным функционалом (часто уходит сюда или в смежные фин. категории)',
    ],
    russia_docs: [
      'Копия лицензии на осуществление банковских операций',
      'Для оператора платёжной системы — копия свидетельства ЦБ РФ о регистрации оператора ПС',
    ],
    warnings: [
      'В текстовые объявления Директ может автодобавить предупреждение с наименованием юрлица.',
      'В графические/видео предупреждение с ОПФ юрлица нужно добавлять самостоятельно (читаемо, одновременно с контентом).',
    ],
    when_to_send:
      'Документы можно отправить после отправки на модерацию (чат / форма). Если отклонили только из‑за документов — после загрузки перепроверят.',
    validity:
      'Принятый пакет действует для кампаний аккаунта с той же тематикой и доменом; при смене аккаунта/домена — заново.',
  },
  related: [
    {
      title: 'Финансовые услуги',
      url: 'https://yandex.ru/support/direct/ru/moderation/categories/finance-services',
    },
    {
      title: 'Банковские услуги, кредиты',
      url: 'https://yandex.ru/support/direct/ru/moderation/categories/finance-banks',
    },
    {
      title: 'Займы / МФО',
      url: 'https://yandex.ru/support/direct/ru/moderation/categories/finance-loan',
    },
  ],
  affiliate_note:
    'Для affiliate-оффера карты/платежей часто просят документы рекламодателя/оффера. Держи пакет под рукой до модерации; оркестратор сам документы в Директ не загружает.',
};

/** Practical РСЯ playbook distilled from Help + affiliate practice. */
export const DIRECT_RSYA_PLAYBOOK = {
  placement: 'network_only',
  recommended_strategy: {
    search: 'SERVING_OFF',
    network: 'WB_MAXIMUM_CLICKS',
    why: 'Для теста связки важны контролируемые клики и потолок CPC; конверсионные стратегии — после накопления статистики.',
  },
  settings_defaults: {
    ENABLE_SITE_MONITORING: 'YES',
    ENABLE_COMPANY_INFO: 'NO',
    ENABLE_AREA_OF_INTEREST_TARGETING: 'NO',
    ALTERNATIVE_TEXTS_ENABLED: 'NO',
    ADD_METRICA_TAG: 'NO',
  },
  tracking_params: 'utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}',
  moderation: {
    do_not_auto_submit: true,
    typical_sla: 'обычно несколько часов; в выходные дольше',
    landing_must_be_reachable: true,
    sources: [
      'https://yandex.ru/support/direct/ru/moderation/adv-rules',
      'https://yandex.ru/support/direct/ru/unified-performance-campaign/create-ads',
    ],
  },
  creatives: DIRECT_CREATIVE_RULES.format_mapping,
  negatives_seed: [
    'бесплатно',
    'скачать',
    'вакансия',
    'работа',
    'реферат',
    'казино',
    'ставки',
    'крипта',
    'обменник',
    'вирус',
    'для детей',
    'игра',
    'торрент',
    'взлом',
  ],
  bid_modifiers_defaults: DIRECT_BID_MODIFIERS.recommended_rsya_test.api_defaults,
  excluded_placements: DIRECT_EXCLUDED_PLACEMENTS,
  finance_docs: DIRECT_FINANCE_DOCS,
};

function looksFinancial(offer = {}, playbook = {}) {
  const blob = [
    offer.name,
    offer.vertical,
    offer.notes,
    offer.network,
    ...(playbook.angles || []).map((a) => `${a.id} ${a.title}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /фин|карт|плат[её]ж|bank|card|credit|займ|мфо|сбп|подписк|travel|дебет/i.test(blob);
}

/** Checklist returned in Direct agent output for the human operator. */
export function buildDirectOperatorChecklist({ plan, offer, playbook, tracker } = {}) {
  const fin = looksFinancial(offer, playbook);
  const postback = tracker?.postback_url || '';
  const items = [
    {
      id: 'leadgid_postback',
      text: postback
        ? `LeadGid: вставь постбэк вручную (API не ставит): ${postback}`
        : 'LeadGid: вставь постбэк вручную в кабинете оффера (шаблон в блоке оркестратора)',
      required: true,
      copy: postback || null,
    },
    {
      id: 'review_draft',
      text: 'Открой черновик в Директе и проверь группы/объявления/минус-слова',
      required: true,
    },
    {
      id: 'check_landing',
      text: `Проверь click URL (YandexBot/YaDirectFetcher → не 403): ${plan?.href || ''}`,
      required: true,
    },
    {
      id: 'check_copy',
      text: 'Проверь тексты/баннеры: без чужих брендов, КАПСА, «лучший/№1», запрещённых обещаний',
      required: true,
      docs: DIRECT_CREATIVE_RULES.source,
    },
    {
      id: 'bid_modifiers',
      text: 'Проверь корректировки возраста (дети −100%, 25–44 чуть выше, 55+ ниже); mobile пока 0%',
      required: false,
      docs: DIRECT_BID_MODIFIERS.source,
    },
    {
      id: 'placements_day2',
      text: 'Через 2–3 дня: отчёт «Площадки» → запретить мусор (лимит 1000)',
      required: false,
      docs: DIRECT_EXCLUDED_PLACEMENTS.source,
    },
    {
      id: 'foreign_card_wording',
      text: fin
        ? 'В тексте объявлений явно: «зарубежная карта» / «выпуск зарубежной карты» (иначе запросят банковскую лицензию)'
        : 'Для карточных офферов проверяй формулировку продукта в Title/Text',
      required: fin,
      docs: DIRECT_FINANCE_DOCS.payment_systems.url,
    },
    {
      id: 'docs_if_needed',
      text: fin
        ? 'Если без «зарубежной карты» — лицензия ЦБ; с явной формулировкой документы часто не нужны'
        : 'Если модерация запросит документы по тематике — загрузи по разделу special-categories',
      required: false,
      docs: DIRECT_FINANCE_DOCS.payment_systems.url,
    },
    {
      id: 'moderate_and_start',
      text: 'Сам отправь на модерацию и запусти показы после оплаты',
      required: true,
    },
    {
      id: 'offer',
      text: `Оффер: ${offer?.name || '—'} · формат ${plan?.ad_format_label || plan?.ad_format || '—'}`,
      required: false,
    },
  ];
  return items;
}

/**
 * Compact knowledge blob for context / Cursor prompts.
 */
export function getDirectKnowledgeBrief() {
  return {
    sources: DIRECT_DOC_SOURCES,
    hard_rules: DIRECT_HARD_RULES,
    bid_modifiers: DIRECT_BID_MODIFIERS,
    excluded_placements: DIRECT_EXCLUDED_PLACEMENTS,
    creative_rules: DIRECT_CREATIVE_RULES,
    finance_docs: DIRECT_FINANCE_DOCS,
    rsya: DIRECT_RSYA_PLAYBOOK,
    help_root: 'https://yandex.ru/support/direct/ru/',
    note:
      'Агент использует handbook из официальной справки Директа. Это knowledge-pack, не fine-tune модели.',
  };
}

/** System-style instructions injected into Cursor spawn for direct agent. */
export function directAgentSystemPrompt() {
  return [
    'Ты эксперт по Яндекс.Директ (РСЯ). Опирайся на официальную справку:',
    'https://yandex.ru/support/direct/ru/',
    '',
    'Жёсткие правила оркестратора:',
    ...DIRECT_HARD_RULES.map((r) => `- ${r}`),
    '',
    'Корректировки: диапазон −100%…+1200%; несколько корректировок перемножаются; −100% = отключение среза.',
    `Источник: ${DIRECT_BID_MODIFIERS.source}`,
    '',
    'Минус-площадки: до 1000; чистить по отчёту на 2–3 день, не банить всё на старте.',
    `Источник: ${DIRECT_EXCLUDED_PLACEMENTS.source}`,
    '',
    'Креативы/лендинг:',
    ...DIRECT_CREATIVE_RULES.text.slice(0, 3).map((r) => `- ${r}`),
    ...DIRECT_CREATIVE_RULES.images.slice(0, 3).map((r) => `- ${r}`),
    '',
    'Фин/платежи (если оффер карточный/платёжный):',
    `- ${DIRECT_FINANCE_DOCS.payment_systems.url}`,
    `- Документы РФ: ${DIRECT_FINANCE_DOCS.payment_systems.russia_docs.join('; ')}`,
    '',
    'Ключевые разделы справки:',
    ...DIRECT_DOC_SOURCES.map((s) => `- ${s.title}: ${s.url}`),
    '',
    'Не выдумывай недокументированные API. Черновик OFF, без ads.moderate.',
  ].join('\n');
}
