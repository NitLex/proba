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

function resolveAdFormat(playbook) {
  const requested = String(playbook.ad_format || playbook.requested_ad_format || 'auto').toLowerCase();
  if (requested === 'graphic' || requested === 'image') {
    return { ad_format: 'graphic', image_has_text: true, direct_ad_type: 'ImageAd', requested_ad_format: requested };
  }
  if (requested === 'product' || requested === 'textad') {
    return { ad_format: 'product', image_has_text: false, direct_ad_type: 'TextAd', requested_ad_format: requested };
  }
  // auto → product (чистая картинка + TextAd) — безопасный дефолт для финтеха
  return { ad_format: 'product', image_has_text: false, direct_ad_type: 'TextAd', requested_ad_format: requested || 'auto' };
}

function adCopy(angle, offer, promo) {
  const code = promo?.code || 'LG2026';
  const map = {
    travel: {
      titles: ['Цифровая карта для поездок', 'Оплата в поездках онлайн', 'Карта для путешествий'],
      texts: [
        `Оформление онлайн. Пополнение по СБП. Промокод ${code} — скидка на выпуск.`,
        `Быстрый выпуск. Промокод ${code}. Пополнение рублями.`,
      ],
      image_prompt_mood:
        'travel mood, passport and boarding pass abstract shapes, soft blue sky gradient, suitcase silhouette',
    },
    services: {
      titles: ['Оплата подписок онлайн', 'Карта для сервисов', 'Карта онлайн за минуты'],
      texts: [
        `Пополнение по СБП. Промокод ${code} — на открытие карты.`,
        `Быстрый выпуск. Промокод ${code}.`,
      ],
      image_prompt_mood:
        'modern app subscriptions mood, soft neon accents, abstract phone screen glow, clean fintech UI shapes',
    },
    sbp: {
      titles: ['Карта с пополнением по СБП', 'Выпуск карты онлайн'],
      texts: [`Промокод ${code}. Пополнение рублями по СБП.`],
      image_prompt_mood: 'fast payment mood, abstract QR and wave lines, clean mint and charcoal palette',
    },
    premium: {
      titles: ['Премиальная карта с выгодным курсом', 'Больше выгоды на оплатах'],
      texts: [`Промокод ${code} — скидка на премиум-выпуск.`],
      image_prompt_mood: 'premium fintech card on dark marble, soft gold accents, cinematic lighting',
    },
    generic: {
      titles: [String(offer.name || 'Оформить онлайн').slice(0, 56), 'Быстрый выпуск карты'],
      texts: [`Оформление онлайн. Промокод ${code}.`, 'Пополнение рублями по СБП.'],
      image_prompt_mood: 'clean fintech product photo, soft gradient, premium lighting',
    },
  };
  return map[angle.id] || map.generic;
}

function buildImagePrompt(angle, offer, mood, fmt) {
  const productName = offer?.name || 'Плати по миру - Выпуск карты';
  const zeroText =
    fmt.image_has_text === false
      ? ' PRODUCT AD photo: pure lifestyle/product image with ZERO text, ZERO letters, ZERO numbers, ZERO watermarks, ZERO UI captions. Leave composition clean — all ad copy will be set separately in Yandex Direct fields.'
      : ' Graphic banner may include short Russian headline and promo badge; keep text large and readable.';
  return [
    'Photoreal advertising key visual for Russian Yandex Direct display ads, square 1024x1024.',
    `Product: digital payment card "${productName}".`,
    `Angle: ${angle.title || angle.id}.`,
    `${mood} Cinematic lighting, premium but trustworthy, high contrast focal subject.`,
    'No logos of Apple Pay, Google Pay, Booking, Visa, Mastercard, banks.',
    'No people faces close-up. No watermarks. Commercial stock quality.',
    zeroText.trim(),
  ].join(' ');
}

function assetFilter(angleId) {
  return (a) => {
    if (angleId === 'travel') return /travel/i.test(a);
    if (angleId === 'services') return /service|subscription/i.test(a);
    if (angleId === 'sbp') return /sbp|product-textad/i.test(a);
    if (angleId === 'premium') return /premium|banners-all/i.test(a);
    return /product-textad|direct-textad/i.test(a);
  };
}

export async function runCreative({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [
    { id: 'travel', title: 'Поездки / travel-оплаты' },
    { id: 'services', title: 'Подписки и онлайн-сервисы' },
    { id: 'sbp', title: 'Быстрый выпуск + СБП' },
  ];
  const promo = (playbook.promo_codes || [])[0] || { code: 'LG2026', note: '−500 ₽ (если актуально)' };
  const fmt = resolveAdFormat(playbook);
  const assets = listExistingAssets();

  const briefs = angles.map((angle) => {
    const copy = adCopy(angle, offer, promo);
    return {
      angle_id: angle.id,
      angle_title: angle.title,
      ad_format: fmt.ad_format,
      requested_ad_format: fmt.requested_ad_format,
      image_has_text: fmt.image_has_text,
      direct_ad_type: fmt.direct_ad_type,
      titles: copy.titles,
      texts: copy.texts,
      overlay_lines: fmt.image_has_text ? [copy.titles[0], `Промокод ${promo.code || 'LG2026'}`] : [],
      image_prompt: buildImagePrompt(angle, offer, copy.image_prompt_mood, fmt),
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
      preferred_packs: assets.filter(assetFilter(angle.id)),
      rule:
        fmt.ad_format === 'product'
          ? 'Чистая картинка → товарное TextAd (заголовок/текст в настройках объявления)'
          : 'Текст на баннере → ImageAd',
    };
  });

  const generatorHint =
    fmt.ad_format === 'product'
      ? 'creatives/rsya/generate_product_textad.py — чистые JPG 1080×1080 + zip brief sizes'
      : 'creatives/rsya/generate_banners_lg2026.py — графические баннеры с текстом';

  return {
    summary: `Формат: ${fmt.ad_format === 'product' ? 'товарное (TextAd)' : 'графическое (ImageAd)'} · брифы: ${briefs.length} · ассеты: ${assets.length}`,
    creatives: {
      ad_format: fmt.ad_format,
      requested_ad_format: fmt.requested_ad_format,
      image_has_text: fmt.image_has_text,
      briefs,
      existing_assets: assets,
      generator_hint: generatorHint,
      direct_textad_min_size: '450x450 (лучше 1080x1080)',
    },
    cursor_prompt: [
      'Ты креатив-агент для РСЯ Яндекс.Директ.',
      `Формат объявлений: ${fmt.ad_format} (${fmt.direct_ad_type}).`,
      fmt.image_has_text
        ? 'Картинка с текстом на баннере (ImageAd).'
        : 'Картинка без текста. Заголовки/тексты только в полях TextAd.',
      `Оффер: ${JSON.stringify({ name: offer.name, promo })}`,
      `Брифы: ${JSON.stringify(briefs.map((b) => ({ id: b.angle_id, format: b.ad_format, overlay: b.overlay_lines })))}`,
      `Файлы: ${JSON.stringify(assets)}`,
      'Сделай конкретные изменения в репозитории (креативы / скрипты / конфиги) или подготовь артефакты. Закоммить на feature-ветку.',
    ].join('\n'),
    context_patch: {
      creatives: {
        ad_format: fmt.ad_format,
        image_has_text: fmt.image_has_text,
        briefs,
        existing_assets: assets,
      },
    },
  };
}
