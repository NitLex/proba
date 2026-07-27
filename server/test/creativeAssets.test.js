import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  saveReferenceBatch,
  materializeReferencesForRun,
  referencesAsGeneratedImages,
  attachCreativesToRun,
  createIngestToken,
  verifyIngestToken,
  mergeGeneratedImages,
} from '../src/lib/creativeAssets.js';

// 1x1 png
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('saveReferenceBatch writes files and materializes into run', () => {
  const batch = saveReferenceBatch([
    { name: 'ref-a.png', mime: 'image/png', data_base64: PNG_B64, angle_id: 'rent' },
    { name: 'ref-b.png', mime: 'image/png', data_base64: PNG_B64 },
  ]);
  assert.ok(batch.batch_id);
  assert.equal(batch.files.length, 2);

  const runId = `test-ref-${Date.now()}`;
  const refs = materializeReferencesForRun(runId, batch.batch_id);
  assert.equal(refs.length, 2);
  assert.ok(fs.existsSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..', refs[0].path)));

  const asImages = referencesAsGeneratedImages(refs, [{ id: 'rent' }, { id: 'shop' }]);
  assert.equal(asImages.length, 2);
  assert.equal(asImages[0].provider, 'reference');
  assert.equal(asImages[0].ok, true);
  assert.equal(asImages[0].angle_id, 'rent');
});

test('ingest token verifies', () => {
  const { token, hash } = createIngestToken();
  assert.equal(verifyIngestToken(token, hash), true);
  assert.equal(verifyIngestToken('nope', hash), false);
});

test('attachCreativesToRun + merge prefers agent over reference', () => {
  const runId = `test-attach-${Date.now()}`;
  const attached = attachCreativesToRun(runId, [
    { angle_id: 'rent', mime: 'image/png', data_base64: PNG_B64 },
  ]);
  assert.equal(attached.generated_images[0].provider, 'agent');
  const merged = mergeGeneratedImages(
    [{ ok: true, provider: 'reference', angle_id: 'rent', path: 'creatives/pipeline/x/ref.png' }],
    attached.generated_images,
  );
  assert.ok(merged.some((g) => g.provider === 'agent'));
  assert.equal(merged.filter((g) => g.angle_id === 'rent').length >= 1, true);
});
