/**
 * Image generation for РСЯ creatives.
 *
 * Providers:
 *   - yandex_art  → YandexART (работает с RU VPS; YANDEX_CLOUD_API_KEY + FOLDER_ID)
 *   - openai      → GPT Image API (нужен OPENAI_RELAY_URL / OPENAI_HTTP_PROXY / не-RU IP)
 *   - replicate   → FLUX
 *   - auto        → yandex_art если есть cloud-ключи, иначе openai
 *   - none
 *
 * Fallback: при IMAGE_PROVIDER=openai geo-ошибка → YandexART только если
 * OPENAI_ALLOW_YANDEX_FALLBACK=1. Иначе ошибка явно (не подменяем на «иероглифы»).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(__dirname, '../../../creatives/pipeline');

function yandexCloudKeys() {
  const apiKey =
    process.env.YANDEX_CLOUD_API_KEY ||
    process.env.WORDSTAT_API_KEY ||
    process.env.YANDEX_ART_API_KEY ||
    '';
  const folderId =
    process.env.YANDEX_CLOUD_FOLDER_ID ||
    process.env.WORDSTAT_FOLDER_ID ||
    process.env.YANDEX_ART_FOLDER_ID ||
    '';
  return { apiKey, folderId, configured: Boolean(apiKey && folderId) };
}

export function resolveImageProvider() {
  const explicit = String(process.env.IMAGE_PROVIDER || 'auto').toLowerCase().trim();
  if (explicit && explicit !== 'auto') return explicit;
  // auto: prefer YandexART on RU (no geo block), else OpenAI
  if (yandexCloudKeys().configured) return 'yandex_art';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

export function imageGenConfig() {
  const provider = resolveImageProvider();
  const yc = yandexCloudKeys();
  const relay = String(process.env.OPENAI_RELAY_URL || '').replace(/\/$/, '');
  const proxy = process.env.OPENAI_HTTP_PROXY || process.env.HTTPS_PROXY || '';
  const configured =
    (provider === 'yandex_art' && yc.configured) ||
    (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY || relay)) ||
    (provider === 'replicate' && Boolean(process.env.REPLICATE_API_TOKEN));

  let model = null;
  if (provider === 'openai') model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  if (provider === 'yandex_art') model = process.env.YANDEX_ART_MODEL || 'yandex-art/latest';

  let note = 'Не настроено — задай YANDEX_CLOUD_* (YandexART) или OPENAI_API_KEY';
  if (configured) {
    if (provider === 'yandex_art') note = `YandexART · ${model}`;
    else if (provider === 'openai') {
      if (relay) note = `GPT Image API · ${model} · через OPENAI_RELAY_URL`;
      else if (proxy) note = `GPT Image API · ${model} · через proxy`;
      else {
        note = `GPT Image API · ${model} (с RU VPS нужен OPENAI_RELAY_URL или OPENAI_HTTP_PROXY)`;
      }
    } else note = `Live · ${provider}`;
  }

  return {
    provider: configured ? provider : 'none',
    configured,
    model,
    proxy: Boolean(proxy),
    relay: Boolean(relay),
    yandex_art_ready: yc.configured,
    allow_yandex_fallback: String(process.env.OPENAI_ALLOW_YANDEX_FALLBACK || '') === '1',
    note,
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(s) {
  return String(s || 'img')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 48);
}

/**
 * Strong РСЯ-safe visual prompt.
 * format=graphic → text ON the image (offer data)
 * format=product → clean product photo, NO text (copy goes into Direct ad fields)
 */
export function buildCreativePrompt({
  angle,
  offer,
  size = '1024x1024',
  format = 'product',
  overlayLines = [],
} = {}) {
  const name = offer?.name || 'цифровая карта';
  const angleHint =
    {
      travel:
        'travel mood, passport and boarding pass abstract shapes, soft blue sky gradient, suitcase silhouette',
      services:
        'modern app subscriptions mood, soft neon accents, abstract phone screen glow, clean fintech UI shapes',
      premium: 'premium dark navy and gold accents, elegant card silhouette, soft bokeh lights',
      sbp: 'fast payment mood, abstract QR and wave lines, clean mint and charcoal palette',
      generic: 'clean fintech product mood, abstract digital card, soft gradient light',
    }[angle?.id] || 'clean fintech product mood';

  const base = [
    `Photoreal advertising key visual for Russian Yandex Direct display ads, square ${size}.`,
    `Product: digital payment card "${name}". Angle: ${angle?.title || angle?.id || 'main'}.`,
    angleHint,
    'Cinematic lighting, premium but trustworthy, high contrast focal subject.',
    'No logos of Apple Pay, Google Pay, Booking, Visa, Mastercard, banks. No people faces close-up.',
    'No watermarks. Commercial stock quality.',
  ];

  if (format === 'graphic') {
    const lines = (overlayLines || []).filter(Boolean).slice(0, 3);
    base.push(
      'GRAPHIC AD banner: include large clear Russian marketing text ON the image.',
      lines.length
        ? `Exact text lines to render (Cyrillic, high contrast, readable): ${lines.map((l) => `"${l}"`).join(' | ')}`
        : 'Include short Russian headline and promo benefit on the image.',
      'Typography must be sharp and legible at 1080px. Do not invent extra brand names.',
    );
  } else {
    base.push(
      'PRODUCT AD photo: pure lifestyle/product image with ZERO text, ZERO letters, ZERO numbers, ZERO watermarks, ZERO UI captions.',
      'Leave composition clean — all ad copy will be set separately in Yandex Direct fields.',
    );
  }

  return base.join(' ');
}

/** YandexART has a hard ~500 char prompt limit. */
export function buildCreativePromptForProvider(provider, args) {
  const full = buildCreativePrompt(args);
  if (provider !== 'yandex_art') return full;

  const { angle, offer, format = 'product', overlayLines = [] } = args || {};
  const name = String(offer?.name || 'цифровая карта').slice(0, 40);
  const angleTitle = angle?.title || angle?.id || 'main';
  if (format === 'graphic') {
    const lines = (overlayLines || []).filter(Boolean).slice(0, 2).join(' / ');
    return [
      `Рекламный баннер 1:1, финтех карта «${name}», угол ${angleTitle}.`,
      lines ? `Крупный читаемый русский текст на баннере: ${lines}.` : 'Короткий русский заголовок на баннере.',
      'Премиальный стиль, без логотипов банков и платёжных систем, без лиц крупным планом.',
    ]
      .join(' ')
      .slice(0, 500);
  }
  return [
    `Предметное фото 1:1 цифровой платёжной карты «${name}», угол ${angleTitle}.`,
    'Чистая картинка БЕЗ текста, букв и цифр. Коммерческий стиль, мягкий свет.',
    'Без логотипов Apple Pay, Google Pay, Visa, Mastercard, банков.',
  ]
    .join(' ')
    .slice(0, 500);
}

async function downloadToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

function writeBase64Image(b64, dest) {
  const raw = String(b64).replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(dest, Buffer.from(raw, 'base64'));
  return dest;
}

function isGeoBlockedError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('country') ||
    msg.includes('region') ||
    msg.includes('territory not supported') ||
    msg.includes('not available in your country')
  );
}

/** Optional proxy for OpenAI (EU/US HTTP(S) proxy). Uses undici if present. */
async function openaiFetch(url, init) {
  const proxy = process.env.OPENAI_HTTP_PROXY || process.env.HTTPS_PROXY || '';
  if (!proxy) return fetch(url, init);
  try {
    const undici = await import('undici');
    const agent = new undici.ProxyAgent(proxy);
    return undici.fetch(url, { ...init, dispatcher: agent });
  } catch (err) {
    throw new Error(
      `OPENAI_HTTP_PROXY задан, но undici proxy недоступен: ${err.message}. Поставь undici или OPENAI_RELAY_URL`,
    );
  }
}

/**
 * GPT Image API — с RU VPS: OPENAI_RELAY_URL (предпочтительно) или OPENAI_HTTP_PROXY.
 */
async function genOpenAI(prompt, dest) {
  const relay = String(process.env.OPENAI_RELAY_URL || '').replace(/\/$/, '');
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'medium';
  const size = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
  const isGptImage = /^gpt-image/i.test(model);

  if (!relay && !key) throw new Error('openai: нужен OPENAI_API_KEY или OPENAI_RELAY_URL');

  const body = {
    model,
    prompt: prompt.slice(0, 3900),
    n: 1,
    size,
  };

  if (isGptImage) body.quality = quality;
  else body.response_format = 'b64_json';

  const endpoint = relay
    ? `${relay}/v1/images/generations`
    : 'https://api.openai.com/v1/images/generations';

  const headers = { 'Content-Type': 'application/json' };
  if (relay) {
    const secret = process.env.OPENAI_RELAY_SECRET || key || '';
    if (secret) headers.Authorization = `Bearer ${secret}`;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }

  const res = await openaiFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `openai ${res.status}`);

  const item = data?.data?.[0];
  if (!item) throw new Error('openai: empty image data');

  if (item.b64_json) {
    writeBase64Image(item.b64_json, dest);
    return {
      provider: 'openai',
      model,
      path: dest,
      format: 'b64_json',
      via: relay ? 'relay' : 'direct',
    };
  }
  if (item.url) {
    await downloadToFile(item.url, dest);
    return {
      provider: 'openai',
      model,
      path: dest,
      url: item.url,
      format: 'url',
      via: relay ? 'relay' : 'direct',
    };
  }
  throw new Error('openai: no b64_json or url in response');
}

/**
 * YandexART — работает с российского VPS на тех же ключах, что Wordstat.
 * Docs: foundationModels/v1/imageGenerationAsync
 */
async function genYandexArt(prompt, dest) {
  const { apiKey, folderId, configured } = yandexCloudKeys();
  if (!configured) throw new Error('YandexART: нужен YANDEX_CLOUD_API_KEY + YANDEX_CLOUD_FOLDER_ID');

  const modelName = process.env.YANDEX_ART_MODEL || 'yandex-art/latest';
  const modelUri = modelName.startsWith('art://')
    ? modelName
    : `art://${folderId}/${modelName.replace(/^\/+/, '')}`;

  const create = await fetch(
    'https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync',
    {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelUri,
        generationOptions: {
          seed: String(Date.now() % 1_000_000_000),
          aspectRatio: { widthRatio: '1', heightRatio: '1' },
        },
        messages: [{ weight: '1', text: prompt.slice(0, 500) }],
      }),
    },
  );
  const created = await create.json();
  if (!create.ok) {
    throw new Error(created?.message || created?.error || `yandex_art ${create.status}`);
  }
  const opId = created.id;
  if (!opId) throw new Error('yandex_art: no operation id');

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(`https://operation.api.cloud.yandex.net/operations/${opId}`, {
      headers: { Authorization: `Api-Key ${apiKey}` },
    });
    const op = await poll.json();
    if (op.error) throw new Error(op.error.message || JSON.stringify(op.error));
    if (op.done) {
      const b64 = op.response?.image;
      if (!b64) throw new Error('yandex_art: empty image in operation response');
      // YandexART returns JPEG base64
      const jpegDest = dest.replace(/\.png$/i, '.jpg');
      writeBase64Image(b64, jpegDest);
      return { provider: 'yandex_art', model: modelUri, path: jpegDest, format: 'b64_json', operation_id: opId };
    }
  }
  throw new Error('yandex_art: timeout waiting for image');
}

async function genReplicate(prompt, dest) {
  const token = process.env.REPLICATE_API_TOKEN;
  const model = process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-schnell';
  const create = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: prompt.slice(0, 3900),
        aspect_ratio: '1:1',
        output_format: 'jpg',
      },
    }),
  });
  const data = await create.json();
  if (!create.ok) throw new Error(data?.detail || data?.error || `replicate ${create.status}`);
  const out = data.output;
  const url = Array.isArray(out) ? out[0] : out;
  if (!url) throw new Error('replicate: empty output');
  await downloadToFile(url, dest);
  return { provider: 'replicate', path: dest, url };
}

async function generateWithProvider(provider, prompt, dest) {
  if (provider === 'yandex_art') return genYandexArt(prompt, dest);
  if (provider === 'openai') return genOpenAI(prompt, dest);
  if (provider === 'replicate') return genReplicate(prompt, dest);
  throw new Error(`Unknown IMAGE_PROVIDER ${provider}`);
}

/**
 * Generate one square creative image. Returns { ok, prompt, path?, error?, provider }
 */
export async function generateCreativeImage({
  angle,
  offer,
  runId = 'tmp',
  index = 0,
  format = 'product',
  overlayLines = [],
} = {}) {
  const cfg = imageGenConfig();
  const promptArgs = { angle, offer, format, overlayLines };
  const prompt = buildCreativePromptForProvider(cfg.provider, promptArgs);
  const dir = path.join(outRoot, String(runId));
  ensureDir(dir);
  const dest = path.join(dir, `${safeName(angle?.id || 'angle')}-${format}-${index}.png`);

  if (cfg.provider === 'none') {
    return {
      ok: false,
      skipped: true,
      provider: 'none',
      format,
      image_has_text: format === 'graphic',
      prompt,
      reason: 'Нет YandexART / OPENAI_API_KEY',
    };
  }

  try {
    let result;
    try {
      result = await generateWithProvider(cfg.provider, prompt, dest);
    } catch (err) {
      // OpenAI geo-block → YandexART only when explicitly allowed
      const allowFallback = String(process.env.OPENAI_ALLOW_YANDEX_FALLBACK || '') === '1';
      if (
        allowFallback &&
        cfg.provider === 'openai' &&
        isGeoBlockedError(err) &&
        yandexCloudKeys().configured
      ) {
        const yaPrompt = buildCreativePromptForProvider('yandex_art', promptArgs);
        result = await genYandexArt(yaPrompt, dest);
        result = {
          ...result,
          fallback_from: 'openai',
          fallback_reason: err.message,
          prompt_used: yaPrompt,
        };
      } else if (cfg.provider === 'openai' && isGeoBlockedError(err)) {
        throw new Error(
          `${err.message}. С RU VPS задай OPENAI_RELAY_URL (scripts/openai-image-relay-server.mjs) или OPENAI_HTTP_PROXY. Тихий откат на YandexART отключён — включи OPENAI_ALLOW_YANDEX_FALLBACK=1 если нужен.`,
        );
      } else {
        throw err;
      }
    }

    const absPath = result.path || dest;
    const rel = path.relative(path.resolve(__dirname, '../../..'), absPath);
    return {
      ok: true,
      prompt,
      ...result,
      path: rel,
      format,
      image_has_text: format === 'graphic',
    };
  } catch (err) {
    return {
      ok: false,
      provider: cfg.provider,
      format,
      image_has_text: format === 'graphic',
      prompt,
      error: err.message || String(err),
    };
  }
}

export async function generateAngleImages({
  angles,
  offer,
  runId,
  limit = 2,
  format = 'product',
  overlaysByAngle = {},
} = {}) {
  const list = (angles || []).slice(0, limit);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const angle = list[i];
    out.push(
      await generateCreativeImage({
        angle,
        offer,
        runId,
        index: i,
        format,
        overlayLines: overlaysByAngle[angle.id] || [],
      }),
    );
  }
  return out;
}
