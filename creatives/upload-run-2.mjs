#!/usr/bin/env node
/**
 * Upload pipeline run #2 creatives to orkestr.online ingest API.
 * Usage: node creatives/upload-run-2.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_ID = Number(process.env.PIPELINE_RUN_ID || 2);
const TOKEN = process.env.PIPELINE_INGEST_TOKEN || 'wveGnHbMMYzXErLhQXEQhpYO';
const URL =
  process.env.PIPELINE_INGEST_URL ||
  'https://orkestr.online/api/pipeline/ingest-creatives';
const DIR = path.join(__dirname, 'pipeline', String(RUN_ID));

const files = fs
  .readdirSync(DIR)
  .filter((n) => /-agent-\d+\.png$/i.test(n))
  .sort();

if (!files.length) {
  console.error(`No *-agent-*.png in ${DIR}`);
  process.exit(1);
}

const images = files.map((name) => {
  const abs = path.join(DIR, name);
  const angle_id = name.replace(/-agent-\d+\.png$/i, '');
  return {
    angle_id,
    mime: 'image/png',
    data_base64: fs.readFileSync(abs).toString('base64'),
    format: 'product',
  };
});

const body = JSON.stringify({ run_id: RUN_ID, token: TOKEN, images });
const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body,
});
const text = await res.text();
console.log('HTTP', res.status);
console.log(text);
if (!res.ok) process.exit(1);
