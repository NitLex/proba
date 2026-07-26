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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const creativesRoot = path.resolve(__dirname, '../../../../creatives/rsya');

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
  if (!fs.existsSync(creativesRoot)) return found;
  for (const name of fs.readdirSync(creativesRoot)) {
    if (/\.(zip|mp4|jpg|png)$/i.test(name)) {
      found.push(path.join('creatives/rsya', name));
    }
  }
  const textAd = path.join(creativesRoot, 'direct-textad');
  if (fs.existsSync(textAd)) {
    for (const name of fs.readdirSync(textAd)) {
      if (/\.(jpg|png)$/i.test(name)) found.push(path.join('creatives/rsya/direct-textad', name));
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

/**
 * Copy from offer research + vertical.
 * Cards (PPM): must say «зарубежная карта».
 * Loans: only loan claims from offer brief — never card templates.
 */
function adCopy(angle, offer, promo, verticalKey) {
  const code = promo?.code || offer.promo_code || '';
  if (verticalKey === 'fintech_loans') return loanAdCopy(angle, offer);

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

/**
 * Decide generation format from offer.ad_format.
 * auto → product by default (текст в полях); graphic only when explicitly requested
 * or when notes hint at "текст на баннере".
 */
function decideGenerationFormat(offer) {
  const requested = normalizeAdFormat(offer.ad_format || offer.adFormat || 'auto');
  if (requested === 'graphic' || requested === 'product') return requested;
  const notes = `${offer.notes || ''} ${offer.creative_notes || ''}`.toLowerCase();
  if (/графич|текст на (баннер|картинк|креатив)|надпис/.test(notes)) return 'graphic';
  // auto default: товарное — чистая картинка, текст в настройках объявления
  return 'product';
}

export async function runCreative({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [{ id: 'generic', title: 'Основной' }];
  const promo = (playbook.promo_codes || [])[0] || { code: offer.promo_code || '' };
  const verticalKey = playbook.vertical_key || context.analysis?.vertical_key || '';
  const assets = listExistingAssets();
  const imgCfg = imageGenConfig();
  const runId = context.run_id || `offer-${Date.now()}`;
  const requestedFormat = normalizeAdFormat(offer.ad_format || offer.adFormat || 'auto');
  const genFormat = decideGenerationFormat(offer);
  const imageHasText = genFormat === 'graphic';
  const adFormat = resolveAdFormat({ requested: requestedFormat, imageHasText });

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

    return {
      angle_id: angle.id,
      angle_title: angle.title,
      ad_format: adFormat,
      requested_ad_format: requestedFormat,
      image_has_text: imageHasText,
      direct_ad_type: 'TextAd',
      titles: copy.titles,
      texts: copy.texts,
      // Для товарных: текст только в полях. Для графических: те же данные ещё и на картинке.
      overlay_lines: imageHasText ? overlayLines : [],
      image_prompt: buildCreativePromptForProvider(imgCfg.provider || 'yandex_art', {
        angle,
        offer,
        format: genFormat,
        overlayLines: imageHasText ? overlayLines : [],
      }),
      sitelinks:
        verticalKey === 'fintech_loans'
          ? [
              { title: 'Оформить онлайн', description: 'Заявка за минуты' },
              { title: 'На карту', description: 'Или наличными в регионе' },
              { title: 'Условия', description: 'Изучите на сайте' },
              { title: 'Поддержка', description: 'Помощь по заявке' },
            ]
          : [
              { title: 'Зарубежная карта', description: 'Выпуск онлайн за минуты' },
              {
                title: promo?.code ? `Промокод ${promo.code}` : 'Оформить',
                description: promo?.note || 'Скидка на выпуск',
              },
              { title: 'Пополнение по СБП', description: 'Рублями с любого банка' },
              { title: 'Оплата в сервисах', description: 'Поездки и подписки' },
            ],
      callouts:
        verticalKey === 'fintech_loans'
          ? ['Онлайн-займ', 'Оформление быстро', 'На карту', 'Условия на сайте']
          : [
              'Выпуск зарубежной карты',
              'Пополнение по СБП',
              'Оформление онлайн',
              promo?.code ? `Промокод ${promo.code}` : 'Без очередей',
            ],
      forbidden: [
        'обход санкций/ограничений',
        'гарантии одобрения',
        'P2P/вывод',
        'gambling/adult/crypto',
        'бренды Apple Pay / Google Pay / Booking',
        ...(verticalKey === 'fintech_loans' ? ['зарубежная карта', 'СБП-выпуск карты'] : []),
      ],
      sizes: RSYA_SIZES,
      preferred_packs: assets.filter((a) =>
        angle.id === 'travel'
          ? /travel/i.test(a)
          : angle.id === 'services'
            ? /service|subscription/i.test(a)
            : true,
      ),
      rule:
        adFormat === 'graphic'
          ? 'Креатив с надписями оффера → TextAd + AdImageHash (текст на баннере)'
          : 'Чистая картинка → товарное TextAd (заголовок/текст в настройках объявления)',
    };
  });

  const generated = await generateAngleImages({
    angles,
    offer,
    runId,
    limit: Number(process.env.IMAGE_GEN_LIMIT || 2),
    format: genFormat,
    overlaysByAngle,
  });

  const okImages = generated.filter((g) => g.ok);
  const summaryParts = [
    `Формат: ${formatLabel(adFormat)} (TextAd + картинка)`,
    `брифы: ${creatives.length}`,
    imgCfg.configured
      ? `${imgCfg.provider}: ${okImages.length}/${generated.length}`
      : 'генерация выкл',
  ];

  return {
    summary: summaryParts.join(' · '),
    creatives: {
      ad_format: adFormat,
      requested_ad_format: requestedFormat,
      image_has_text: imageHasText,
      briefs: creatives,
      existing_assets: assets,
      generated_images: generated,
      image_provider: imgCfg,
      generator_hint:
        'graphic = текст на баннере → TextAd+картинка (квадрат GPT); product = чистая картинка → TextAd',
      direct_textad_min_size: '450x450 (лучше 1080x1080)',
    },
    cursor_prompt: [
      'Ты креатив-агент для РСЯ Яндекс.Директ.',
      `Формат объявлений: ${adFormat} (${formatLabel(adFormat)}).`,
      adFormat === 'graphic'
        ? 'На баннере надписи оффера. В Директе TEXT_CAMPAIGN: TextAd + AdImageHash (не ImageAd).'
        : 'Картинка без текста. Заголовки/тексты только в полях TextAd.',
      verticalKey === 'fintech_loans'
        ? 'Вертикаль МФО/займы: тексты только из брифа оффера (сумма, паспорт, скорость). Не писать про зарубежную карту.'
        : 'В Title/Text обязательно «зарубежная карта» / «выпуск зарубежной карты» — иначе Директ требует банковскую лицензию.',
      `Оффер: ${JSON.stringify({
        name: offer.name,
        vertical_key: verticalKey,
        brief: offer.product_brief || offer.notes,
        promo,
      })}`,
      `Брифы: ${JSON.stringify(creatives.map((c) => ({ id: c.angle_id, format: c.ad_format, overlay: c.overlay_lines })))}`,
      `Файлы: ${JSON.stringify(okImages)}`,
    ].join('\n'),
    context_patch: {
      creatives: {
        ad_format: adFormat,
        requested_ad_format: requestedFormat,
        image_has_text: imageHasText,
        briefs: creatives,
        existing_assets: assets,
        generated_images: generated,
        image_provider: imgCfg,
      },
    },
  };
}
