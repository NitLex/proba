import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectJson, stringifyDirectBody } from '../src/lib/directApi.js';

test('parseDirectJson keeps oversized Ids as strings', () => {
  const raw = '{"result":{"Ads":[{"Id":1916649569823117910,"AdGroupId":5776832673}]}}';
  const data = parseDirectJson(raw);
  assert.equal(data.result.Ads[0].Id, '1916649569823117910');
  assert.equal(data.result.Ads[0].AdGroupId, 5776832673);
});

test('stringifyDirectBody emits raw integers for Id fields', () => {
  const json = stringifyDirectBody({
    method: 'update',
    params: { Ads: [{ Id: '1916649569823117910', TextAd: { AdImageHash: 'abc' } }] },
  });
  assert.match(json, /"Id":1916649569823117910/);
  assert.doesNotMatch(json, /"Id":"1916649569823117910"/);
});
