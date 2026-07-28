/**
 * Simple in-memory IP rate limiter (no extra deps).
 * Enough for auth brute-force; not a substitute for Cloudflare/WAF.
 */

const buckets = new Map();

function prune(now) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) {
    if (now > v.resetAt) buckets.delete(k);
  }
}

export function rateLimit({ windowMs = 60_000, max = 30, keyFn } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    prune(now);
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string' &&
        req.headers['x-forwarded-for'].split(',')[0].trim()) ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = keyFn ? keyFn(req, ip) : `${req.path}:${ip}`;
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    if (b.count > max) {
      return res.status(429).json({ error: 'Слишком много запросов, подождите минуту' });
    }
    return next();
  };
}
