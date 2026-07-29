import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMetrikaBridgeHtml,
  shouldServeMetrikaBridge,
} from '../src/lib/metrikaBridge.js';

test('renderMetrikaBridgeHtml embeds counter and soft goal', () => {
  const html = renderMetrikaBridgeHtml({
    counterId: 998877,
    redirectUrl: 'https://go.leadgid.ru/aff_c?x=1',
    softGoalName: 'soft_lead',
  });
  assert.match(html, /ym\(998877/);
  assert.match(html, /mc\.yandex\.ru\/metrika\/tag\.js/);
  assert.match(html, /reachGoal/);
  assert.match(html, /soft_lead/);
  assert.match(html, /go\.leadgid\.ru/);
});

test('shouldServeMetrikaBridge respects nometrika and ad-review', () => {
  const prev = process.env.YANDEX_METRIKA_COUNTER_ID;
  process.env.YANDEX_METRIKA_COUNTER_ID = '12345';
  try {
    assert.equal(shouldServeMetrikaBridge({ query: {} }), true);
    assert.equal(shouldServeMetrikaBridge({ query: { nometrika: '1' } }), false);
    assert.equal(shouldServeMetrikaBridge({ query: {} }, { isAdReview: true }), false);
  } finally {
    if (prev == null) delete process.env.YANDEX_METRIKA_COUNTER_ID;
    else process.env.YANDEX_METRIKA_COUNTER_ID = prev;
  }
});
