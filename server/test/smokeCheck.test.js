import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripTrackingMacros,
  postbackLooksValid,
  checkClickRedirect,
  runSmokeSuite,
} from '../src/lib/smokeCheck.js';

test('stripTrackingMacros replaces placeholders', () => {
  const u = stripTrackingMacros(
    'https://trekerarbitrag.ru/click/ABC?utm_campaign={campaign_id}&x={ad_id}',
  );
  assert.match(u, /utm_campaign=test/);
  assert.doesNotMatch(u, /\{/);
});

test('postbackLooksValid accepts aff_sub template', () => {
  const ok = postbackLooksValid(
    'https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}',
  );
  assert.equal(ok.ok, true);
  assert.equal(postbackLooksValid('https://x/postback').ok, false);
});

test('checkClickRedirect treats PENDING as skipped warn', async () => {
  const r = await checkClickRedirect('https://trekerarbitrag.ru/click/PENDING', {
    label: 'click_browser',
  });
  assert.equal(r.skipped, true);
  assert.equal(r.severity, 'warn');
});

test('runSmokeSuite with mocked fetch passes bot + browser 302', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/postback')) {
      return new Response('ok', { status: 200 });
    }
    return new Response('redirect', {
      status: 302,
      headers: { Location: 'https://go.leadgid.ru/aff_c?offer_id=1' },
    });
  };
  try {
    const suite = await runSmokeSuite({
      clickUrl: 'https://trekerarbitrag.ru/click/AB12CD34?utm_campaign={campaign_id}',
      postbackUrl:
        'https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}',
      offerUrl: 'https://go.leadgid.ru/aff_c?offer_id=1&aff_sub={clickid}',
      directCampaignId: null,
    });
    assert.equal(suite.ok, true);
    assert.ok(suite.checks.find((c) => c.id === 'click_yandexbot')?.ok);
    assert.ok(suite.checks.find((c) => c.id === 'click_yadirectfetcher')?.ok);
    assert.ok(suite.checks.find((c) => c.id === 'offer_redirect')?.ok);
    assert.ok(suite.checks.find((c) => c.id === 'offer_aff_sub')?.ok);
  } finally {
    globalThis.fetch = real;
  }
});

test('runSmokeSuite fails when YandexBot gets 403', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, init = {}) => {
    const ua = init.headers?.['User-Agent'] || '';
    if (/YandexBot/i.test(ua)) {
      return new Response('Bot traffic blocked', { status: 403 });
    }
    return new Response('redirect', {
      status: 302,
      headers: { Location: 'https://go.leadgid.ru/x' },
    });
  };
  try {
    const suite = await runSmokeSuite({
      clickUrl: 'https://trekerarbitrag.ru/click/AB12CD34',
      postbackUrl:
        'https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}',
      offerUrl: 'https://go.leadgid.ru/x',
    });
    assert.equal(suite.ok, false);
    assert.ok(suite.checks.find((c) => c.id === 'click_yandexbot' && !c.ok));
  } finally {
    globalThis.fetch = real;
  }
});
