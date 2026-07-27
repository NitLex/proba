/**
 * Image generation for РСЯ creatives.
 *
 * Providers:
 *   - agent       → Cursor креатив-агент (GenerateImage + референсы). Default.
 *   - reference   → только загруженные референсы (без API)
 *   - yandex_art  → YandexART (legacy)
 *   - openai      → GPT Image API
 *   - replicate   → FLUX
 *   - auto        → agent (если нет явного API) / yandex_art если ключи и IMAGE_PROVIDER=auto legacy
 *   - none
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  yandexArtSceneHint,
  creativeBriefForVertical,
  yandexArtFallbackPrompts,
} from '../pipeline/knowledge/creative-handbook.js';

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
  const explicit = String(process.env.IMAGE_PROVIDER || 'agent').toLowerCase().trim();
  if (explicit && explicit !== 'auto') return explicit;
  // auto: prefer our Cursor creative agent (not YandexART / GPT)
  return 'agent';
}

export function imageGenConfig() {
  const provider = resolveImageProvider();
  const yc = yandexCloudKeys();
  const relay = String(process.env.OPENAI_RELAY_URL || '').replace(/\/$/, '');
  const proxy = process.env.OPENAI_HTTP_PROXY || process.env.HTTPS_PROXY || '';
  const configured =
    provider === 'agent' ||
    provider === 'reference' ||
    (provider === 'yandex_art' && yc.configured) ||
    (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY || relay)) ||
    (provider === 'replicate' && Boolean(process.env.REPLICATE_API_TOKEN));

  let model = null;
  if (provider === 'openai') model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  if (provider === 'yandex_art') model = process.env.YANDEX_ART_MODEL || 'yandex-art/latest';
  if (provider === 'agent') model = 'cursor-agent';

  let note = 'Не настроено';
  if (configured) {
    if (provider === 'agent') {
      note = 'Креатив-агент Cursor (GenerateImage + референсы) — без YandexART/GPT';
    } else if (provider === 'reference') {
      note = 'Только загруженные референсы';
    } else if (provider === 'yandex_art') note = `YandexART · ${model}`;
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

function productLabel(offer, verticalKey) {
  if (verticalKey === 'marketplace_rental') return offer?.name || 'маркетплейс витрина';
  if (verticalKey === 'fintech_loans') return offer?.name || 'онлайн-займ';
  if (verticalKey === 'nutra') return offer?.name || 'продукт';
  return offer?.name || 'цифровая карта';
}

/**
 * Scroll-stopping РСЯ visual prompt (OpenAI / long-form).
 * format=graphic → text ON the image (offer data)
 * format=product → clean product/lifestyle photo, NO text (copy in Direct fields)
 */
export function buildCreativePrompt({
  angle,
  offer,
  size = '1024x1024',
  format = 'product',
  overlayLines = [],
  verticalKey = '',
} = {}) {
  const name = productLabel(offer, verticalKey);
  const brief = creativeBriefForVertical(verticalKey);
  const angleScenes = {
    travel: [
      'Hero scene: matte navy payment card resting on open burgundy passport + boarding pass on a hard-shell suitcase,',
      'airport lounge window bokeh with sunrise sky, sense of departure and freedom,',
      'one sharp focal card, shallow depth of field, warm-cool contrast (gold chip vs cool blue ambient).',
    ].join(' '),
    services: [
      'Hero scene: sleek black card beside a modern smartphone showing only abstract colorful app-icon blur (no readable UI text),',
      'desk lifestyle of online subscriptions — soft mint/charcoal palette, clean reflections,',
      'thumb-stopping center composition, premium fintech product photography.',
    ].join(' '),
    premium: [
      'Hero scene: dark navy-and-gold card on black marble with soft caustic light streaks,',
      'luxury but trustworthy mood, specular highlights on chip, shallow bokeh,',
      'editorial product still-life, high contrast silhouette.',
    ].join(' '),
    sbp: [
      'Hero scene: card and abstract mint light-wave motion suggesting instant ruble top-up,',
      'clean charcoal background, dynamic diagonal energy without clutter,',
      'fast-payment vibe, crisp edges, modern commercial look.',
    ].join(' '),
    rent: [
      'Hero scene: modern marketplace storefront shelf with product cards on a clean laptop screen,',
      'e-commerce rental vibe, soft daylight office, growth without clutter.',
    ].join(' '),
    shop: [
      'Hero scene: online shopfront / marketplace stall ready to sell, boxes and clean UI mock without logos,',
      'commercial e-com photography, bright confident light.',
    ].join(' '),
    sales: [
      'Hero scene: marketplace dashboard with rising sales chart blur (no readable text), product tiles,',
      'business growth mood, clean desk setup.',
    ].join(' '),
    speed: [
      'Hero scene: phone in hand with abstract application UI blur, fast everyday light, no luxury bank lobby.',
    ].join(' '),
    passport: [
      'Hero scene: passport booklet and phone on a simple table, calm trustworthy mood.',
    ].join(' '),
    amount: [
      'Hero scene: card and soft cash hint without readable denominations, simple online payout mood.',
    ].join(' '),
    generic: [
      'Hero scene: single dominant product subject, soft gradient atmosphere,',
      'premium commercial still-life, strong focal contrast.',
    ].join(' '),
  };
  const scene = angleScenes[angle?.id] || angleScenes.generic;

  const base = [
    `Award-style photoreal key visual for Russian Yandex Direct РСЯ feed ads, square ${size}.`,
    `Must stop the scroll in 0.5s: bold subject, emotional desire, clear story — not a flat stock template.`,
    `Product/offer: "${name}". Angle: ${angle?.title || angle?.id || 'main'}. Vertical brief: ${brief.visual}`,
    scene,
    'Cinematic lighting, tactile materials, micro-contrast, magazine ad quality.',
    'Composition: subject occupies ~55-70% of frame, negative space for balance, no cluttered collage.',
    'Strict bans: no Visa/Mastercard/Apple Pay/Google Pay/Booking/bank logos, no real brand UI, no faces close-up, no watermarks, no QR codes with readable data.',
  ];

  if (format === 'graphic') {
    const lines = (overlayLines || []).filter(Boolean).slice(0, 3);
    base.push(
      'GRAPHIC AD: large sharp Cyrillic marketing text ON the image as the hook headline.',
      lines.length
        ? `Exact text lines (perfect Cyrillic, high contrast, no typos): ${lines.map((l) => `"${l}"`).join(' | ')}`
        : 'Short punchy Russian headline + one benefit line on the image.',
      'Typography: bold modern sans, huge readable at mobile size, max 3 lines, no fake logos.',
    );
  } else {
    base.push(
      'PRODUCT / lifestyle AD: ZERO text, ZERO letters, ZERO numbers, ZERO captions, ZERO UI labels on the image.',
      'If a card is shown, face must be blank (no embossed numbers/names). Desire from scene and light only — ad copy is separate.',
    );
  }

  return base.join(' ');
}

/** YandexART has a hard ~500 char prompt limit — short Russian scene + bans. */
export function buildCreativePromptForProvider(provider, args) {
  const full = buildCreativePrompt(args);
  if (provider !== 'yandex_art') return full;

  const { angle, offer, format = 'product', overlayLines = [], verticalKey = '' } = args || {};
  const name = String(productLabel(offer, verticalKey)).slice(0, 36);
  const scene = yandexArtSceneHint(verticalKey, angle?.id);
  const angleTitle = angle?.title || angle?.id || 'main';
  if (format === 'graphic') {
    const lines = (overlayLines || []).filter(Boolean).slice(0, 2).join(' / ');
    return [
      `Цепляющий баннер 1:1 «${name}», ${angleTitle}: ${scene}.`,
      lines ? `Крупный чёткий русский текст: ${lines}.` : 'Короткий цепляющий русский заголовок.',
      'Без логотипов банков/Visa/Apple Pay/маркетплейсов, без лиц крупно.',
    ]
      .join(' ')
      .slice(0, 500);
  }
  return [
    `Цепляющее фото 1:1 «${name}»: ${scene}.`,
    'БЕЗ текста, букв и цифр на фото. Крупный объект 55–70% кадра, кинематографичный свет.',
    'Без логотипов Visa, Mastercard, Apple Pay, банков, WB/Ozon.',
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

function isYandexArtRefusal(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('не могу сгенерировать') ||
    msg.includes('другую тему') ||
    msg.includes('cannot generate') ||
    msg.includes('try a different')
  );
}

function isTransientImageError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    isYandexArtRefusal(err) ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('503') ||
    msg.includes('429')
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
  verticalKey = '',
} = {}) {
  const cfg = imageGenConfig();
  const promptArgs = { angle, offer, format, overlayLines, verticalKey };
  const prompt = buildCreativePromptForProvider(cfg.provider, promptArgs);
  const dir = path.join(outRoot, String(runId));
  ensureDir(dir);
  const dest = path.join(dir, `${safeName(angle?.id || 'angle')}-${format}-${index}.png`);
  const retries = Math.max(0, Number(process.env.IMAGE_GEN_RETRIES || 1));

  if (cfg.provider === 'none') {
    return {
      ok: false,
      skipped: true,
      provider: 'none',
      angle_id: angle?.id || null,
      format,
      image_has_text: format === 'graphic',
      prompt,
      reason: 'Нет провайдера картинок',
    };
  }

  // Agent / reference: no remote API — Cursor creative agent or uploaded refs produce files.
  if (cfg.provider === 'agent' || cfg.provider === 'reference') {
    return {
      ok: false,
      pending_agent: cfg.provider === 'agent',
      skipped: true,
      provider: cfg.provider,
      angle_id: angle?.id || null,
      format,
      image_has_text: format === 'graphic',
      prompt,
      reason:
        cfg.provider === 'agent'
          ? 'Картинку рисует креатив-агент Cursor (GenerateImage) по брифу и референсам'
          : 'Ожидаются загруженные референсы',
    };
  }

  try {
    let result;
    let lastErr;
    const fallbacks =
      cfg.provider === 'yandex_art'
        ? yandexArtFallbackPrompts({ verticalKey, angle, offer })
        : [];
    // Main prompt + safe YandexART fallbacks (refusals are flaky)
    const queue = [prompt, ...fallbacks].filter(Boolean);
    const maxAttempts = Math.max(queue.length, retries + 1);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const attemptPrompt = (queue[attempt] || `${prompt} Вариация ${attempt + 1}.`).slice(0, 500);
      try {
        result = await generateWithProvider(cfg.provider, attemptPrompt, dest);
        if (attempt > 0) {
          result = { ...result, prompt_used: attemptPrompt, retry_attempt: attempt };
        }
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
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
          lastErr = null;
          break;
        }
        if (cfg.provider === 'openai' && isGeoBlockedError(err)) {
          throw new Error(
            `${err.message}. С RU VPS задай OPENAI_RELAY_URL или OPENAI_HTTP_PROXY, либо IMAGE_PROVIDER=yandex_art.`,
          );
        }
        if (attempt >= maxAttempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    if (lastErr) throw lastErr;

    const absPath = result.path || dest;
    const rel = path.relative(path.resolve(__dirname, '../../..'), absPath);
    return {
      ok: true,
      prompt,
      ...result,
      path: rel,
      angle_id: angle?.id || null,
      format,
      image_has_text: format === 'graphic',
    };
  } catch (err) {
    return {
      ok: false,
      provider: cfg.provider,
      angle_id: angle?.id || null,
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
  verticalKey = '',
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
        verticalKey,
      }),
    );
  }
  return out;
}
