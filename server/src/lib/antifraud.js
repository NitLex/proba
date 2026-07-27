/**
 * Click antifraud scoring (on top of bot UA allowlist).
 * High score → treat as bot / cheap / don't send to offer.
 */

const DATACENTER_HINTS =
  /^(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc|fd|fe80)/i;

// Common cloud / hosting ranges as string prefixes (coarse, not GeoIP)
const CLOUD_PREFIXES = [
  '34.', // GCP
  '35.',
  '104.196.',
  '104.197.',
  '13.32.', // CloudFront-ish / AWS edges vary
  '52.',
  '54.',
  '3.',
  '18.',
  '20.', // Azure-ish
  '40.',
  '51.1', // OVH-ish
  '185.199.', // GitHub pages etc.
];

function isLikelyDatacenterIp(ip = '') {
  const s = String(ip || '').replace(/^::ffff:/i, '');
  if (!s) return true;
  if (DATACENTER_HINTS.test(s)) return true;
  return CLOUD_PREFIXES.some((p) => s.startsWith(p));
}

/**
 * @returns {{ score: number, flags: string[], is_fraud: boolean, action: 'allow'|'cheap'|'block' }}
 */
export function scoreClickFraud({
  ip = '',
  userAgent = '',
  isBot = 0,
  isAdReview = false,
  recentSameIp = 0,
  frequencyLimit = 8,
} = {}) {
  if (isAdReview) {
    return { score: 0, flags: ['ad_review_bot'], is_fraud: false, action: 'allow' };
  }

  const flags = [];
  let score = 0;
  const ua = String(userAgent || '').trim();

  if (!ua) {
    flags.push('empty_ua');
    score += 55;
  } else if (ua.length < 12) {
    flags.push('short_ua');
    score += 35;
  }

  if (isBot) {
    flags.push('bot_ua');
    score += 50;
  }

  if (isLikelyDatacenterIp(ip)) {
    flags.push('datacenter_ip');
    score += 30;
  }

  if (Number(recentSameIp) >= Number(frequencyLimit || 8)) {
    flags.push('high_frequency');
    score += 55;
  }

  const is_fraud = score >= 50;
  let action = 'allow';
  if (score >= 80) action = 'block';
  else if (score >= 50) action = 'cheap';

  return { score, flags, is_fraud, action };
}

/** Count recent clicks from same IP for a campaign (caller provides db query result). */
export function frequencyThresholdHours() {
  return Number(process.env.ANTIFRAUD_FREQ_HOURS || 1);
}

export function frequencyLimit() {
  return Number(process.env.ANTIFRAUD_FREQ_LIMIT || 8);
}
