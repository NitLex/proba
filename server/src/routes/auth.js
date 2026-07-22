import { Router } from 'express';
import { db } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  normalizeEmail,
  normalizeTelegram,
  isValidEmail,
  isValidTelegram,
} from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const USER_RE = /^[a-zA-Z0-9_]{3,32}$/;
const USER_SELECT = `id, username, email, telegram, created_at`;

router.post('/register', (req, res) => {
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

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, email, telegram) VALUES (?, ?, ?, ?)`
    )
    .run(username, hashPassword(password), email, telegram);

  const user = db
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`)
    .get(Number(info.lastInsertRowid));

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const user = publicUser(row);
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.put('/profile', requireAuth, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const telegram = normalizeTelegram(req.body.telegram);

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  if (!isValidTelegram(telegram)) {
    return res.status(400).json({
      error: 'Telegram: @username (5–32 символа, латиница/цифры/_)',
    });
  }

  const emailTaken = db
    .prepare(`SELECT id FROM users WHERE lower(email) = ? AND id != ?`)
    .get(email, req.user.id);
  if (emailTaken) {
    return res.status(409).json({ error: 'Этот email уже занят' });
  }

  db.prepare(`UPDATE users SET email = ?, telegram = ? WHERE id = ?`).run(
    email,
    telegram,
    req.user.id
  );

  const user = db
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`)
    .get(req.user.id);

  res.json({ user: publicUser(user) });
});

export default router;
