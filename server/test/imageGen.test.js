import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('imageGenConfig prefers GPT Image when OPENAI_API_KEY set', async () => {
  const prevProvider = process.env.IMAGE_PROVIDER;
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.IMAGE_PROVIDER;
  process.env.OPENAI_API_KEY = 'sk-test';
  const { imageGenConfig, resolveImageProvider } = await import('../src/lib/imageGen.js');
  assert.equal(resolveImageProvider(), 'openai');
  const cfg = imageGenConfig();
  assert.equal(cfg.configured, true);
  assert.equal(cfg.provider, 'openai');
  assert.match(cfg.note, /GPT Image/);
  if (prevProvider === undefined) delete process.env.IMAGE_PROVIDER;
  else process.env.IMAGE_PROVIDER = prevProvider;
  if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prevKey;
});

test('generateCreativeImage writes b64 from GPT Image API mock', async () => {
  const prevProvider = process.env.IMAGE_PROVIDER;
  const prevKey = process.env.OPENAI_API_KEY;
  const prevModel = process.env.OPENAI_IMAGE_MODEL;
  process.env.IMAGE_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.OPENAI_IMAGE_MODEL = 'gpt-image-1';

  // 1x1 PNG
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: pngB64 }] }),
  });

  try {
    const { generateCreativeImage } = await import('../src/lib/imageGen.js');
    const runId = `test-${Date.now()}`;
    const result = await generateCreativeImage({
      angle: { id: 'travel', title: 'Поездки' },
      offer: { name: 'Тест карта' },
      runId,
      index: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'openai');
    assert.equal(result.model, 'gpt-image-1');
    const abs = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..', result.path);
    assert.ok(fs.existsSync(abs), `missing ${abs}`);
    assert.ok(fs.statSync(abs).size > 20);
    fs.rmSync(path.dirname(abs), { recursive: true, force: true });
  } finally {
    globalThis.fetch = realFetch;
    if (prevProvider === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = prevProvider;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.OPENAI_IMAGE_MODEL;
    else process.env.OPENAI_IMAGE_MODEL = prevModel;
  }
});
