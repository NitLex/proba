import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('direct plan JSON is valid and within TextAd limits', () => {
  const planPath = path.join(root, 'direct/plans/rsya-kredit365-premium-travel-services.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(plan.network_only, true);
  assert.equal(plan.strategy.network, 'WB_MAXIMUM_CLICKS');
  assert.equal(plan.settings.neuro_ads, 'OFF');
  assert.ok(plan.href.includes('/click/9oXIbDTD'));
  assert.equal(plan.ad_groups.length, 3);
  for (const g of plan.ad_groups) {
    assert.ok(g.keywords.length >= 1);
    assert.ok(fs.existsSync(path.join(root, g.image)), g.image);
    for (const ad of g.ads) {
      assert.ok(ad.title.length <= 56, ad.title);
      assert.ok((ad.title2 || '').length <= 30, ad.title2);
      assert.ok(ad.text.length <= 81, ad.text);
    }
    for (const s of g.sitelinks) {
      assert.ok(s.title.length <= 30, s.title);
      assert.ok((s.description || '').length <= 60, s.description);
      assert.ok(!/если актуально/i.test(s.description || ''));
    }
  }
});

test('apply:direct --dry-run exits 0 without token', () => {
  const r = spawnSync(
    process.execPath,
    ['src/apply-direct-plan.js', '--dry-run'],
    {
      cwd: path.join(root, 'server'),
      encoding: 'utf8',
      env: { ...process.env, YANDEX_DIRECT_TOKEN: '', YANDEX_DIRECT_LOGIN: '' },
    },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /dryRun: true/);
  const latest = path.join(root, 'direct/apply-results/latest.json');
  assert.ok(fs.existsSync(latest));
  const result = JSON.parse(fs.readFileSync(latest, 'utf8'));
  assert.equal(result.dry_run, true);
  assert.equal(result.neuro_ads, 'OFF');
});
