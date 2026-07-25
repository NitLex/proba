import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_DOC_SOURCES,
  DIRECT_HARD_RULES,
  DIRECT_BID_MODIFIERS,
  DIRECT_EXCLUDED_PLACEMENTS,
  DIRECT_CREATIVE_RULES,
  DIRECT_FINANCE_DOCS,
  buildDirectOperatorChecklist,
  getDirectKnowledgeBrief,
  directAgentSystemPrompt,
} from '../src/pipeline/knowledge/direct-handbook.js';

test('direct handbook has official sources', () => {
  assert.ok(DIRECT_DOC_SOURCES.length >= 8);
  assert.ok(DIRECT_DOC_SOURCES.every((s) => /^https:\/\//.test(s.url)));
  assert.ok(DIRECT_HARD_RULES.some((r) => /модерац/i.test(r)));
});

test('handbook covers modifiers, placements, creatives, finance docs', () => {
  assert.equal(DIRECT_BID_MODIFIERS.range.min_percent, -100);
  assert.equal(DIRECT_BID_MODIFIERS.range.max_percent, 1200);
  assert.equal(DIRECT_EXCLUDED_PLACEMENTS.limit, 1000);
  assert.ok(DIRECT_CREATIVE_RULES.images.length >= 3);
  assert.ok(DIRECT_FINANCE_DOCS.payment_systems.russia_docs.length >= 1);
  assert.match(DIRECT_FINANCE_DOCS.payment_systems.url, /finance-payment/);
});

test('fintech checklist marks docs required', () => {
  const list = buildDirectOperatorChecklist({
    plan: { href: 'https://trekerarbitrag.ru/click/x', ad_format: 'product' },
    offer: { name: 'Плати по миру', vertical: 'Fintech' },
    playbook: { angles: [{ id: 'travel', title: 'Поездки' }] },
  });
  const docs = list.find((i) => i.id === 'docs_if_needed');
  assert.equal(docs.required, true);
  assert.ok(list.find((i) => i.id === 'placements_day2'));
  assert.ok(list.find((i) => i.id === 'bid_modifiers'));
});

test('direct knowledge brief and system prompt mention help root', () => {
  const brief = getDirectKnowledgeBrief();
  assert.match(brief.help_root, /support\/direct/);
  assert.ok(brief.bid_modifiers);
  assert.ok(brief.excluded_placements);
  assert.ok(brief.finance_docs);
  const prompt = directAgentSystemPrompt();
  assert.match(prompt, /yandex\.ru\/support\/direct/);
  assert.match(prompt, /ads\.moderate/);
  assert.match(prompt, /площад/i);
});
