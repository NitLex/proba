/**
 * РСЯ ad format rules:
 * - graphic  → ImageAd: текст оффера НА креативе
 * - product  → TextAd (товарный стиль): чистая картинка, текст в полях объявления
 * - auto     → если креатив с надписями → graphic, иначе product
 */

export const AD_FORMATS = ['auto', 'graphic', 'product'];

export function normalizeAdFormat(raw) {
  const v = String(raw || 'auto')
    .toLowerCase()
    .trim();
  if (v === 'graphic' || v === 'графическое' || v === 'image' || v === 'banner') return 'graphic';
  if (v === 'product' || v === 'товарное' || v === 'tgo' || v === 'text' || v === 'shopping') {
    return 'product';
  }
  return 'auto';
}

/** Resolve concrete format for a brief / generated image. */
export function resolveAdFormat({ requested = 'auto', imageHasText } = {}) {
  const req = normalizeAdFormat(requested);
  if (req === 'graphic' || req === 'product') return req;
  // auto: креатив с надписями → графическое, иначе товарное
  if (imageHasText === true) return 'graphic';
  if (imageHasText === false) return 'product';
  return 'product';
}

/** Short RU lines to bake into a graphic banner (offer data). */
export function overlayLinesForOffer({ offer, angle, promo, titles, texts } = {}) {
  const code = promo?.code || offer?.promo_code || '';
  const title =
    (titles && titles[0]) ||
    angle?.title ||
    offer?.name ||
    'Цифровая карта';
  const benefit =
    (texts && texts[0]) ||
    (code ? `Промокод ${code}` : 'Оформление онлайн');
  const lines = [String(title).slice(0, 42), String(benefit).slice(0, 48)];
  if (code && !lines.some((l) => l.includes(code))) {
    lines.push(`Промокод ${code}`);
  }
  return lines.filter(Boolean).slice(0, 3);
}

export function formatLabel(format) {
  return format === 'graphic' ? 'графическое' : 'товарное';
}
