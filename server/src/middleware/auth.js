import { db } from '../db.js';
import { verifyToken, publicUser } from '../lib/auth.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Требуется вход' });
  }

  try {
    const payload = verifyToken(token);
    const user = db
      .prepare(
        `SELECT id, username, email, telegram, is_admin, created_at FROM users WHERE id = ?`
      )
      .get(Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: 'Только для администратора' });
    }
    next();
  });
}
