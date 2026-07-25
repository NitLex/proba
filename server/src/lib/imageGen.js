/**
 * Image generation for РСЯ creatives.
 * Primary: GPT Image API (OpenAI) — IMAGE_PROVIDER=openai + OPENAI_API_KEY
 * Optional fallbacks: replicate | useapi_mj | none
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(__dirname, '../../../creatives/pipeline');

export function resolveImageProvider() {
  const explicit = String(process.env.IMAGE_PROVIDER || '').toLowerCase().trim();
  if (explicit) return explicit;
  // Default: GPT Image API when key is present
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

export function imageGenConfig() {
  const provider = resolveImageProvider();
  const configured =
    (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY)) ||
    (provider === 'replicate' && Boolean(process.env.REPLICATE_API_TOKEN)) ||
    (provider === 'useapi_mj' && Boolean(process.env.USEAPI_TOKEN));
  const model =
    provider === 'openai'
      ? process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
      : null;
  return {
    provider: configured ? provider : 'none',
    configured,
    model,
    note: configured
      ? provider === 'openai'
        ? `GPT Image API · ${model}`
        : `Live · ${provider}`
      : 'Не настроено — задай OPENAI_API_KEY (GPT Image API)',
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

/** Strong РСЯ-safe visual prompt (no brands, no payment logos). */
export function buildCreativePrompt({ angle, offer, size = '1024x1024' }) {
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

  return [
    `Photoreal advertising key visual for Russian display ads, square ${size}.`,
    `Product: digital payment card "${name}". Angle: ${angle?.title || angle?.id || 'main'}.`,
    angleHint,
    'Cinematic lighting, premium but trustworthy, high contrast focal subject, empty safe text area on the right.',
    'No logos of Apple Pay, Google Pay, Booking, Visa, Mastercard, banks. No readable small text. No people faces close-up.',
    'No watermarks. Commercial stock quality.',
  ].join(' ');
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

/**
 * GPT Image API (Images generations).
 * Default model: gpt-image-1 (override via OPENAI_IMAGE_MODEL=gpt-image-2 etc.)
 * Response is usually b64_json.
 */
async function genOpenAI(prompt, dest) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'medium';
  const size = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
  const isGptImage = /^gpt-image/i.test(model);

  const body = {
    model,
    prompt: prompt.slice(0, 3900),
    n: 1,
    size,
  };

  if (isGptImage) {
    body.quality = quality;
    // GPT Image returns b64_json; do not send legacy response_format=url
  } else {
    // Legacy DALL·E fallback
    body.response_format = 'b64_json';
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `openai ${res.status}`);

  const item = data?.data?.[0];
  if (!item) throw new Error('openai: empty image data');

  if (item.b64_json) {
    writeBase64Image(item.b64_json, dest);
    return { provider: 'openai', model, path: dest, format: 'b64_json' };
  }
  if (item.url) {
    await downloadToFile(item.url, dest);
    return { provider: 'openai', model, path: dest, url: item.url, format: 'url' };
  }
  throw new Error('openai: no b64_json or url in response');
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

/**
 * Generate one square creative image. Returns { ok, prompt, path?, error?, provider }
 */
export async function generateCreativeImage({ angle, offer, runId = 'tmp', index = 0 }) {
  const cfg = imageGenConfig();
  const prompt = buildCreativePrompt({ angle, offer });
  const dir = path.join(outRoot, String(runId));
  ensureDir(dir);
  // Keep .png for GPT Image (often PNG); rename extension based on provider later if needed
  const dest = path.join(dir, `${safeName(angle?.id || 'angle')}-${index}.png`);

  if (cfg.provider === 'none') {
    return {
      ok: false,
      skipped: true,
      provider: 'none',
      prompt,
      reason: 'OPENAI_API_KEY / IMAGE_PROVIDER not configured',
    };
  }

  try {
    let result;
    if (cfg.provider === 'openai') result = await genOpenAI(prompt, dest);
    else if (cfg.provider === 'replicate') result = await genReplicate(prompt, dest);
    else if (cfg.provider === 'useapi_mj') {
      throw new Error('useapi_mj отключён — используй GPT Image API (OPENAI_API_KEY)');
    } else {
      throw new Error(`Unknown IMAGE_PROVIDER ${cfg.provider}`);
    }

    const rel = path.relative(path.resolve(__dirname, '../../..'), dest);
    return { ok: true, prompt, ...result, path: rel };
  } catch (err) {
    return {
      ok: false,
      provider: cfg.provider,
      prompt,
      error: err.message || String(err),
    };
  }
}

export async function generateAngleImages({ angles, offer, runId, limit = 2 }) {
  const list = (angles || []).slice(0, limit);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    out.push(await generateCreativeImage({ angle: list[i], offer, runId, index: i }));
  }
  return out;
}
