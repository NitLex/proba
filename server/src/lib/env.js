#!/usr/bin/env node
/**
 * Load secrets from repo root.
 * Priority (later wins): .env → env.local → SECRETS.env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseFile(file) {
  if (!fs.existsSync(file)) return null;
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return { file, map };
}

export function loadEnv() {
  const candidates = [
    path.join(root, '.env'),
    path.join(root, 'env.local'),
    path.join(root, 'SECRETS.env'),
  ];
  const loaded = [];
  let lastFile = null;
  for (const candidate of candidates) {
    const parsed = parseFile(candidate);
    if (!parsed) continue;
    lastFile = parsed.file;
    for (const [key, val] of Object.entries(parsed.map)) {
      process.env[key] = val;
      loaded.push(key);
    }
  }
  if (!lastFile) return { ok: false, path: candidates[0], missing: true };
  return { ok: true, path: lastFile, keys: [...new Set(loaded)] };
}

export function mask(v) {
  if (!v) return '(пусто)';
  if (v.length <= 10) return '*'.repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} символов)`;
}
