/**
 * Image generation for РСЯ creatives.
 * Providers (env IMAGE_PROVIDER):
 *   - openai     → DALL·E (OPENAI_API_KEY)
 *   - replicate  → FLUX / SD (REPLICATE_API_TOKEN)
 *   - useapi_mj  → Midjourney via UseAPI.net (USEAPI_TOKEN)
 *   - none       → only prompts (default)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(__dirname, '../../../creatives/pipeline');

export function imageGenConfig() {
  const provider = String(process.env.IMAGE_PROVIDER || 'none').toLowerCase();
  const configured =
    (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY)) ||
    (provider === 'replicate' && Boolean(process.env.REPLICATE_API_TOKEN)) ||
    (provider === 'useapi_mj' && Boolean(process.env.USEAPI_TOKEN));
  return {
    provider: configured ? provider : 'none',
    configured,
    note: configured
      ? `Live · ${provider}`
      : 'Не настроено — задай IMAGE_PROVIDER + ключ (OPENAI_API_KEY / REPLICATE_API_TOKEN / USEAPI_TOKEN)',
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
export function buildCreativePrompt({ angle, offer, size = '1080x1080' }) {
  const name = offer?.name || 'цифровая карта';
  const angleHint =
    {
      travel: 'travel mood, passport and boarding pass abstract shapes, soft blue sky gradient, suitcase silhouette',
      services: 'modern app subscriptions mood, soft neon accents, abstract phone screen glow, clean fintech UI shapes',
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

async function genOpenAI(prompt, dest) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, 3900),
      size: '1024x1024',
      n: 1,
      response_format: 'url',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `openai ${res.status}`);
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('openai: empty image url');
  await downloadToFile(url, dest);
  return { provider: 'openai', path: dest, url };
}

async function genReplicate(prompt, dest) {
  const token = process.env.REPLICATE_API_TOKEN;
  const model =
    process.env.REPLICATE_IMAGE_MODEL ||
    'black-forest-labs/flux-schnell';
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

async function genUseApiMj(prompt, dest) {
  const token = process.env.USEAPI_TOKEN;
  const channel = process.env.USEAPI_DISCORD_CHANNEL || '';
  const create = await fetch('https://api.useapi.net/v2/jobs/imagine', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: `${prompt.slice(0, 1800)} --ar 1:1 --v 6.1 --style raw`,
      ...(channel ? { discord: channel } : {}),
    }),
  });
  const job = await create.json();
  if (!create.ok) throw new Error(job?.error || job?.message || `useapi ${create.status}`);
  const jobId = job.jobid || job.jobId || job.id;
  if (!jobId) throw new Error('useapi_mj: no job id');

  let final = job;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const poll = await fetch(`https://api.useapi.net/v2/jobs/?jobid=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    final = await poll.json();
    const status = String(final.status || final.code || '').toLowerCase();
    if (['completed', 'done', 'success'].includes(status) || final.attachments?.length) break;
    if (['failed', 'error', 'cancelled'].includes(status)) {
      throw new Error(final.error || final.message || 'useapi_mj failed');
    }
  }
  const url =
    final.attachments?.[0]?.url ||
    final.attachment ||
    final.imageUrl ||
    final.uri ||
    final.cdnImage;
  if (!url) throw new Error('useapi_mj: no image url (job may still be running)');
  await downloadToFile(url, dest);
  return { provider: 'useapi_mj', path: dest, url, job_id: jobId };
}

/**
 * Generate one square creative image. Returns { ok, prompt, path?, error?, provider }
 */
export async function generateCreativeImage({ angle, offer, runId = 'tmp', index = 0 }) {
  const cfg = imageGenConfig();
  const prompt = buildCreativePrompt({ angle, offer });
  const dir = path.join(outRoot, String(runId));
  ensureDir(dir);
  const dest = path.join(dir, `${safeName(angle?.id || 'angle')}-${index}.jpg`);

  if (cfg.provider === 'none') {
    return {
      ok: false,
      skipped: true,
      provider: 'none',
      prompt,
      reason: 'IMAGE_PROVIDER not configured',
    };
  }

  try {
    let result;
    if (cfg.provider === 'openai') result = await genOpenAI(prompt, dest);
    else if (cfg.provider === 'replicate') result = await genReplicate(prompt, dest);
    else if (cfg.provider === 'useapi_mj') result = await genUseApiMj(prompt, dest);
    else throw new Error(`Unknown IMAGE_PROVIDER ${cfg.provider}`);

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
