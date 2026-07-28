/**
 * Yandex Metrika playbook for РСЯ / affiliate:
 * soft vs hard goals, retargeting, when to switch from clicks → conversions.
 */

export const METRIKA_DOC_SOURCES = [
  {
    id: 'goals',
    title: 'Цели в Яндекс Метрике',
    url: 'https://yandex.ru/support/metrica/general/goals.html',
  },
  {
    id: 'retargeting',
    title: 'Ретаргетинг',
    url: 'https://yandex.ru/support/direct/ru/remarketing/remarketing.html',
  },
  {
    id: 'conversions-direct',
    title: 'Цели и конверсии в Директе',
    url: 'https://yandex.ru/support/direct/ru/statistics/conversions',
  },
];

/** Soft goal = learning / retarget. Hard goal = money (approved/sale). */
export function recommendMetrikaGoals({ offer = {}, playbook = {} } = {}) {
  const payout = Number(offer.payout || offer.facts?.payout || 0);
  const model = String(offer.facts?.payout_model || '').toUpperCase();
  const loan =
    playbook?.vertical_key === 'fintech_loans' ||
    /займ|мфо|кредит|выдач/i.test(`${offer.name || ''} ${offer.notes || ''}`);

  const soft = {
    key: 'soft_lead',
    title: loan ? 'Заявка отправлена (lead)' : 'Целевое действие на ленде (lead)',
    where: 'thank-you / success / «заявка принята»',
    why: 'Для обучения, ретаргета и отчётов. Не равна выплате сети.',
  };
  const hard = {
    key: 'hard_sale',
    title:
      model === 'CPL'
        ? 'Подтверждённый лид сети (CPL approved)'
        : loan
          ? 'Выдача / approved (постбек сети)'
          : 'Оплата / sale (постбек сети)',
    where: 'оффлайн-конверсия / Measurement Protocol / серверный постбек → Метрика',
    why: 'Деньги. Оптимизировать автостратегию только когда цель стабильно бьёт.',
    suggested_cpa_cap_rub:
      payout > 0 ? Math.round(payout * (model === 'CPL' ? 0.55 : 0.4)) : null,
  };
  return { soft, hard, payout, model: model || null };
}

export function strategySwitchGate({
  softConversionsPerWeek = null,
  hardConversionsPerWeek = null,
  daysLive = null,
} = {}) {
  const soft = Number(softConversionsPerWeek);
  const hard = Number(hardConversionsPerWeek);
  const days = Number(daysLive);
  const readySoft = Number.isFinite(soft) && soft >= 40;
  const readyHard = Number.isFinite(hard) && hard >= 25;
  const readyDays = !Number.isFinite(days) || days >= 7;

  if (readyHard && readyDays) {
    return {
      stage: 'pay_for_conversion',
      label: 'Можно тест оплаты за конверсии (жёсткая цель)',
      strategy: 'WB_MAXIMUM_CONVERSION_RATE или PAY_FOR_CONVERSION с потолком CPA',
      use_goal: 'hard',
      ok: true,
    };
  }
  if (readySoft && readyDays) {
    return {
      stage: 'optimize_soft',
      label: 'Можно «макс. конверсий» по мягкой цели (осторожно)',
      strategy: 'WB_MAXIMUM_CONVERSION_RATE по soft lead + потолок CPC/недельный бюджет',
      use_goal: 'soft',
      ok: true,
      warning: 'Мягкая цель ≠ выплата. Следи за CR в LeadGid, не только за Метрикой.',
    };
  }
  return {
    stage: 'clicks',
    label: 'Остаёмся на кликах с потолком CPC',
    strategy: 'WB_MAXIMUM_CLICKS + BidCeiling',
    use_goal: null,
    ok: false,
    need: {
      soft_conversions_per_week: 40,
      hard_conversions_per_week: 25,
      min_days: 7,
      have: { softConversionsPerWeek: soft || 0, hardConversionsPerWeek: hard || 0, daysLive: days || 0 },
    },
  };
}

export function buildMetrikaOperatorPlan({
  counterId = null,
  softGoalId = null,
  hardGoalId = null,
  offer = {},
  playbook = {},
} = {}) {
  const goals = recommendMetrikaGoals({ offer, playbook });
  const gate = strategySwitchGate({});
  const counter = counterId ? Number(counterId) : null;
  const softId = softGoalId ? Number(softGoalId) : null;
  const hardId = hardGoalId ? Number(hardGoalId) : null;

  const audiences = [
    {
      id: 'visited_no_lead',
      text: 'Были на ленде, но без soft-цели → ретаргет 7–14 дней',
    },
    {
      id: 'lead_no_sale',
      text: 'Soft lead есть, hard нет → дожим / другой креатив (если оффер позволяет)',
    },
    {
      id: 'exclude_converters',
      text: 'Исключить тех, кто уже сделал hard-цель (не жечь повторно)',
    },
  ];

  const checklist = [
    {
      id: 'metrika_counter',
      text: counter
        ? `Счётчик Метрики ${counter} будет привязан к кампании (CounterIds)`
        : 'Создай счётчик Метрики на домене/ленде и укажи ID в Pipeline (поле «Метрика»)',
      required: true,
      counter_id: counter,
    },
    {
      id: 'metrika_soft_goal',
      text: softId
        ? `Мягкая цель ID ${softId}: ${goals.soft.title}`
        : `Создай мягкую цель: ${goals.soft.title} (${goals.soft.where})`,
      required: true,
      goal_id: softId,
    },
    {
      id: 'metrika_hard_goal',
      text: hardId
        ? `Жёсткая цель ID ${hardId}: ${goals.hard.title}`
        : `Настрой жёсткую цель: ${goals.hard.title} (${goals.hard.where})`,
      required: false,
      goal_id: hardId,
      suggested_cpa_cap_rub: goals.hard.suggested_cpa_cap_rub,
    },
    {
      id: 'metrika_on_landing',
      text: 'Код счётчика на ленде/преленде и на thank-you; проверь hit в «Онлайн» Метрики',
      required: true,
    },
    {
      id: 'metrika_retarget',
      text: 'Собери сегменты ретаргета (см. audiences) — даже на кликовой стратегии это режет слив',
      required: false,
    },
    {
      id: 'strategy_switch',
      text: `${gate.label}. Порог: ≥40 soft/нед или ≥25 hard/нед и ≥7 дней. Сейчас старт: ${gate.strategy}`,
      required: false,
      stage: gate.stage,
    },
  ];

  return {
    counter_id: counter,
    soft_goal_id: softId,
    hard_goal_id: hardId,
    goals,
    audiences,
    strategy_gate: gate,
    checklist,
    sources: METRIKA_DOC_SOURCES,
    start_strategy: 'WB_MAXIMUM_CLICKS',
    note:
      'Метрику и ретаргет подключаем сразу. Оплату за конверсии — только после порога статистики.',
  };
}

/** Fields for Direct TextCampaign add/update when counter is known. */
export function metrikaDirectCampaignFields(metrika = {}) {
  const counter = Number(metrika.counter_id);
  if (!Number.isFinite(counter) || counter <= 0) {
    return {
      CounterIds: null,
      SettingsPatch: [{ Option: 'ADD_METRICA_TAG', Value: 'NO' }],
      PriorityGoals: null,
    };
  }
  const priority = [];
  const soft = Number(metrika.soft_goal_id);
  const hard = Number(metrika.hard_goal_id);
  const payoutHint = Number(metrika.goals?.hard?.suggested_cpa_cap_rub || 0);
  // PriorityGoals Value is in currency micros? In Direct API Value is in currency units * 1_000_000 for some fields;
  // for PriorityGoals Item.Value — docs say long, "cost of achieving the goal" in currency multiplied by 1_000_000.
  if (Number.isFinite(soft) && soft > 0) {
    priority.push({
      GoalId: soft,
      Value: Math.max(1, Math.round((payoutHint > 0 ? payoutHint * 0.3 : 100) * 1_000_000)),
      IsMetrikaSourceOfValue: 'NO',
    });
  }
  if (Number.isFinite(hard) && hard > 0) {
    priority.push({
      GoalId: hard,
      Value: Math.max(1, Math.round((payoutHint > 0 ? payoutHint : 500) * 1_000_000)),
      IsMetrikaSourceOfValue: 'NO',
    });
  }
  return {
    CounterIds: { Items: [counter] },
    SettingsPatch: [{ Option: 'ADD_METRICA_TAG', Value: 'YES' }],
    PriorityGoals: priority.length ? { Items: priority.slice(0, 5) } : null,
  };
}
