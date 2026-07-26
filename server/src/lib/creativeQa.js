/**
 * Creative QA before Direct apply / moderation.
 * Vertical checklists + require image for TextAd with AdImageHash path.
 */

const FORBIDDEN_GENERIC = [
  /100%\s*одобр/i,
  /гарантир(ую|уем|овано)/i,
  /обход\s*(санкц|огранич)/i,
  /apple\s*pay|google\s*pay|booking\.com|spotify|chatgpt/i,
  /казино|ставки\s*на\s*спорт|1xbet/i,
];

const CARD_REQUIRED = /зарубежн\S*\s+карт|выпуск\s+зарубежн/i;
const LOAN_FORBIDDEN_CARD = /зарубежн\S*\s+карт|виртуальн\S*\s+карт/i;

function textsOfBrief(brief = {}) {
  return [
    ...(brief.titles || []),
    ...(brief.texts || []),
    ...(brief.overlay_lines || []),
    ...(brief.callouts || []),
    ...(brief.sitelinks || []).flatMap((s) => [s.title, s.description]),
  ]
    .filter(Boolean)
    .map(String);
}

/**
 * Validate creative briefs against vertical rules.
 * @returns {{ ok: boolean, errors: object[], warnings: object[], per_brief: object[] }}
 */
export function validateCreatives(briefs = [], { verticalKey = '', requireImages = true, generatedImages = [] } = {}) {
  const errors = [];
  const warnings = [];
  const perBrief = [];
  const okImages = (generatedImages || []).filter((g) => g.ok && (g.path || g.file));

  for (const brief of briefs) {
    const texts = textsOfBrief(brief);
    const blob = texts.join(' · ');
    const briefErrors = [];
    const briefWarnings = [];

    for (const re of FORBIDDEN_GENERIC) {
      if (re.test(blob)) {
        briefErrors.push(`запрещённая формулировка: ${re.source}`);
      }
    }

    if (verticalKey === 'fintech_cards' || (!verticalKey && CARD_REQUIRED.test(blob))) {
      const hasCardWording = texts.some((t) => CARD_REQUIRED.test(t));
      if (!hasCardWording && verticalKey === 'fintech_cards') {
        briefErrors.push('для карточной вертикали нужна формулировка «зарубежная карта» / «выпуск зарубежной карты»');
      }
    }

    if (verticalKey === 'fintech_loans' && LOAN_FORBIDDEN_CARD.test(blob)) {
      briefErrors.push('займы: нельзя шаблоны про зарубежную/виртуальную карту');
    }

    for (const t of brief.titles || []) {
      if (String(t).length > 56) briefWarnings.push(`Title длиннее 56: «${String(t).slice(0, 40)}…»`);
    }
    for (const t of brief.texts || []) {
      if (String(t).length > 81) briefWarnings.push(`Text длиннее 81: «${String(t).slice(0, 40)}…»`);
    }

    const angleImages = okImages.filter(
      (g) => !g.angle_id || g.angle_id === brief.angle_id,
    );
    if (requireImages && !angleImages.length && !(brief.preferred_packs || []).length) {
      briefWarnings.push('нет сгенерированной картинки для угла — объявление может уйти без AdImageHash');
    }

    // Recommend 2–3 variants
    const variantCount = (brief.titles || []).length;
    if (variantCount < 2) {
      briefWarnings.push('меньше 2 заголовков на угол — слабая ротация');
    }

    perBrief.push({
      angle_id: brief.angle_id,
      ok: briefErrors.length === 0,
      errors: briefErrors,
      warnings: briefWarnings,
    });
    errors.push(...briefErrors.map((e) => ({ angle_id: brief.angle_id, text: e })));
    warnings.push(...briefWarnings.map((w) => ({ angle_id: brief.angle_id, text: w })));
  }

  if (requireImages && briefs.length && !okImages.length) {
    errors.push({
      angle_id: null,
      text: 'нет ни одной картинки — TextAd без AdImageHash (пустые объявления)',
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    per_brief: perBrief,
    images_ok: okImages.length,
    briefs: briefs.length,
  };
}

/** Operator checklist items for creative/moderation (point 3+7). */
export function creativeModerationChecklist({ verticalKey = '', qa = {} } = {}) {
  const loan = verticalKey === 'fintech_loans';
  const card = verticalKey === 'fintech_cards';
  return [
    {
      id: 'image_required',
      text: 'У каждого объявления есть картинка (AdImageHash), не «пустой» TextAd',
      required: true,
    },
    {
      id: 'vertical_copy',
      text: loan
        ? 'Тексты только про займ/сумму/паспорт — без «зарубежной карты»'
        : card
          ? 'В Title/Text явно «зарубежная карта» / «выпуск зарубежной карты»'
          : 'Тексты соответствуют вертикали оффера',
      required: true,
    },
    {
      id: 'no_guarantees',
      text: 'Нет гарантий одобрения, чужих брендов, обхода ограничений',
      required: true,
    },
    {
      id: 'variants',
      text: '2–3 креатива на угол; через 3–5 дней пауза худшего',
      required: false,
    },
    {
      id: 'docs_theme',
      text: loan
        ? 'При запросе модерации — документы по тематике «Займы»'
        : 'Документы по фин. тематике — только если Директ запросит',
      required: false,
    },
    {
      id: 'moderation_status',
      text: 'После отправки: Status=ACCEPTED; не лить бюджет в REJECTED / сильно ограниченную',
      required: true,
      current: qa?.direct_status || null,
    },
  ];
}
