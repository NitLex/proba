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
const DIR = path.join(root, 'creatives/pipeline/manual-lg2060');

// Hashes already uploaded in previous run
const CREATIVES = [
  {
    file: 'banner_turkey_trip_pug.png',
    hash: 'oTrQhB3bsa5Ts6o1VoQzgA',
    title: 'Зарубежная карта в Турцию',
    text: 'Выпуск зарубежной карты онлайн. Промокод LG2060 — скидка 500 ₽.',
  },
  {
    file: 'banner_turkey_qr_pug.png',
    hash: 'QWQC8EjHNkFxwegWB9lEBw',
    title: 'Зарубежная карта в телефоне',
    text: 'Выпуск зарубежной карты. Плати в Турции с телефона. Промокод LG2060.',
  },
  {
    file: 'banner_subscriptions_pug.png',
    hash: 'SyKVCF9miO0-hQIU4riCAQ',
    title: 'Зарубежная карта для подписок',
    text: 'Выпуск зарубежной карты онлайн. Промокод LG2060 — скидка 500 ₽.',
  },
  {
    file: 'banner_ai_pug.png',
    hash: 'mkof71gajib2rpgAHUjmeQ',
    title: 'Зарубежная карта для сервисов',
    text: 'Выпуск зарубежной карты. Нейросети и сервисы. Промокод LG2060.',
  },
];

const adsRes = await directApiRetry('ads', {
  method: 'get',
  params: {
    SelectionCriteria: { CampaignIds: [CAMPAIGN_ID] },
    FieldNames: ['Id', 'AdGroupId', 'State', 'Status'],
    TextAdFieldNames: ['Title', 'Href', 'DisplayUrlPath', 'AdImageHash'],
  },
});
const ads = adsRes?.result?.Ads || [];
const sample = ads.find((a) => a.TextAd?.Href);
const href = sample?.TextAd?.Href;
const displayPath = sample?.TextAd?.DisplayUrlPath || '';
console.log('href', href, 'existing ads', ads.length);

// Check if group already exists from partial run
const groupsRes = await directApiRetry('adgroups', {
  method: 'get',
  params: {
    SelectionCriteria: { CampaignIds: [CAMPAIGN_ID] },
    FieldNames: ['Id', 'Name'],
  },
});
let groupId = (groupsRes?.result?.AdGroups || []).find((g) =>
  /LG2060|pug|мопс/i.test(g.Name || ''),
)?.Id;

if (!groupId) {
  const addG = await directApiRetry('adgroups', {
    method: 'add',
    params: {
      AdGroups: [
        {
          Name: 'PPM LG2060 pug · графические',
          CampaignId: CAMPAIGN_ID,
          RegionIds: [225],
        },
      ],
    },
  });
  console.log('adgroups.add', JSON.stringify(addG).slice(0, 500));
  groupId = addG?.result?.AddResults?.[0]?.Id;
  if (!groupId) {
    console.error('failed to create group');
    process.exit(1);
  }
  // keywords for the new group
  const kws = [
    'зарубежная карта',
    'карта для поездок',
    'карта для подписок',
    'оплата за границей картой',
    'виртуальная карта онлайн',
    'выпуск зарубежной карты',
    'карта для турции',
    'оплата зарубежных сервисов',
  ].map((Keyword) => ({ Keyword, AdGroupId: groupId }));
  const kwRes = await directApiRetry('keywords', {
    method: 'add',
    params: { Keywords: kws },
  });
  const kwOk = (kwRes?.result?.AddResults || []).filter((r) => r.Id).length;
  console.log('keywords added', kwOk, kwRes?.error || '');
}

console.log('using group', groupId);

// Skip creatives that already have ads with same hash
const existingHashes = new Set(
  ads.map((a) => a.TextAd?.AdImageHash).filter(Boolean),
);
const toAdd = CREATIVES.filter((c) => c.hash && !existingHashes.has(c.hash));
console.log(
  'to add',
  toAdd.map((c) => c.file),
  'skip already',
  CREATIVES.length - toAdd.length,
);

if (!toAdd.length) {
  console.log('nothing to add');
  process.exit(0);
}

const payload = toAdd.map((c) => {
  const textAd = {
    Title: c.title.slice(0, 56),
    Text: c.text.slice(0, 81),
    Href: href,
    Mobile: 'NO',
    AdImageHash: c.hash,
  };
  if (displayPath) textAd.DisplayUrlPath = String(displayPath).slice(0, 20);
  return { AdGroupId: groupId, TextAd: textAd };
});

// Direct max 3 combinatorial ads per group — split into groups of 3
const chunks = [];
for (let i = 0; i < payload.length; i += 3) chunks.push(payload.slice(i, i + 3));

const created = [];
for (let ci = 0; ci < chunks.length; ci++) {
  let targetGroup = groupId;
  if (ci > 0) {
    const addG = await directApiRetry('adgroups', {
      method: 'add',
      params: {
        AdGroups: [
          {
            Name: `PPM LG2060 pug · графические ${ci + 1}`,
            CampaignId: CAMPAIGN_ID,
            RegionIds: [225],
          },
        ],
      },
    });
    targetGroup = addG?.result?.AddResults?.[0]?.Id || groupId;
    console.log('extra group', targetGroup);
    for (const p of chunks[ci]) p.AdGroupId = targetGroup;
  }
  const addRes = await directApiRetry('ads', {
    method: 'add',
    params: { Ads: chunks[ci] },
  });
  console.log(JSON.stringify(addRes, null, 2).slice(0, 2000));
  for (const r of addRes?.result?.AddResults || []) {
    if (r.Id) created.push(r.Id);
    if (r.Errors?.length) console.log('err', r.Errors);
  }
}

console.log('CREATED ALL', created);

// Final list
const final = await directApiRetry('ads', {
  method: 'get',
  params: {
    SelectionCriteria: { CampaignIds: [CAMPAIGN_ID] },
    FieldNames: ['Id', 'AdGroupId', 'State', 'Status'],
    TextAdFieldNames: ['Title', 'AdImageHash'],
  },
});
console.log(
  'campaign ads now',
  (final?.result?.Ads || []).map((a) => ({
    id: a.Id,
    group: a.AdGroupId,
    status: a.Status,
    state: a.State,
    title: a.TextAd?.Title,
    hash: a.TextAd?.AdImageHash,
  })),
);
