import { Router } from 'express';
import { db } from '../db.js';
import { clientIp } from '../lib/tracking.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const KEY_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/** Public: record a visit to login/register (or other auth pages). */
export function recordSiteVisit(req, res) {
  const rawKey = String(req.body?.visitor_key || req.query.visitor_key || '').trim();
  const pathName = String(req.body?.path || req.query.path || '/').slice(0, 120);
  if (!KEY_RE.test(rawKey)) {
    return res.status(400).json({ ok: false, error: 'visitor_key required' });
  }

  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 400);

  // at most one hit per visitor + path per calendar day (UTC)
  const existing = db
    .prepare(
      `SELECT id FROM site_visits
       WHERE visitor_key = ? AND path = ?
         AND date(created_at) = date('now')
       LIMIT 1`
    )
    .get(rawKey, pathName);

  if (!existing) {
    db.prepare(
      `INSERT INTO site_visits (visitor_key, path, ip, user_agent) VALUES (?, ?, ?, ?)`
    ).run(rawKey, pathName, ip, ua);
  }

  res.json({ ok: true, recorded: !existing });
}

router.get('/site', requireAdmin, (_req, res) => {
  const visitsTotal = db.prepare(`SELECT COUNT(*) AS c FROM site_visits`).get().c;
  const visitsToday = db
    .prepare(`SELECT COUNT(*) AS c FROM site_visits WHERE date(created_at) = date('now')`)
    .get().c;
  const uniquesTotal = db
    .prepare(`SELECT COUNT(DISTINCT visitor_key) AS c FROM site_visits`)
    .get().c;
  const uniquesToday = db
    .prepare(
      `SELECT COUNT(DISTINCT visitor_key) AS c FROM site_visits WHERE date(created_at) = date('now')`
    )
    .get().c;
  const registrations = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  const registrationsToday = db
    .prepare(`SELECT COUNT(*) AS c FROM users WHERE date(created_at) = date('now')`)
    .get().c;

  const recentUsers = db
    .prepare(
      `SELECT id, username, email, telegram, is_admin, created_at
       FROM users
       ORDER BY id DESC
       LIMIT 20`
    )
    .all()
    .map((u) => ({
      ...u,
      is_admin: !!u.is_admin,
    }));

  res.json({
    visits_total: visitsTotal,
    visits_today: visitsToday,
    uniques_total: uniquesTotal,
    uniques_today: uniquesToday,
    registrations,
    registrations_today: registrationsToday,
    recent_users: recentUsers,
  });
});

export default router;
