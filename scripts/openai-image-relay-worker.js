/**
 * Cloudflare Worker variant of openai-image-relay-server.mjs
 *
 * Deploy:
 *   npx wrangler secret put OPENAI_API_KEY
 *   npx wrangler secret put OPENAI_RELAY_SECRET
 *   npx wrangler deploy scripts/openai-image-relay-worker.js
 *
 * Then on RU VPS:
 *   IMAGE_PROVIDER=openai
 *   OPENAI_RELAY_URL=https://YOUR_WORKER.workers.dev
 *   OPENAI_RELAY_SECRET=same-as-above
 *   # OPENAI_API_KEY на VPS не обязателен — ключ живёт только в Worker
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return Response.json({ ok: true, service: 'openai-image-relay' });
    }
    if (request.method !== 'POST' || !url.pathname.startsWith('/v1/images/generations')) {
      return Response.json({ error: { message: 'not found' } }, { status: 404 });
    }
    const auth = request.headers.get('authorization') || '';
    if (!env.OPENAI_RELAY_SECRET || auth !== `Bearer ${env.OPENAI_RELAY_SECRET}`) {
      return Response.json({ error: { message: 'unauthorized' } }, { status: 401 });
    }
    if (!env.OPENAI_API_KEY) {
      return Response.json({ error: { message: 'OPENAI_API_KEY missing on worker' } }, { status: 500 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: { message: 'invalid json' } }, { status: 400 });
    }

    const model = body.model || 'gpt-image-1';
    const isGptImage = /^gpt-image/i.test(model);
    const payload = {
      model,
      prompt: String(body.prompt || '').slice(0, 3900),
      n: Number(body.n || 1),
      size: body.size || '1024x1024',
    };
    if (isGptImage) payload.quality = body.quality || 'medium';
    else payload.response_format = 'b64_json';

    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
