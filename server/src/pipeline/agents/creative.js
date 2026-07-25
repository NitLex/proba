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

/** Safer copy for Direct moderation — no brand names / Apple Pay / Google Pay. */
function adCopy(angle, offer, promo) {
  const code = promo?.code || offer.promo_code || 'LG2026';
  const map = {
    travel: {
      titles: [
        'Плати в поездках без стресса',
        'Карта в дорогу за минуты',
        'Оплата за границей онлайн',
      ],
      texts: [
        `Выпуск онлайн. Пополнение по СБП. Промокод ${code} — скидка на карту.`,
        `Не жди банк. Код ${code}. Карта для поездок и онлайн-оплат.`,
      ],
    },
    services: {
      titles: [
        'Оплачивай сервисы без отказа',
        'Карта для подписок онлайн',
        'Одна карта — все сервисы',
      ],
      texts: [
        `Открой онлайн. Пополнение по СБП. Промокод ${code} на выпуск.`,
        `Подписки и онлайн-оплаты. Код ${code}. Старт за минуты.`,
      ],
    },
    premium: {
      titles: ['Карта с другим уровнем', 'Премиум-выпуск онлайн'],
      texts: [`Промокод ${code} — скидка на премиум. Оформление за минуты.`],
    },
    sbp: {
      titles: ['Пополнил по СБП — платишь', 'Карта с СБП за минуты'],
      texts: [`Рубли с любого банка по СБП. Промокод ${code} на выпуск.`],
    },
    generic: {
      titles: [
        String(offer.name || 'Карта онлайн за минуты').slice(0, 56),
        'Выпуск карты без очередей',
      ],
      texts: [
        `Оформление онлайн. Промокод ${code}. Пополнение по СБП.`,
        `Быстрый старт. Код ${code}. Плати в сервисах и поездках.`,
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
  const promo = (playbook.promo_codes || [])[0] || { code: offer.promo_code || 'LG2026' };
  const assets = listExistingAssets();
  const imgCfg = imageGenConfig();
  const runId = context.run_id || `offer-${Date.now()}`;
  const requestedFormat = normalizeAdFormat(offer.ad_format || offer.adFormat || 'auto');
  const genFormat = decideGenerationFormat(offer);
  const imageHasText = genFormat === 'graphic';
  const adFormat = resolveAdFormat({ requested: requestedFormat, imageHasText });

  const overlaysByAngle = {};
  const creatives = angles.map((angle) => {
    const copy = adCopy(angle, offer, promo);
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
      direct_ad_type: adFormat === 'graphic' ? 'ImageAd' : 'TextAd',
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
      sitelinks: [
        { title: 'Оформить карту', description: 'Онлайн за пару минут' },
        {
          title: `Промокод ${promo?.code || 'LG2026'}`,
          description: promo?.note || 'Скидка на выпуск',
        },
        { title: 'Пополнение по СБП', description: 'Рублями с любого банка' },
        { title: 'Оплата в сервисах', description: 'Поездки и подписки' },
      ],
      callouts: [
        'Оформление онлайн',
        'Пополнение по СБП',
        'Цифровая карта',
        `Промокод ${promo?.code || 'LG2026'}`,
      ],
      forbidden: [
        'обход санкций/ограничений',
        'гарантии одобрения',
        'P2P/вывод',
        'gambling/adult/crypto',
        'бренды Apple Pay / Google Pay / Booking',
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
          ? 'Креатив с надписями оффера → графическое ImageAd (текст на баннере)'
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
    `Формат: ${formatLabel(adFormat)} (${adFormat === 'graphic' ? 'ImageAd' : 'TextAd'})`,
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
      `Оффер: ${JSON.stringify({ name: offer.name, promo })}`,
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
