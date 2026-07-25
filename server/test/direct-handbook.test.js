import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_DOC_SOURCES,
  DIRECT_HARD_RULES,
  getDirectKnowledgeBrief,
  directAgentSystemPrompt,
} from '../src/pipeline/knowledge/direct-handbook.js';

test('direct handbook has official sources', () => {
  assert.ok(DIRECT_DOC_SOURCES.length >= 5);
  assert.ok(DIRECT_DOC_SOURCES.every((s) => /^https:\/\//.test(s.url)));
  assert.ok(DIRECT_HARD_RULES.some((r) => /модерац/i.test(r)));
});

test('direct knowledge brief and system prompt mention help root', () => {
  const brief = getDirectKnowledgeBrief();
  assert.match(brief.help_root, /support\/direct/);
  const prompt = directAgentSystemPrompt();
  assert.match(prompt, /yandex\.ru\/support\/direct/);
  assert.match(prompt, /ads\.moderate/);
});
