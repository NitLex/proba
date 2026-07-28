import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'arbtrack-dev-secret-change-me';
const JWT_DAYS = Number(process.env.JWT_DAYS || 30);

export function hashPassword(password) {
  return bcrypt.hashSync(String(password), 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password), String(hash));
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: `${JWT_DAYS}d` }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Demo account seeded for public showcase — no orchestrator / secrets tooling. */
export function isDemoUser(userOrUsername) {
  const name =
    typeof userOrUsername === 'string'
      ? userOrUsername
      : userOrUsername?.username || '';
  return String(name).trim().toLowerCase() === 'demo';
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    telegram: row.telegram || '',
    telegram_chat_id: row.telegram_chat_id || '',
    alerts_enabled: row.alerts_enabled == null ? true : !!row.alerts_enabled,
    is_admin: !!row.is_admin,
    is_demo: isDemoUser(row),
    created_at: row.created_at,
  };
}

export function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function normalizeTelegram(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  // accept @user, user, or t.me/user / telegram.me/user links
  t = t.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '');
  t = t.replace(/^@/, '');
  return t ? `@${t}` : '';
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidTelegram(telegram) {
  // stored as @username, 5–32 chars after @
  return /^@[a-zA-Z0-9_]{5,32}$/.test(telegram);
}
