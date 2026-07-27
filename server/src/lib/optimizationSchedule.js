/**
 * Optimization schedule playbook (day 0 / 2–3 / 5–7) + due-run helpers.
 */

export const OPTIMIZATION_SCHEDULE = {
  phases: [
    {
      id: 'day0',
      day_from: 0,
      day_to: 0,
      title: 'Запуск',
      actions: [
        'Кампания OFF → модерация оператором → ON',
        'Жёсткий BidCeiling (CPC max из playbook)',
        'Дети −100%, автоминуса junk lexicon',
      ],
      traffic_focus: null,
    },
    {
      id: 'day2_3',
      day_from: 2,
      day_to: 3,
      title: 'Первая чистка площадок',
      actions: [
        'Прогон аналитика трафика: минус-площадки',
        'Алерты атрибуции Direct↔tracker / постбэк',
      ],
      traffic_focus: 'placements',
    },
    {
      id: 'day5_7',
      day_from: 5,
      day_to: 7,
      title: 'Креативы и ставки',
      actions: [
        'Пауза слабых объявлений',
        'Корректировки возраста/mobile по факту',
        'Снижение BidCeiling если CPC > EPC',
        'Стоп при сливе',
      ],
      traffic_focus: 'ads_bids',
    },
  ],
};

export function phaseForDay(day = 0) {
  const d = Math.max(0, Number(day) || 0);
  if (d <= 0) return OPTIMIZATION_SCHEDULE.phases[0];
  if (d <= 3) return OPTIMIZATION_SCHEDULE.phases[1];
  return OPTIMIZATION_SCHEDULE.phases[2];
}

/** Days since ISO date (YYYY-MM-DD or datetime). */
export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const t = new Date(String(iso).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!Number.isFinite(t)) return null;
  const n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((n - t) / 86400000));
}

/**
 * Suggest schedule action for a Direct campaign given first-seen / created date.
 */
export function scheduleAdvice({ createdAt, moderated = false, serving = false } = {}) {
  const day = daysSince(createdAt) ?? 0;
  const phase = phaseForDay(day);
  const readyForTraffic =
    moderated && (phase.id === 'day2_3' || phase.id === 'day5_7' || day >= 2);
  return {
    day,
    phase,
    ready_for_traffic_analyst: readyForTraffic,
    serving,
    moderated,
    hint: phase.actions[0],
  };
}
