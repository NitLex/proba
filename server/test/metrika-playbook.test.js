import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetrikaOperatorPlan,
  metrikaDirectCampaignFields,
  recommendMetrikaGoals,
  strategySwitchGate,
} from '../src/pipeline/knowledge/metrika-playbook.js';
import { buildDirectOperatorChecklist } from '../src/pipeline/knowledge/direct-handbook.js';
import { resolveMetrikaConfig } from '../src/pipeline/agents/direct.js';

test('recommendMetrikaGoals distinguishes soft lead vs hard sale for loans', () => {
  const goals = recommendMetrikaGoals({
    offer: { name: 'Nova Credit - Выдача', payout: 2500, facts: { payout_model: 'CPA' } },
    playbook: { vertical_key: 'fintech_loans' },
  });
  assert.match(goals.soft.title, /заявк/i);
  assert.match(goals.hard.title, /выдач|approved/i);
  assert.equal(goals.hard.suggested_cpa_cap_rub, Math.round(2500 * 0.4));
});

test('strategySwitchGate stays on clicks until thresholds', () => {
  const early = strategySwitchGate({ softConversionsPerWeek: 10, hardConversionsPerWeek: 2, daysLive: 3 });
  assert.equal(early.ok, false);
  assert.equal(early.stage, 'clicks');

  const softReady = strategySwitchGate({ softConversionsPerWeek: 40, daysLive: 7 });
  assert.equal(softReady.ok, true);
  assert.equal(softReady.stage, 'optimize_soft');
  assert.equal(softReady.use_goal, 'soft');

  const hardReady = strategySwitchGate({ hardConversionsPerWeek: 25, daysLive: 10 });
  assert.equal(hardReady.ok, true);
  assert.equal(hardReady.stage, 'pay_for_conversion');
  assert.equal(hardReady.use_goal, 'hard');
});

test('metrikaDirectCampaignFields wires CounterIds and ADD_METRICA_TAG', () => {
  const empty = metrikaDirectCampaignFields({});
  assert.equal(empty.CounterIds, null);
  assert.equal(empty.SettingsPatch[0].Value, 'NO');

  const full = metrikaDirectCampaignFields({
    counter_id: 998877,
    soft_goal_id: 11,
    hard_goal_id: 22,
    goals: { hard: { suggested_cpa_cap_rub: 800 } },
  });
  assert.deepEqual(full.CounterIds, { Items: [998877] });
  assert.equal(full.SettingsPatch[0].Option, 'ADD_METRICA_TAG');
  assert.equal(full.SettingsPatch[0].Value, 'YES');
  assert.equal(full.PriorityGoals.Items.length, 2);
  assert.equal(full.PriorityGoals.Items[0].GoalId, 11);
  assert.equal(full.PriorityGoals.Items[1].GoalId, 22);
});

test('buildMetrikaOperatorPlan checklist mentions counter and switch gate', () => {
  const plan = buildMetrikaOperatorPlan({
    counterId: 55,
    softGoalId: 1,
    offer: { name: 'Тест' },
  });
  assert.equal(plan.counter_id, 55);
  assert.equal(plan.start_strategy, 'WB_MAXIMUM_CLICKS');
  assert.ok(plan.checklist.some((c) => c.id === 'metrika_counter' && /55/.test(c.text)));
  assert.ok(plan.checklist.some((c) => c.id === 'strategy_switch'));
  assert.ok(plan.audiences.length >= 3);
});

test('resolveMetrikaConfig prefers offer over env', () => {
  const prev = process.env.YANDEX_METRIKA_COUNTER_ID;
  process.env.YANDEX_METRIKA_COUNTER_ID = '111';
  try {
    const fromOffer = resolveMetrikaConfig({
      offer: { metrika_counter_id: 222, metrika_soft_goal_id: 3 },
      playbook: {},
    });
    assert.equal(fromOffer.counter_id, 222);
    assert.equal(fromOffer.soft_goal_id, 3);

    const fromEnv = resolveMetrikaConfig({ offer: {}, playbook: {} });
    assert.equal(fromEnv.counter_id, 111);
  } finally {
    if (prev == null) delete process.env.YANDEX_METRIKA_COUNTER_ID;
    else process.env.YANDEX_METRIKA_COUNTER_ID = prev;
  }
});

test('operator checklist includes metrika items', () => {
  const list = buildDirectOperatorChecklist({
    plan: {
      href: 'https://trekerarbitrag.ru/click/x',
      metrika: buildMetrikaOperatorPlan({ counterId: 77, softGoalId: 8 }),
    },
    offer: { name: 'Offer', metrika_counter_id: 77 },
    playbook: {},
  });
  assert.ok(list.find((i) => i.id === 'metrika_counter'));
  assert.ok(list.find((i) => i.id === 'metrika_soft_goal'));
  assert.ok(list.find((i) => i.id === 'strategy_switch'));
  assert.match(list.find((i) => i.id === 'metrika_counter').text, /77/);
});
