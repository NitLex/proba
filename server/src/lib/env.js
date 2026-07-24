#!/usr/bin/env node
/**
 * Load .env from repo root into process.env (no dotenv dependency).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = path.join(root, '.env');
const altPaths = [path.join(root, 'env.local'), path.join(root, 'SECRETS.env')];

export function loadEnv(file = envPath) {
  const candidates = [file, ...altPaths];
  let loadedFrom = null;
  const loaded = [];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const lines = fs.readFileSync(candidate, 'utf8').split(/\r?\n/);
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
      // later files / existing env win only if empty
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val;
        loaded.push(key);
      }
    }
    loadedFrom = loadedFrom || candidate;
  }

  if (!loadedFrom) return { ok: false, path: file, missing: true };
  return { ok: true, path: loadedFrom, keys: loaded };
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
