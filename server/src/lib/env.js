#!/usr/bin/env node
/**
 * Load .env from repo root into process.env (no dotenv dependency).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = path.join(root, '.env');

export function loadEnv(file = envPath) {
  if (!fs.existsSync(file)) return { ok: false, path: file, missing: true };
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const loaded = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
    loaded.push(key);
  }
  return { ok: true, path: file, keys: loaded };
}

export function mask(v) {
  if (!v) return '(пусто)';
  if (v.length <= 10) return '*'.repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} символов)`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = loadEnv();
  console.log(r);
}
