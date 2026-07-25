/**
 * Knowledge pack for the Direct agent — grounded in official Yandex Direct Help.
 * Source root: https://yandex.ru/support/direct/ru/
 *
 * This is NOT model fine-tuning. The agent applies these rules when building
 * campaign plans / Cursor prompts / draft settings.
 */

export const DIRECT_DOC_SOURCES = [
  {
    id: 'campaign-settings',
    title: 'Параметры кампаний',
    url: 'https://yandex.ru/support/direct/ru/campaigns/campaign-settings',
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
    id: 'create-ads',
    title: 'Создание объявлений и модерация',
    url: 'https://yandex.ru/support/direct/ru/unified-performance-campaign/create-ads',
  },
  {
    id: 'rsya',
    title: 'Рекламная сеть Яндекса',
    url: 'https://yandex.ru/support/direct/ru/products-ds-gallery/about',
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
  'Посадочная (click URL трекера) должна открываться для YandexBot (не 403) — иначе модерация не пройдёт.',
  'Графическое объявление = ImageAd (текст на баннере). Товарное/ТГО = TextAd (текст в полях, картинка без текста).',
  'Не обещать 100% одобрение, обход ограничений/санкций, чужие бренды (банки, платёжки, Booking и т.п.).',
  'Финансовые услуги: нейтральные формулировки; при запросе модерации — документы организации.',
];

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
  creatives: {
    graphic: {
      ad_type: 'ImageAd',
      rule: 'Надписи оффера на креативе; поля Title/Text не дублируем.',
    },
    product: {
      ad_type: 'TextAd',
      rule: 'Чистая картинка без текста; заголовок/текст только в настройках объявления.',
    },
  },
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
  ],
  bid_modifiers_defaults: {
    age_25_34: 115,
    age_35_44: 115,
    age_0_17: 0,
    age_55: 50,
  },
};

/** Checklist returned in Direct agent output for the human operator. */
export function buildDirectOperatorChecklist({ plan, offer } = {}) {
  return [
    {
      id: 'review_draft',
      text: 'Открой черновик в Директе и проверь группы/объявления/минус-слова',
      required: true,
    },
    {
      id: 'check_landing',
      text: `Проверь, что click URL открывается (в т.ч. для YandexBot): ${plan?.href || ''}`,
      required: true,
    },
    {
      id: 'check_copy',
      text: 'Убедись, что нет чужих брендов и запрещённых обещаний',
      required: true,
    },
    {
      id: 'docs_if_needed',
      text: 'Для фин. тематики при запросе модерации подготовь документы организации',
      required: false,
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
}

/**
 * Compact knowledge blob for context / Cursor prompts.
 */
export function getDirectKnowledgeBrief() {
  return {
    sources: DIRECT_DOC_SOURCES,
    hard_rules: DIRECT_HARD_RULES,
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
    'Ключевые разделы справки:',
    ...DIRECT_DOC_SOURCES.map((s) => `- ${s.title}: ${s.url}`),
    '',
    'Не выдумывай недокументированные API. Черновик OFF, без ads.moderate.',
  ].join('\n');
}
