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

function adCopy(angle, offer, promo) {
  const code = promo?.code || 'LG2026';
  const map = {
    travel: {
      titles: [
        'Виртуальная карта для путешествий',
        'Оплата за границей без проблем',
        'Карта для поездок онлайн',
      ],
      texts: [
        `Оформление онлайн. Пополнение по СБП. Промокод ${code} — скидка на выпуск.`,
        `Apple Pay и Google Pay. Промокод ${code}.`,
      ],
    },
    services: {
      titles: [
        'Оплата зарубежных сервисов',
        'Карта для оплаты подписок',
        'Карта онлайн за минуты',
      ],
      texts: [
        `Пополнение по СБП. Промокод ${code} — на открытие карты.`,
        `Быстрый выпуск. Промокод ${code}.`,
      ],
    },
    premium: {
      titles: ['Премиальная карта с выгодным курсом', 'Больше выгоды на оплатах'],
      texts: [`Промокод ${code} — скидка на премиум-выпуск.`],
    },
    generic: {
      titles: [String(offer.name || 'Оформить онлайн').slice(0, 56), 'Быстрый выпуск карты'],
      texts: [`Оформление онлайн. Промокод ${code}.`, 'Пополнение рублями по СБП.'],
    },
  };
  return map[angle.id] || map.generic;
}

export async function runCreative({ offer, context }) {
  const playbook = context.playbook || {};
  const angles = playbook.angles || [{ id: 'generic', title: 'Основной' }];
  const promo = (playbook.promo_codes || [])[0];
  const assets = listExistingAssets();

  const creatives = angles.map((angle) => {
    const copy = adCopy(angle, offer, promo);
    return {
      angle_id: angle.id,
      angle_title: angle.title,
      titles: copy.titles,
      texts: copy.texts,
      sitelinks: [
        { title: 'Оформить карту', description: 'Онлайн за пару минут' },
        { title: `Промокод ${promo?.code || 'LG2026'}`, description: promo?.note || 'Скидка на выпуск' },
        { title: 'Пополнение по СБП', description: 'Рублями с любого банка' },
        { title: 'Оплата в сервисах', description: 'Поездки и подписки' },
      ],
      callouts: ['Оформление онлайн', 'Пополнение по СБП', 'Карта в валюте', `Промокод ${promo?.code || 'LG2026'}`],
      forbidden: [
        'обход санкций/ограничений',
        'гарантии одобрения',
        'P2P/вывод',
        'gambling/adult/crypto',
      ],
      sizes: RSYA_SIZES,
      preferred_packs: assets.filter((a) =>
        angle.id === 'travel'
          ? /travel/i.test(a)
          : angle.id === 'services'
            ? /service|subscription/i.test(a)
            : true,
      ),
    };
  });

  const briefPathHint = 'creatives/rsya/ — используй generate_banners_v3.py или готовые zip';

  return {
    summary: `Креатив-брифы: ${creatives.length} углов, ассетов в репо: ${assets.length}.`,
    creatives: {
      briefs: creatives,
      existing_assets: assets,
      generator_hint: briefPathHint,
      direct_textad_min_size: '450x450 (лучше 1080x1080 JPG)',
    },
    cursor_prompt: [
      'Ты креатив-агент для РСЯ Яндекс.Директ.',
      `Оффер: ${JSON.stringify({ name: offer.name, promo: promo })}`,
      `Углы: ${JSON.stringify(angles)}`,
      `Брифы: ${JSON.stringify(creatives)}`,
      'Сгенерируй/обнови баннеры нужных размеров и короткие видео 7–8с. Не нарушай forbidden.',
    ].join('\n'),
    context_patch: { creatives: { briefs: creatives, existing_assets: assets } },
  };
}
