import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('imageGenConfig auto/agent prefers Cursor creative agent', async () => {
  const prev = {
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    YANDEX_CLOUD_API_KEY: process.env.YANDEX_CLOUD_API_KEY,
    YANDEX_CLOUD_FOLDER_ID: process.env.YANDEX_CLOUD_FOLDER_ID,
  };
  process.env.IMAGE_PROVIDER = 'agent';
  delete process.env.OPENAI_API_KEY;
  process.env.YANDEX_CLOUD_API_KEY = 'test-key';
  process.env.YANDEX_CLOUD_FOLDER_ID = 'folder1';
  const { imageGenConfig, resolveImageProvider } = await import(`../src/lib/imageGen.js?t=${Date.now()}`);
  assert.equal(resolveImageProvider(), 'agent');
  const cfg = imageGenConfig();
  assert.equal(cfg.configured, true);
  assert.equal(cfg.provider, 'agent');
  assert.match(cfg.note, /Cursor|агент|GenerateImage/i);
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('generateCreativeImage writes b64 from GPT Image API mock', async () => {
  const prev = {
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_RELAY_URL: process.env.OPENAI_RELAY_URL,
    OPENAI_ALLOW_YANDEX_FALLBACK: process.env.OPENAI_ALLOW_YANDEX_FALLBACK,
  };
  process.env.IMAGE_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.OPENAI_IMAGE_MODEL = 'gpt-image-1';
  delete process.env.OPENAI_RELAY_URL;
  delete process.env.OPENAI_ALLOW_YANDEX_FALLBACK;

  const pngOk =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ b64_json: pngOk }] }),
  });

  try {
    const { generateCreativeImage } = await import(`../src/lib/imageGen.js?t=${Date.now()}`);
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
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('openai geo-block does not silently fall back to YandexART', async () => {
  const prev = {
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_RELAY_URL: process.env.OPENAI_RELAY_URL,
    OPENAI_ALLOW_YANDEX_FALLBACK: process.env.OPENAI_ALLOW_YANDEX_FALLBACK,
    YANDEX_CLOUD_API_KEY: process.env.YANDEX_CLOUD_API_KEY,
    YANDEX_CLOUD_FOLDER_ID: process.env.YANDEX_CLOUD_FOLDER_ID,
  };
  process.env.IMAGE_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'sk-test';
  delete process.env.OPENAI_RELAY_URL;
  delete process.env.OPENAI_ALLOW_YANDEX_FALLBACK;
  process.env.YANDEX_CLOUD_API_KEY = 'ya-key';
  process.env.YANDEX_CLOUD_FOLDER_ID = 'folder';

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({
      error: { message: 'Country, region, or territory not supported' },
    }),
  });

  try {
    const { generateCreativeImage } = await import(`../src/lib/imageGen.js?geo=${Date.now()}`);
    const result = await generateCreativeImage({
      angle: { id: 'travel', title: 'Поездки' },
      offer: { name: 'Тест' },
      runId: `geo-${Date.now()}`,
      index: 0,
    });
    assert.equal(result.ok, false);
    assert.equal(result.provider, 'openai');
    assert.match(String(result.error || ''), /OPENAI_RELAY_URL|OPENAI_HTTP_PROXY|territory/i);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
