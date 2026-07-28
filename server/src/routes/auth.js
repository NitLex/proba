import { Router } from 'express';
import { db, getSetting } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  normalizeEmail,
  normalizeTelegram,
  isValidEmail,
  isValidTelegram,
  isDemoUser,
} from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { appMeta, isOrchestratorMode } from '../lib/appMode.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const USER_RE = /^[a-zA-Z0-9_]{3,32}$/;
const USER_SELECT = `id, username, email, telegram, telegram_chat_id, alerts_enabled, is_admin, created_at`;

const authLimiter = rateLimit({ windowMs: 60_000, max: 20, keyFn: (_req, ip) => `auth:${ip}` });

router.get('/registration-status', (_req, res) => {
  const enabled = getSetting('registration_enabled', '1') === '1';
  const invite = getSetting('invite_code', '');
  res.json({
    enabled,
    invite_required: enabled && !!invite,
  });
});

router.post('/register', authLimiter, (req, res) => {
  if (getSetting('registration_enabled', '1') !== '1') {
    return res.status(403).json({ error: 'Регистрация закрыта' });
  }

  const inviteRequired = getSetting('invite_code', '');
  if (inviteRequired) {
    const code = String(req.body.invite_code || '').trim();
    if (code !== inviteRequired) {
      return res.status(403).json({ error: 'Неверный инвайт-код' });
    }
  }

  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const email = normalizeEmail(req.body.email);
  const telegram = normalizeTelegram(req.body.telegram);

  if (!USER_RE.test(username)) {
    return res.status(400).json({
      error: 'Логин: 3–32 символа, только латиница, цифры и _',
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  if (!isValidTelegram(telegram)) {
    return res.status(400).json({
      error: 'Telegram: @username (5–32 символа, латиница/цифры/_)',
    });
  }

  const exists = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (exists) {
    return res.status(409).json({ error: 'Такой логин уже занят' });
  }

  const emailTaken = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).get(email);
  if (emailTaken) {
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }

  const userCount = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  const isAdmin = userCount === 0 ? 1 : 0;

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, email, telegram, is_admin)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, hashPassword(password), email, telegram, isAdmin);

  const user = db
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`)
    .get(Number(info.lastInsertRowid));

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user), app: appMeta() });
});

router.post('/login', authLimiter, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (isOrchestratorMode() && isDemoUser(username)) {
    return res.status(403).json({
      error: 'Демо-доступ на оркестраторе отключён. Войдите своим аккаунтом.',
    });
  }

  const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  if (isOrchestratorMode() && isDemoUser(row)) {
    return res.status(403).json({
      error: 'Демо-доступ на оркестраторе отключён. Войдите своим аккаунтом.',
    });
  }

  const user = publicUser(row);
  res.json({ token: signToken(user), user, app: appMeta() });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, app: appMeta() });
});

router.put('/profile', requireAuth, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const telegram = normalizeTelegram(req.body.telegram);
  const chatId = String(req.body.telegram_chat_id || '').trim();
  const alertsEnabled =
    req.body.alerts_enabled === undefined ? 1 : req.body.alerts_enabled ? 1 : 0;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  if (!isValidTelegram(telegram)) {
    return res.status(400).json({
      error: 'Telegram: @username (5–32 символа, латиница/цифры/_)',
    });
  }
  if (chatId && !/^-?\d{5,20}$/.test(chatId)) {
    return res.status(400).json({
      error: 'Telegram chat_id: только цифры (можно с минусом для группы)',
    });
  }

  const emailTaken = db
    .prepare(`SELECT id FROM users WHERE lower(email) = ? AND id != ?`)
    .get(email, req.user.id);
  if (emailTaken) {
    return res.status(409).json({ error: 'Этот email уже занят' });
  }

  db.prepare(
    `UPDATE users SET email = ?, telegram = ?, telegram_chat_id = ?, alerts_enabled = ? WHERE id = ?`,
  ).run(email, telegram, chatId, alertsEnabled, req.user.id);

  const user = db
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`)
    .get(req.user.id);

  res.json({ user: publicUser(user) });
});

router.put('/password', requireAuth, (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль минимум 6 символов' });
  }

  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return res.status(400).json({ error: 'Текущий пароль неверный' });
  }

  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
    hashPassword(newPassword),
    req.user.id
  );
  res.json({ ok: true });
});

export default router;
