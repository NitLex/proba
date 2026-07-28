import { db, getSetting, setSetting } from '../db.js';
import { sendTelegramMessage, telegramBotToken } from './telegram.js';

function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}

export function alertThresholds() {
  return {
    minClicks: Math.max(1, Number(getSetting('alert_min_clicks', '50')) || 50),
    roiThreshold: Number(getSetting('alert_roi_threshold', '-30')),
    campaignMinClicks: Math.max(1, Number(getSetting('alert_campaign_min_clicks', '40')) || 40),
    cooldownHours: Math.max(1, Number(getSetting('alert_cooldown_hours', '6')) || 6),
    windowHours: Math.max(1, Number(getSetting('alert_window_hours', '24')) || 24),
  };
}

export function userOverview(uid, windowHours) {
  const hours = Math.max(1, Number(windowHours) || 24);
  const clicks = db
    .prepare(
      `SELECT
        COUNT(*) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ?
         AND cl.created_at >= datetime('now', ?)`,
    )
    .get(uid, `-${hours} hours`);

  const conv = db
    .prepare(
      `SELECT
        COUNT(*) AS conversions,
        COALESCE(SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END), 0) AS revenue
       FROM conversions cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.user_id = ?
         AND cv.created_at >= datetime('now', ?)`,
    )
    .get(uid, `-${hours} hours`);

  const cost = Number(clicks.cost || 0);
  const revenue = Number(conv.revenue || 0);
  const profit = revenue - cost;
  const clickCount = Number(clicks.clicks || 0);
  const conversions = Number(conv.conversions || 0);
  return {
    clicks: clickCount,
    conversions,
    cost: round(cost),
    revenue: round(revenue),
    profit: round(profit),
    roi: cost > 0 ? round((profit / cost) * 100) : null,
  };
}

export function userCampaignAlerts(uid, windowHours, campaignMinClicks) {
  const hours = Math.max(1, Number(windowHours) || 24);
  const min = Math.max(1, Number(campaignMinClicks) || 40);
  return db
    .prepare(
      `SELECT
        c.id,
        c.name,
        COUNT(cl.id) AS clicks,
        COALESCE(cv.conversions, 0) AS conversions
       FROM campaigns c
       LEFT JOIN clicks cl
         ON cl.campaign_id = c.id
        AND cl.created_at >= datetime('now', ?)
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS conversions
         FROM conversions
         WHERE created_at >= datetime('now', ?)
         GROUP BY campaign_id
       ) cv ON cv.campaign_id = c.id
       WHERE c.user_id = ? AND c.status = 'active'
       GROUP BY c.id
       HAVING clicks >= ? AND COALESCE(cv.conversions, 0) = 0
       ORDER BY clicks DESC
       LIMIT 5`,
    )
    .all(`-${hours} hours`, `-${hours} hours`, uid, min);
}

export function buildAlertMessages(overview, campaigns, thresholds) {
  const out = [];
  const t = thresholds || alertThresholds();
  if (overview.clicks >= t.minClicks && overview.conversions === 0) {
    out.push({
      key: 'zero_conv',
      text: `ArbTrack: ${overview.clicks} кликов за ${t.windowHours}ч, конверсий 0. Проверь постбек/оффер.`,
    });
  }
  if (overview.roi != null && overview.roi < t.roiThreshold && overview.cost > 0) {
    out.push({
      key: 'roi_drop',
      text: `ArbTrack: ROI ${overview.roi}% за ${t.windowHours}ч (порог ${t.roiThreshold}%). Cost ${overview.cost}, revenue ${overview.revenue}.`,
    });
  }
  for (const c of campaigns || []) {
    out.push({
      key: `camp_zero_${c.id}`,
      text: `ArbTrack: кампания «${c.name}» — ${c.clicks} кликов без конверсий (${t.windowHours}ч).`,
    });
  }
  return out;
}

function cooldownKey(userId, alertKey) {
  return `alert_sent:${userId}:${alertKey}`;
}

function cooldownActive(userId, alertKey, cooldownHours) {
  const raw = getSetting(cooldownKey(userId, alertKey), '');
  if (!raw) return false;
  const sentAt = Date.parse(raw);
  if (!Number.isFinite(sentAt)) return false;
  return Date.now() - sentAt < cooldownHours * 3600 * 1000;
}

function markSent(userId, alertKey) {
  setSetting(cooldownKey(userId, alertKey), new Date().toISOString());
}

/**
 * Scan users with alerts enabled and telegram_chat_id; send new alerts.
 */
export async function runOpsAlerts({ force = false } = {}) {
  if (!telegramBotToken()) {
    return { ok: false, skipped: true, reason: 'no_bot_token', sent: 0 };
  }

  const thresholds = alertThresholds();
  const users = db
    .prepare(
      `SELECT id, username, telegram_chat_id, alerts_enabled
       FROM users
       WHERE alerts_enabled = 1
         AND telegram_chat_id IS NOT NULL
         AND trim(telegram_chat_id) != ''`,
    )
    .all();

  let sent = 0;
  const details = [];

  for (const user of users) {
    const overview = userOverview(user.id, thresholds.windowHours);
    const camps = userCampaignAlerts(
      user.id,
      thresholds.windowHours,
      thresholds.campaignMinClicks,
    );
    const messages = buildAlertMessages(overview, camps, thresholds);

    for (const msg of messages) {
      if (!force && cooldownActive(user.id, msg.key, thresholds.cooldownHours)) {
        details.push({ user_id: user.id, key: msg.key, skipped: 'cooldown' });
        continue;
      }
      const r = await sendTelegramMessage(user.telegram_chat_id, msg.text);
      details.push({ user_id: user.id, key: msg.key, ...r });
      if (r.ok) {
        markSent(user.id, msg.key);
        sent += 1;
      }
    }
  }

  return { ok: true, sent, users: users.length, details, thresholds };
}
