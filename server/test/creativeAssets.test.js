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
  mergeIngestMeta,
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

test('verifyIngestToken accepts historical hashes list', () => {
  const a = createIngestToken();
  const b = createIngestToken();
  const meta = mergeIngestMeta(
    { token: a.token, hash: a.hash, hashes: [a.hash] },
    b,
    { url: 'https://orkestr.online/api/pipeline/ingest-creatives', runId: 2 },
  );
  assert.equal(verifyIngestToken(a.token, meta.hashes), true);
  assert.equal(verifyIngestToken(b.token, meta.hashes), true);
  assert.equal(verifyIngestToken('nope', meta.hashes), false);
});

test('mergeIngestMeta reuses token while awaiting images', () => {
  const first = createIngestToken();
  const reused = mergeIngestMeta(
    { token: first.token, hash: first.hash, hashes: [first.hash] },
    { token: first.token, hash: first.hash, reused: true },
    { runId: 2 },
  );
  assert.equal(reused.token, first.token);
  assert.equal(reused.hash, first.hash);
  assert.equal(reused.hashes.length, 1);
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
