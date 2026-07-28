import { Router } from 'express';
import { alertThresholds, runOpsAlerts } from '../lib/opsAlerts.js';
import { sendTelegramMessage, telegramBotToken } from '../lib/telegram.js';
import { db } from '../db.js';
import { getSetting, setSetting } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/status', (req, res) => {
  const row = db
    .prepare(
      `SELECT telegram_chat_id, alerts_enabled FROM users WHERE id = ?`,
    )
    .get(req.user.id);
  res.json({
    bot_configured: Boolean(telegramBotToken()),
    alerts_enabled: !!row?.alerts_enabled,
    telegram_chat_id: row?.telegram_chat_id || '',
    thresholds: alertThresholds(),
  });
});

router.post('/test', async (req, res) => {
  const row = db
    .prepare(`SELECT telegram_chat_id, alerts_enabled FROM users WHERE id = ?`)
    .get(req.user.id);
  if (!row?.telegram_chat_id) {
    return res.status(400).json({
      error: 'Укажите Telegram chat_id в профиле (напишите боту /start и возьмите id).',
    });
  }
  const r = await sendTelegramMessage(
    row.telegram_chat_id,
    `ArbTrack: тест уведомлений для @${req.user.username || 'user'}. Алерты ${
      row.alerts_enabled ? 'включены' : 'выключены'
    }.`,
  );
  if (!r.ok) {
    return res.status(400).json({ error: r.error || r.reason || 'Не удалось отправить' });
  }
  res.json({ ok: true });
});

router.post('/run', requireAdmin, async (req, res) => {
  const force = Boolean(req.body?.force);
  const result = await runOpsAlerts({ force });
  res.json(result);
});

router.get('/settings', requireAdmin, (_req, res) => {
  res.json({
    bot_configured: Boolean(telegramBotToken()),
    alert_min_clicks: getSetting('alert_min_clicks', '50'),
    alert_roi_threshold: getSetting('alert_roi_threshold', '-30'),
    alert_campaign_min_clicks: getSetting('alert_campaign_min_clicks', '40'),
    alert_cooldown_hours: getSetting('alert_cooldown_hours', '6'),
    alert_window_hours: getSetting('alert_window_hours', '24'),
  });
});

router.put('/settings', requireAdmin, (req, res) => {
  const keys = [
    'alert_min_clicks',
    'alert_roi_threshold',
    'alert_campaign_min_clicks',
    'alert_cooldown_hours',
    'alert_window_hours',
  ];
  for (const key of keys) {
    if (req.body[key] !== undefined) setSetting(key, String(req.body[key]));
  }
  res.json({
    bot_configured: Boolean(telegramBotToken()),
    alert_min_clicks: getSetting('alert_min_clicks', '50'),
    alert_roi_threshold: getSetting('alert_roi_threshold', '-30'),
    alert_campaign_min_clicks: getSetting('alert_campaign_min_clicks', '40'),
    alert_cooldown_hours: getSetting('alert_cooldown_hours', '6'),
    alert_window_hours: getSetting('alert_window_hours', '24'),
  });
});

export default router;
