import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const FORBIDDEN = [
  'обход санкций/ограничений',
  'гарантии одобрения',
  'P2P/вывод',
  'gambling/adult/crypto',
  'бренды Apple Pay / Google Pay / Booking',
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

function resolveAdFormat(requested) {
  // product = clean image → TextAd; graphic = text on banner → ImageAd
  if (requested === 'graphic' || requested === 'image') return 'graphic';
  if (requested === 'product' || requested === 'textad') return 'product';
  return 'product'; // default for PPM pipeline: товарное
}

function adCopy(angle, offer, promo) {
  const code = promo?.code || 'LG2026';
  const map = {
    travel: {
      titles: [
        'Цифровая карта для поездок',
        'Оплата в поездках онлайн',
        'Карта для путешествий',
      ],
      title2: ['Оформление онлайн', 'Пополнение по СБП', `Промокод ${code}`],
      texts: [
        `Оформление онлайн. Пополнение по СБП. Промокод ${code} — скидка на выпуск.`,
        `Быстрый выпуск. Промокод ${code}. Пополнение рублями.`,
      ],
    },
    services: {
      titles: ['Оплата подписок онлайн', 'Карта для сервисов', 'Карта онлайн за минуты'],
      title2: ['Быстрый выпуск', 'Карта онлайн', `Промокод ${code}`],
      texts: [
        `Пополнение по СБП. Промокод ${code} — на открытие карты.`,
        `Быстрый выпуск. Промокод ${code}.`,
      ],
    },
    sbp: {
      titles: [
        'Карта с пополнением по СБП',
        'Выпуск карты онлайн',
        'Цифровая карта за минуты',
      ],
      title2: [`Промокод ${code}`, 'Пополнение рублями', 'Оформление онлайн'],
      texts: [
        `Промокод ${code}. Пополнение рублями по СБП.`,
        `Быстрый выпуск онлайн. Пополнение по СБП. Промокод ${code}.`,
      ],
    },
    premium: {
      titles: ['Премиальная карта с выгодным курсом', 'Больше выгоды на оплатах'],
      title2: ['Онлайн-выпуск', `Промокод ${code}`],
      texts: [`Промокод ${code} — скидка на премиум-выпуск.`],
    },
    generic: {
      titles: [String(offer.name || 'Оформить онлайн').slice(0, 56), 'Быстрый выпуск карты'],
      title2: ['Оформление онлайн', `Промокод ${code}`],
      texts: [`Оформление онлайн. Промокод ${code}.`, 'Пополнение рублями по СБП.'],
    },
  };
  return map[angle.id] || map.generic;
}

function packFilter(angleId, assetPath) {
  if (angleId === 'travel') return /travel/i.test(assetPath);
  if (angleId === 'services') return /service|subscription/i.test(assetPath);
  if (angleId === 'sbp') return /sbp/i.test(assetPath);
  if (angleId === 'premium') return /premium|banners-all|product-textad-all/i.test(assetPath);
  return true;
}

export async function runCreative({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [
    { id: 'travel', title: 'Поездки / travel-оплаты' },
    { id: 'services', title: 'Подписки и онлайн-сервисы' },
    { id: 'sbp', title: 'Быстрый выпуск + СБП' },
  ];
  const promo = (playbook.promo_codes || [])[0] || { code: 'LG2026', note: '−500 ₽ (если актуально)' };
  const requested = playbook.ad_format || context.ad_format || 'auto';
  const adFormat = resolveAdFormat(requested);
  const imageHasText = adFormat === 'graphic';
  const assets = listExistingAssets();

  const creatives = angles.map((angle) => {
    const copy = adCopy(angle, offer, promo);
    return {
      angle_id: angle.id,
      angle_title: angle.title,
      ad_format: adFormat,
      requested_ad_format: requested,
      image_has_text: imageHasText,
      direct_ad_type: imageHasText ? 'ImageAd' : 'TextAd',
      titles: copy.titles,
      title2: copy.title2,
      texts: copy.texts,
      overlay_lines: imageHasText ? [copy.titles[0], `Промокод ${promo.code || 'LG2026'}`] : [],
      sitelinks: [
        { title: 'Оформить карту', description: 'Онлайн за пару минут' },
        {
          title: `Промокод ${promo?.code || 'LG2026'}`,
          description: promo?.note || '−500 ₽ (если актуально)',
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
      forbidden: FORBIDDEN,
      sizes: RSYA_SIZES,
      preferred_packs: assets.filter((a) => packFilter(angle.id, a)),
      rule: imageHasText
        ? 'Текст на баннере → ImageAd'
        : 'Чистая картинка → товарное TextAd (заголовок/текст в настройках объявления)',
    };
  });

  const generatorHint =
    adFormat === 'product'
      ? 'creatives/rsya/generate_product_textad.py — product = чистая картинка → TextAd'
      : 'creatives/rsya/generate_banners_lg2026.py — graphic = текст на баннере → ImageAd';

  return {
    summary: `Формат: ${adFormat === 'product' ? 'товарное (TextAd)' : 'графическое (ImageAd)'} · брифы: ${creatives.length} · ассетов: ${assets.length}`,
    creatives: {
      ad_format: adFormat,
      requested_ad_format: requested,
      image_has_text: imageHasText,
      briefs: creatives,
      existing_assets: assets,
      generator_hint: generatorHint,
      direct_textad_min_size: '450x450 (лучше 1080x1080)',
    },
    cursor_prompt: [
      'Ты креатив-агент для РСЯ Яндекс.Директ.',
      `Формат объявлений: ${adFormat} (${imageHasText ? 'ImageAd, текст на баннере' : 'product TextAd, картинка без текста'}).`,
      `Оффер: ${JSON.stringify({ name: offer.name, promo })}`,
      `Брифы: ${JSON.stringify(creatives.map((c) => ({ id: c.angle_id, format: c.ad_format, overlay: c.overlay_lines })))}`,
      'Сделай конкретные изменения в репозитории (креативы / скрипты / конфиги) или подготовь артефакты.',
    ].join('\n'),
    context_patch: {
      creatives: {
        ad_format: adFormat,
        image_has_text: imageHasText,
        briefs: creatives,
        existing_assets: assets,
      },
    },
  };
}
