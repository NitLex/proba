import test from 'node:test';
import assert from 'node:assert/strict';
import { runCreative } from '../src/pipeline/agents/creative.js';

test('runCreative defaults to product TextAd with travel/services/sbp', async () => {
  const result = await runCreative({
    offer: { name: 'Плати по миру - Выпуск карты' },
    context: {
      playbook: {
        promo_codes: [{ code: 'LG2026', note: '−500 ₽ (если актуально)' }],
      },
    },
  });

  assert.equal(result.creatives.ad_format, 'product');
  assert.equal(result.creatives.image_has_text, false);
  assert.equal(result.creatives.briefs.length, 3);

  const ids = result.creatives.briefs.map((b) => b.angle_id);
  assert.deepEqual(ids, ['travel', 'services', 'sbp']);

  for (const brief of result.creatives.briefs) {
    assert.equal(brief.direct_ad_type, 'TextAd');
    assert.equal(brief.image_has_text, false);
    assert.deepEqual(brief.overlay_lines, []);
    assert.ok(brief.titles.length >= 2);
    assert.ok(brief.texts.length >= 1);
    assert.ok(brief.texts.some((t) => t.includes('LG2026')));
    assert.ok(brief.forbidden.includes('бренды Apple Pay / Google Pay / Booking'));
  }

  assert.match(result.creatives.generator_hint, /generate_product_textad/);
});

test('runCreative graphic format enables overlays', async () => {
  const result = await runCreative({
    offer: { name: 'Плати по миру' },
    context: {
      ad_format: 'graphic',
      playbook: { angles: [{ id: 'travel', title: 'Travel' }], promo_codes: [{ code: 'LG2026' }] },
    },
  });
  assert.equal(result.creatives.ad_format, 'graphic');
  assert.equal(result.creatives.image_has_text, true);
  assert.equal(result.creatives.briefs[0].direct_ad_type, 'ImageAd');
  assert.ok(result.creatives.briefs[0].overlay_lines.length >= 1);
});
