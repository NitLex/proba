import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadgidPostbackUrl,
  leadgidPostbackInstructions,
} from '../src/lib/leadgidPostback.js';

test('buildLeadgidPostbackUrl uses LeadGid macros', () => {
  const url = buildLeadgidPostbackUrl('https://trekerarbitrag.ru/');
  assert.equal(
    url,
    'https://trekerarbitrag.ru/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}',
  );
});

test('leadgidPostbackInstructions marks manual step', () => {
  const help = leadgidPostbackInstructions();
  assert.equal(help.manual, true);
  assert.equal(help.network, 'LeadGid');
  assert.match(help.url, /\/postback\?/);
  assert.match(help.where, /LeadGid/i);
});
