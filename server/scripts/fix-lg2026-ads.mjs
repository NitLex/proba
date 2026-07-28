import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
process.chdir(path.join(root, 'server'));

for (const f of ['../SECRETS.env', '../.env', '.env']) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const { directApiRetry } = await import('../src/lib/directApi.js');

const CAMPAIGN_ID = 713057647;
const DIR = path.join(root, 'creatives/pipeline/manual-lg2026');

// Map old image hashes → new file + corrected text
const BY_OLD_HASH = {
  'SyKVCF9miO0-hQIU4riCAQ': {
    file: 'banner_subscriptions_pug.png',
    title: 'Зарубежная карта для подписок',
    text: 'Выпуск зарубежной карты онлайн. Промокод LG2026 — скидка 500 ₽.',
  },
  'mkof71gajib2rpgAHUjmeQ': {
    file: 'banner_ai_pug.png',
    title: 'Зарубежная карта для сервисов',
    text: 'Выпуск зарубежной карты. Нейросети и сервисы. Промокод LG2026.',
  },
  'QWQC8EjHNkFxwegWB9lEBw': {
    file: 'banner_turkey_qr_pug.png',
    title: 'Зарубежная карта в телефоне',
    text: 'Выпуск зарубежной карты. Плати в Турции с телефона. Промокод LG2026.',
  },
  'oTrQhB3bsa5Ts6o1VoQzgA': {
    file: 'banner_turkey_trip_pug.png',
    title: 'Зарубежная карта в Турцию',
    text: 'Выпуск зарубежной карты онлайн. Промокод LG2026 — скидка 500 ₽.',
  },
};

async function uploadImage(fileName) {
  const abs = path.join(DIR, fileName);
  const b64 = fs.readFileSync(abs).toString('base64');
  const name = path.basename(abs).slice(0, 255);
  const res = await directApiRetry('adimages', {
    method: 'add',
    params: { AdImages: [{ ImageData: b64, Name: `lg2026_${name}`, Type: 'AUTO' }] },
  });
  const add0 = res?.result?.AddResults?.[0] || {};
  const hash = add0.AdImageHash || add0.Hash;
  if (!hash) {
    console.error('UPLOAD FAIL', name, JSON.stringify(res).slice(0, 800));
    return null;
  }
  console.log('uploaded', name, hash);
  return hash;
}

const adsRes = await directApiRetry('ads', {
  method: 'get',
  params: {
    SelectionCriteria: { CampaignIds: [CAMPAIGN_ID] },
    FieldNames: ['Id', 'AdGroupId', 'State', 'Status'],
    TextAdFieldNames: ['Title', 'Text', 'Href', 'DisplayUrlPath', 'AdImageHash'],
  },
});
const ads = adsRes?.result?.Ads || [];

const targets = ads.filter((a) => {
  const hash = a.TextAd?.AdImageHash;
  const text = `${a.TextAd?.Title || ''} ${a.TextAd?.Text || ''}`;
  return BY_OLD_HASH[hash] || /LG2060/.test(text);
});
console.log(
  'targets',
  targets.map((a) => ({ id: a.Id, hash: a.TextAd?.AdImageHash, text: a.TextAd?.Text })),
);

const fileCache = new Map();
async function hashForFile(file) {
  if (fileCache.has(file)) return fileCache.get(file);
  const h = await uploadImage(file);
  fileCache.set(file, h);
  return h;
}

const updates = [];
for (const ad of targets) {
  const oldHash = ad.TextAd?.AdImageHash;
  let meta = BY_OLD_HASH[oldHash];
  if (!meta) {
    // text-only fix fallback
    meta = {
      file: null,
      title: String(ad.TextAd?.Title || '').replace(/LG2060/g, 'LG2026'),
      text: String(ad.TextAd?.Text || '').replace(/LG2060/g, 'LG2026'),
    };
  }
  let newHash = oldHash;
  if (meta.file) {
    newHash = await hashForFile(meta.file);
    if (!newHash) continue;
  }
  const textAd = {
    Title: meta.title.slice(0, 56),
    Text: meta.text.slice(0, 81),
  };
  if (newHash) textAd.AdImageHash = newHash;
  updates.push({ Id: ad.Id, TextAd: textAd });
}

console.log('updating', updates.length);
if (!updates.length) process.exit(0);

const upd = await directApiRetry('ads', {
  method: 'update',
  params: { Ads: updates },
});
console.log(JSON.stringify(upd, null, 2).slice(0, 3000));

const final = await directApiRetry('ads', {
  method: 'get',
  params: {
    SelectionCriteria: { Ids: updates.map((u) => u.Id) },
    FieldNames: ['Id', 'State', 'Status'],
    TextAdFieldNames: ['Title', 'Text', 'AdImageHash'],
  },
});
for (const a of final?.result?.Ads || []) {
  console.log({
    id: a.Id,
    status: a.Status,
    state: a.State,
    title: a.TextAd?.Title,
    text: a.TextAd?.Text,
    hash: a.TextAd?.AdImageHash,
  });
}
