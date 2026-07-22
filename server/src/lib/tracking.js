import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const makeClickId = customAlphabet(alphabet, 16);
export const makeCampaignKey = customAlphabet(alphabet, 8);

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|phantom|selenium|wget|curl|python-requests|scrapy|httpclient|libwww|java\/|okhttp|go-http|aiohttp|postman|insomnia|monitoring|uptimerobot|pingdom|statuscake|bytespider|semrush|ahrefs|mj12bot|dotbot|petalbot|yandexbot|bingbot|googlebot|baiduspider|duckduckbot|applebot|twitterbot|linkedinbot|embedly|quora link|whatsapp|telegramBot|discordbot|slackbot/i;

export function detectBot(ua = '', opts = {}) {
  const raw = String(ua || '').trim();
  if (!raw && opts.emptyUaIsBot !== false) return 1;
  if (raw.length < 12 && opts.shortUaIsBot !== false) return 1;
  return BOT_RE.test(raw) ? 1 : 0;
}

export function pickWeighted(items) {
  const list = (items || []).filter((x) => x && Number(x.weight) > 0);
  if (!list.length) return null;
  const total = list.reduce((s, x) => s + Number(x.weight), 0);
  let r = Math.random() * total;
  for (const item of list) {
    r -= Number(item.weight);
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

/**
 * Replace tracking macros in destination URLs.
 */
export function applyMacros(template, ctx = {}) {
  if (!template) return template;
  const map = {
    clickid: ctx.clickid ?? '',
    external_id: ctx.clickid ?? '',
    campaign_id: String(ctx.campaign_id ?? ''),
    campaign_name: ctx.campaign_name ?? '',
    campaign_key: ctx.campaign_key ?? '',
    offer_id: String(ctx.offer_id ?? ''),
    offer_name: ctx.offer_name ?? '',
    cost: String(ctx.cost ?? 0),
    payout: String(ctx.payout ?? 0),
    country: ctx.country ?? '',
    city: ctx.city ?? '',
    device: ctx.device ?? '',
    os: ctx.os ?? '',
    browser: ctx.browser ?? '',
    ip: ctx.ip ?? '',
    user_agent: ctx.user_agent ?? '',
    referer: ctx.referer ?? '',
    token1: ctx.token1 ?? '',
    token2: ctx.token2 ?? '',
    token3: ctx.token3 ?? '',
    token4: ctx.token4 ?? '',
    token5: ctx.token5 ?? '',
    t1: ctx.token1 ?? '',
    t2: ctx.token2 ?? '',
    t3: ctx.token3 ?? '',
    t4: ctx.token4 ?? '',
    t5: ctx.token5 ?? '',
  };

  return template.replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? encodeURIComponent(map[k]) : `{${key}}`;
  });
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

export function parseCost(raw, fallback = 0) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function toCsv(rows, columns) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','));
  return [header, ...lines].join('\n');
}
