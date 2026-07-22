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

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
  };
}
