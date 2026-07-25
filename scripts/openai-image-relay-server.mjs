#!/usr/bin/env node
/**
 * Tiny OpenAI Image relay — run on a non-RU host (laptop / Cloudflare / EU VPS).
 *
 * Env:
 *   OPENAI_API_KEY          (required)
 *   OPENAI_RELAY_SECRET     shared secret for callers (required in prod)
 *   PORT                    default 8787
 *   OPENAI_IMAGE_MODEL      default gpt-image-1
 *
 * Protocol (compatible with server/src/lib/imageGen.js):
 *   POST /v1/images/generations
 *   Authorization: Bearer <OPENAI_RELAY_SECRET>
 *   body: { prompt, model?, size?, quality?, n? }
 *   → OpenAI-shaped { data: [{ b64_json }] }
 *
 * Health: GET /health
 */
import http from 'http';

const PORT = Number(process.env.PORT || 8787);
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const SECRET = process.env.OPENAI_RELAY_SECRET || '';
const DEFAULT_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY required');
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function unauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'unauthorized' } }));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'openai-image-relay' }));
    return;
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/v1/images/generations')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }

  if (SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${SECRET}`) return unauthorized(res);
  }

  let body;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'invalid json' } }));
    return;
  }

  const model = body.model || DEFAULT_MODEL;
  const isGptImage = /^gpt-image/i.test(model);
  const payload = {
    model,
    prompt: String(body.prompt || '').slice(0, 3900),
    n: Number(body.n || 1),
    size: body.size || '1024x1024',
  };
  if (isGptImage) payload.quality = body.quality || process.env.OPENAI_IMAGE_QUALITY || 'medium';
  else payload.response_format = 'b64_json';

  try {
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: err.message || 'upstream failed' } }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`openai-image-relay on http://127.0.0.1:${PORT}`);
});
