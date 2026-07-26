import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateAngleImages,
  imageGenConfig,
  buildCreativePromptForProvider,
} from '../../lib/imageGen.js';
import {
  normalizeAdFormat,
  resolveAdFormat,
  overlayLinesForOffer,
  formatLabel,
} from '../../lib/adFormat.js';
import {
  validateCreatives,
  creativeModerationChecklist,
} from '../../lib/creativeQa.js';
import {
  creativeAgentSystemPrompt,
  creativeBriefForVertical,
} from '../knowledge/creative-handbook.js';
import {
  materializeReferencesForRun,
  normalizeOfferReferences,
  referencesAsGeneratedImages,
  createIngestToken,
  mergeGeneratedImages,
} from '../../lib/creativeAssets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const creativesRoot = path.resolve(__dirname, '../../../../creatives/rsya');
const creativesPipelineRoot = path.resolve(__dirname, '../../../../creatives/pipeline');

const RSYA_SIZES = [
  '300x250',
  '300x300',
  '336x280',
  '728x90',
  '300x600',
  '320x100',
  '1080x450',
  '1080x1080',
];

function listExistingAssets() {
  const found = [];
  const roots = [
    { abs: creativesRoot, rel: 'creatives/rsya' },
    { abs: creativesPipelineRoot, rel: 'creatives/pipeline' },
  ];
  for (const { abs, rel } of roots) {
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (/\.(zip|mp4|jpg|png|webp)$/i.test(name)) {
        found.push(path.join(rel, name));
      }
    }
    const textAd = path.join(abs, 'direct-textad');
    if (fs.existsSync(textAd)) {
      for (const name of fs.readdirSync(textAd)) {
        if (/\.(jpg|png|webp)$/i.test(name)) found.push(path.join(rel, 'direct-textad', name));
      }
    }
  }
  return found;
}

function sliceTitle(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 56);
}
function sliceText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 81);
}

function offerFacts(offer) {
  const brief = offer.product_brief || {};
  const blob = [
    offer.name,
    offer.notes,
    offer.description,
    offer.network_description,
    brief.summary,
    brief.advantages,
  ]
    .filter(Boolean)
    .join(' ');
  const amountMatch =
    blob.match(/от\s*(\d[\d\s]{0,6})\s*до\s*(\d[\d\s]{0,6})/i) ||
    blob.match(/до\s*(\d[\d\s]{0,6})\s*(₽|руб)?/i);
  let amountLine = '';
  if (amountMatch) {
    if (amountMatch[2] && /\d/.test(amountMatch[2])) {
      amountLine = `от ${amountMatch[1].replace(/\s/g, '')} до ${amountMatch[2].replace(/\s/g, '')} ₽`;
    } else {
      amountLine = `до ${amountMatch[1].replace(/\s/g, '')} ₽`;
    }
  }
  return {
    brand: String(offer.name || brief.name || 'Оффер')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40),
    passport: /паспорт/i.test(blob),
    amountLine,
    online24: /круглосуточ|24\s*\/\s*7|онлайн/i.test(blob),
    badKi: /плохо[йе]\s*кредит|любой\s*ки|кредитн(ая|ой)\s*истори/i.test(blob),
    cardPayout: /на карту|наличными/i.test(blob),
    summary: String(brief.summary || offer.description || offer.notes || '').slice(0, 200),
  };
}

/** Loan / MFO copy from researched offer facts — never foreign-card templates. */
function loanAdCopy(angle, offer) {
  const f = offerFacts(offer);
  const amount = f.amountLine || 'на карту';
  const map = {
    speed: {
      titles: [
        sliceTitle('Займ онлайн за минуты'),
        sliceTitle(`${f.brand}: быстро`),
        sliceTitle('Деньги на карту срочно'),
      ],
      texts: [
        sliceText(
          f.passport
            ? `Онлайн-займ ${amount}. Нужен паспорт. Решение быстро.`
            : `Онлайн-займ ${amount}. Оформление за минуты.`,
        ),
        sliceText(`Срочный займ на карту. ${f.online24 ? 'Круглосуточно. ' : ''}${amount}.`),
      ],
    },
    passport: {
      titles: [sliceTitle('Займ по паспорту онлайн'), sliceTitle('Минимум документов')],
      texts: [
        sliceText(`Для займа нужен паспорт. ${amount}. Оформление онлайн.`),
        sliceText(`${f.brand}: займ онлайн, минимум документов. ${amount}.`),
      ],
    },
    amount: {
      titles: [
        sliceTitle(f.amountLine ? `Займ ${f.amountLine}` : 'Займ на карту онлайн'),
        sliceTitle('Деньги на карту онлайн'),
      ],
      texts: [
        sliceText(`Получите ${amount} на карту или наличными в регионе.`),
        sliceText(`${f.brand}: ${amount}. Оформление онлайн.`),
      ],
    },
    generic: {
      titles: [sliceTitle(`Займ онлайн — ${f.brand}`), sliceTitle('Онлайн-займ на карту')],
      texts: [
        sliceText(f.summary || `Онлайн-займ ${amount}. Оформление за минуты.`),
        sliceText(`${f.brand}. ${amount}. Без лишних обещаний одобрения.`),
      ],
    },
  };
  return map[angle.id] || map.generic;
}

/** Marketplace / rental shopfront — never loans or overseas cards. */
function marketplaceAdCopy(angle, offer, promo) {
  const f = offerFacts(offer);
  const code = promo?.code || offer.promo_code || '';
  const promoBit = code ? `Промокод ${code}` : 'Старт онлайн';
  const map = {
    rent: {
      titles: [
        sliceTitle('Аренда витрины на маркетплейсе'),
        sliceTitle('Полка под товар без склада'),
        sliceTitle(`${f.brand}: аренда витрины`),
      ],
      texts: [
        sliceText(`Аренда витрины на маркетплейсе. ${promoBit}. Без склада.`),
        sliceText(`Место под товар на маркетплейсе. ${promoBit}.`),
      ],
    },
    shop: {
      titles: [
        sliceTitle('Свой магазин на маркетплейсе'),
        sliceTitle('Запуск витрины онлайн'),
        sliceTitle(`${f.brand}: магазин`),
      ],
      texts: [
        sliceText(`Магазин на маркетплейсе под ключ. ${promoBit}.`),
        sliceText(`Запуск витрины и продаж на маркетплейсе. ${promoBit}.`),
      ],
    },
    sales: {
      titles: [
        sliceTitle('Рост продаж на маркетплейсе'),
        sliceTitle('Готовая витрина под товар'),
      ],
      texts: [
        sliceText(`Готовая витрина для продаж на маркетплейсе. ${promoBit}.`),
        sliceText(`${f.brand}: больше продаж через витрину. Условия на сайте.`),
      ],
    },
    generic: {
      titles: [
        sliceTitle('Маркетплейс: аренда витрины'),
        sliceTitle('Витрина на маркетплейсе'),
      ],
      texts: [
        sliceText(f.summary || `Аренда витрины / магазин на маркетплейсе. ${promoBit}.`),
        sliceText(`${f.brand}. Маркетплейс без обещаний «гарантии оборота».`),
      ],
    },
  };
  return map[angle.id] || map.generic;
}

/**
 * Copy from offer research + vertical.
 * Cards (PPM): must say «зарубежная карта».
 * Loans: only loan claims from offer brief — never card templates.
 * Marketplace: витрина / аренда — never loans or cards.
 */
function adCopy(angle, offer, promo, verticalKey) {
  const code = promo?.code || offer.promo_code || '';
  if (verticalKey === 'fintech_loans') return loanAdCopy(angle, offer);
  if (verticalKey === 'marketplace_rental') return marketplaceAdCopy(angle, offer, promo);

  // Foreign / prepaid cards
  const promoBit = code ? `Промокод ${code}` : 'Оформление онлайн';
  const map = {
    travel: {
      titles: [
        'Зарубежная карта в поездки',
        'Зарубежная карта в дорогу',
        'Зарубежная карта онлайн',
      ],
      texts: [
        `Выпуск зарубежной карты онлайн. СБП. ${promoBit}.`,
        `Выпуск зарубежной карты за минуты. ${promoBit}. Поездки и оплаты.`,
      ],
    },
    services: {
      titles: [
        'Зарубежная карта без отказа',
        'Зарубежная карта для подписок',
        'Зарубежная карта — сервисы',
      ],
      texts: [
        `Выпуск зарубежной карты онлайн. СБП. ${promoBit}.`,
        `Выпуск зарубежной карты. Подписки и оплаты. ${promoBit}.`,
      ],
    },
    premium: {
      titles: ['Зарубежная карта премиум', 'Выпуск зарубежной карты'],
      texts: [`Выпуск зарубежной карты. ${promoBit}. Онлайн.`],
    },
    sbp: {
      titles: ['Зарубежная карта + СБП', 'Зарубежная карта с СБП'],
      texts: [
        `Выпуск зарубежной карты. Пополнение с любого банка по СБП.`,
        `Выпуск зарубежной карты. Рубли по СБП. ${promoBit}.`,
      ],
    },
    generic: {
      titles: ['Выпуск зарубежной карты', 'Зарубежная карта онлайн'],
      texts: [
        `Выпуск зарубежной карты онлайн. ${promoBit}. Пополнение по СБП.`,
        `Зарубежная карта: быстрый старт. ${promoBit}.`,
      ],
    },
  };
  return map[angle.id] || map.generic;
}

function sitelinksForVertical(verticalKey, promo) {
  if (verticalKey === 'fintech_loans') {
    return [
      { title: 'Оформить онлайн', description: 'Заявка за минуты' },
      { title: 'На карту', description: 'Или наличными в регионе' },
      { title: 'Условия', description: 'Изучите на сайте' },
      { title: 'Поддержка', description: 'Помощь по заявке' },
    ];
  }
  if (verticalKey === 'marketplace_rental') {
    return [
      { title: 'Аренда витрины', description: 'Место под товар' },
      { title: 'Свой магазин', description: 'Запуск на маркетплейсе' },
      {
        title: promo?.code ? `Промокод ${promo.code}` : 'Условия',
        description: promo?.note || 'На сайте оффера',
      },
      { title: 'Старт онлайн', description: 'Без склада' },
    ];
  }
  return [
    { title: 'Зарубежная карта', description: 'Выпуск онлайн за минуты' },
    {
      title: promo?.code ? `Промокод ${promo.code}` : 'Оформить',
      description: promo?.note || 'Скидка на выпуск',
    },
    { title: 'Пополнение по СБП', description: 'Рублями с любого банка' },
    { title: 'Оплата в сервисах', description: 'Поездки и подписки' },
  ];
}

function calloutsForVertical(verticalKey, promo) {
  if (verticalKey === 'fintech_loans') {
    return ['Онлайн-займ', 'Оформление быстро', 'На карту', 'Условия на сайте'];
  }
  if (verticalKey === 'marketplace_rental') {
    return [
      'Маркетплейс',
      'Аренда витрины',
      'Старт онлайн',
      promo?.code ? `Промокод ${promo.code}` : 'Без склада',
    ];
  }
  return [
    'Выпуск зарубежной карты',
    'Пополнение по СБП',
    'Оформление онлайн',
    promo?.code ? `Промокод ${promo.code}` : 'Без очередей',
  ];
}

/**
 * Decide generation format from offer.ad_format.
 * auto → product by default (текст в полях); graphic only when explicitly requested
 * or when notes hint at "текст на баннере".
 * YandexART: always prefer product unless graphic requested (Cyrillic on image is weak).
 */
function decideGenerationFormat(offer, imgProvider) {
  const requested = normalizeAdFormat(offer.ad_format || offer.adFormat || 'auto');
  if (requested === 'graphic' || requested === 'product') return requested;
  const notes = `${offer.notes || ''} ${offer.creative_notes || ''}`.toLowerCase();
  if (/графич|текст на (баннер|картинк|креатив)|надпис/.test(notes)) return 'graphic';
  // auto default: товарное — чистая картинка, текст в настройках объявления
  // (особенно важно для YandexART — без «иероглифов» на баннере)
  if (imgProvider === 'yandex_art' || imgProvider === 'auto' || !imgProvider) return 'product';
  return 'product';
}

function verticalCursorHint(verticalKey) {
  if (verticalKey === 'fintech_loans') {
    return 'Вертикаль МФО/займы: тексты только из брифа оффера (сумма, паспорт, скорость). Не писать про зарубежную карту.';
  }
  if (verticalKey === 'marketplace_rental') {
    return 'Вертикаль маркетплейс/аренда: витрина, аренда, магазин. Без займов и «зарубежной карты».';
  }
  return 'В Title/Text обязательно «зарубежная карта» / «выпуск зарубежной карты» — иначе Директ требует банковскую лицензию.';
}

function agentCursorPrompt({
  systemRole,
  adFormat,
  formatLabelText,
  verticalKey,
  verticalHint,
  imgCfg,
  offer,
  promo,
  creatives,
  references,
  okImages,
  qa,
  runId,
  ingestToken,
  publicBase,
}) {
  const ingestUrl = `${String(publicBase || 'https://trekerarbitrag.ru').replace(/\/$/, '')}/api/pipeline/ingest-creatives`;
  return [
    systemRole,
    '',
    '## Твоя задача (обязательно)',
    'Сгенерируй РСЯ-креативы ЛУЧШЕ, чем YandexART/GPT-шаблоны.',
    'Используй инструмент GenerateImage (или аналог генерации картинок в Cursor).',
    'Если есть референсы — передай их как reference_image_paths / visual references.',
    'Сделай 1 квадратный креатив 1:1 на каждый угол (минимум 2).',
    adFormat === 'graphic'
      ? 'Формат graphic: текст оффера МОЖЕТ быть на баннере (чёткий кириллический).'
      : 'Формат product: БЕЗ текста на картинке — заголовки только в полях TextAd.',
    '',
    '## Куда сохранить',
    `1) Локально: creatives/pipeline/${runId}/<angle_id>-agent-0.png`,
    `2) Обязательно загрузи на трекер (creatives/pipeline gitignored):`,
    `POST ${ingestUrl}`,
    'Body JSON:',
    '```json',
    JSON.stringify(
      {
        run_id: Number(runId) || runId,
        token: ingestToken || '<INGEST_TOKEN>',
        images: [
          {
            angle_id: creatives[0]?.angle_id || 'generic',
            mime: 'image/png',
            data_base64: '<base64 without data: prefix>',
            format: adFormat === 'graphic' ? 'graphic' : 'product',
          },
        ],
      },
      null,
      2,
    ),
    '```',
    '',
    `Формат объявлений: ${adFormat} (${formatLabelText}).`,
    `Движок: ${imgCfg.provider} — ${imgCfg.note}. НЕ используй YandexART и GPT Image API.`,
    verticalHint,
    references?.length
      ? `Референсы (${references.length}): ${JSON.stringify(references.map((r) => r.path))}`
      : 'Референсов нет — опирайся на бриф и вертикаль.',
    `QA: ${JSON.stringify(qa)}`,
    `Оффер: ${JSON.stringify({
      name: offer.name,
      vertical_key: verticalKey,
      brief: offer.product_brief || offer.notes,
      promo,
    })}`,
    `Брифы: ${JSON.stringify(
      creatives.map((c) => ({
        id: c.angle_id,
        title: c.angle_title,
        format: c.ad_format,
        titles: c.titles,
        texts: c.texts,
        overlay: c.overlay_lines,
        prompt: c.image_prompt,
      })),
    )}`,
    `Уже есть файлы: ${JSON.stringify(okImages)}`,
  ].join('\n');
}

export async function runCreative({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [{ id: 'generic', title: 'Основной' }];
  const promo = (playbook.promo_codes || [])[0] || { code: offer.promo_code || '' };
  const verticalKey = playbook.vertical_key || context.analysis?.vertical_key || '';
  const verticalBrief = creativeBriefForVertical(verticalKey);
  const assets = listExistingAssets();
  const imgCfg = imageGenConfig();
  const runId = context.run_id || `offer-${Date.now()}`;
  const requestedFormat = normalizeAdFormat(offer.ad_format || offer.adFormat || 'auto');
  const genFormat = decideGenerationFormat(offer, imgCfg.provider);
  const imageHasText = genFormat === 'graphic';
  const adFormat = resolveAdFormat({ requested: requestedFormat, imageHasText });
  const systemRole = creativeAgentSystemPrompt(verticalKey);
  const agentMode = imgCfg.provider === 'agent' || imgCfg.provider === 'reference';

  let references = normalizeOfferReferences(offer);
  const batchId = offer.reference_batch_id || context.reference_batch_id || '';
  if (batchId) {
    try {
      const materialized = materializeReferencesForRun(runId, batchId);
      references = [...references, ...materialized];
    } catch (err) {
      references = [
        ...references,
        { path: null, error: err.message || String(err), role: 'reference' },
      ];
    }
  }
  references = references.filter((r) => r?.path);

  const overlaysByAngle = {};
  const creatives = angles.map((angle) => {
    const copy = adCopy(angle, offer, promo, verticalKey);
    const overlayLines = overlayLinesForOffer({
      offer,
      angle,
      promo,
      titles: copy.titles,
      texts: copy.texts,
    });
    overlaysByAngle[angle.id] = overlayLines;
    const promptProvider = agentMode ? 'openai' : imgCfg.provider || 'agent';

    return {
      angle_id: angle.id,
      angle_title: angle.title,
      ad_format: adFormat,
      requested_ad_format: requestedFormat,
      image_has_text: imageHasText,
      direct_ad_type: 'TextAd',
      titles: copy.titles,
      texts: copy.texts,
      overlay_lines: imageHasText ? overlayLines : [],
      image_prompt: buildCreativePromptForProvider(promptProvider, {
        angle,
        offer,
        format: genFormat,
        overlayLines: imageHasText ? overlayLines : [],
        verticalKey,
      }),
      sitelinks: sitelinksForVertical(verticalKey, promo),
      callouts: calloutsForVertical(verticalKey, promo),
      forbidden: [
        'обход санкций/ограничений',
        'гарантии одобрения',
        'P2P/вывод',
        'gambling/adult/crypto',
        'бренды Apple Pay / Google Pay / Booking',
        ...(verticalKey === 'fintech_loans' || verticalKey === 'marketplace_rental'
          ? ['зарубежная карта', 'СБП-выпуск карты']
          : []),
        ...(verticalKey === 'marketplace_rental' ? ['займы', 'микрозаймы', 'гарантия оборота'] : []),
      ],
      sizes: RSYA_SIZES,
      preferred_packs: assets.filter((a) =>
        angle.id === 'travel'
          ? /travel/i.test(a)
          : angle.id === 'services'
            ? /service|subscription/i.test(a)
            : angle.id === 'rent' || angle.id === 'shop'
              ? /market|shop|rent|витрин/i.test(a)
              : true,
      ),
      rule:
        adFormat === 'graphic'
          ? 'Креатив с надписями оффера → TextAd + AdImageHash (текст на баннере)'
          : 'Чистая картинка → товарное TextAd (заголовок/текст в настройках объявления)',
      vertical_brief: verticalBrief.visual,
      reference_images: references,
    };
  });

  let generated = [];
  if (!agentMode && imgCfg.configured) {
    generated = await generateAngleImages({
      angles,
      offer,
      runId,
      limit: Number(process.env.IMAGE_GEN_LIMIT || 2),
      format: genFormat,
      overlaysByAngle,
      verticalKey,
    });
  } else if (agentMode) {
    generated = angles.slice(0, Number(process.env.IMAGE_GEN_LIMIT || 2)).map((angle) => ({
      ok: false,
      pending_agent: true,
      provider: imgCfg.provider,
      angle_id: angle.id,
      format: genFormat,
      image_has_text: imageHasText,
      prompt: creatives.find((c) => c.angle_id === angle.id)?.image_prompt,
      reason: 'Ожидает креатив-агента Cursor',
    }));
  }

  const fromRefs = referencesAsGeneratedImages(references, angles);
  generated = mergeGeneratedImages(generated, fromRefs);

  const okImages = generated.filter((g) => g.ok);
  const awaitingAgent = agentMode && fromRefs.length === 0;
  const qa = validateCreatives(creatives, {
    verticalKey,
    requireImages: !agentMode,
    generatedImages: generated,
  });
  if (agentMode && okImages.length === 0) {
    qa.warnings = [
      ...(qa.warnings || []),
      {
        angle_id: null,
        text: 'Картинки нарисует креатив-агент Cursor (или загрузите референсы)',
      },
    ];
  }
  const checklist = creativeModerationChecklist({ verticalKey });
  const ingest = agentMode ? createIngestToken() : null;
  const publicBase = process.env.ARBTRACK_PUBLIC_URL || 'https://trekerarbitrag.ru';

  const summaryParts = [
    `Роль: ${verticalBrief.role}`,
    `Формат: ${formatLabel(adFormat)} (TextAd + картинка)`,
    `брифы: ${creatives.length}`,
    references.length ? `референсы: ${references.length}` : null,
    imgCfg.provider === 'agent'
      ? `agent: ${okImages.length} img${awaitingAgent ? ' · ждём GenerateImage' : ''}`
      : imgCfg.configured
        ? `${imgCfg.provider}: ${okImages.length}/${generated.length}`
        : 'генерация выкл',
    qa.ok ? 'QA креативов ok' : `QA: ${qa.errors.length} ошибок`,
  ].filter(Boolean);

  const hardVerticalFail = qa.errors.some((e) =>
    /зарубежная карта|займы:|маркетплейс:|запрещённая формулировка/.test(e.text),
  );
  const noImages =
    !agentMode && Boolean(imgCfg.configured) && okImages.length === 0 && imgCfg.provider !== 'none';

  return {
    summary: summaryParts.join(' · '),
    creatives: {
      ad_format: adFormat,
      requested_ad_format: requestedFormat,
      image_has_text: imageHasText,
      briefs: creatives,
      existing_assets: assets,
      reference_images: references,
      reference_batch_id: batchId || null,
      generated_images: generated,
      image_provider: imgCfg,
      awaiting_agent_images: awaitingAgent,
      qa,
      checklist,
      creative_role: systemRole,
      generator_hint:
        'По умолчанию креативы рисует Cursor-агент (GenerateImage) по брифу и референсам.',
      direct_textad_min_size: '450x450 (лучше 1080x1080)',
      rotation_rule: '2–3 креатива на угол; через 3–5 дней пауза худшего через аналитика трафика',
      ingest: ingest
        ? {
            url: `${publicBase.replace(/\/$/, '')}/api/pipeline/ingest-creatives`,
            run_id: runId,
          }
        : null,
    },
    failed: hardVerticalFail || noImages,
    cursor_prompt: agentCursorPrompt({
      systemRole,
      adFormat,
      formatLabelText: formatLabel(adFormat),
      verticalKey,
      verticalHint: verticalCursorHint(verticalKey),
      imgCfg,
      offer,
      promo,
      creatives,
      references,
      okImages,
      qa,
      runId,
      ingestToken: ingest?.token,
      publicBase,
    }),
    context_patch: {
      reference_images: references,
      reference_batch_id: batchId || null,
      creative_ingest: ingest
        ? {
            hash: ingest.hash,
            url: `${publicBase.replace(/\/$/, '')}/api/pipeline/ingest-creatives`,
            run_id: runId,
          }
        : null,
      creatives: {
        ad_format: adFormat,
        requested_ad_format: requestedFormat,
        image_has_text: imageHasText,
        briefs: creatives,
        existing_assets: assets,
        reference_images: references,
        generated_images: generated,
        image_provider: imgCfg,
        awaiting_agent_images: awaitingAgent,
        qa,
        checklist,
        creative_role: systemRole,
        rotation_rule: '2–3 креатива на угол; через 3–5 дней пауза худшего',
      },
      spawn_creative_agent: agentMode,
    },
  };
}
