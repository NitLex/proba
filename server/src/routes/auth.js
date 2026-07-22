import { Router } from 'express';
import { db } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
} from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const USER_RE = /^[a-zA-Z0-9_]{3,32}$/;

router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!USER_RE.test(username)) {
    return res.status(400).json({
      error: 'Логин: 3–32 символа, только латиница, цифры и _',
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }

  const exists = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (exists) {
    return res.status(409).json({ error: 'Такой логин уже занят' });
  }

  const info = db
    .prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`)
    .run(username, hashPassword(password));

  const user = db
    .prepare(`SELECT id, username, created_at FROM users WHERE id = ?`)
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

export default router;
