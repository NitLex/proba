/**
 * Donaстроить / проверить кампанию РСЯ «Плати по миру» в Яндекс.Директ.
 * Требует YANDEX_DIRECT_TOKEN + YANDEX_DIRECT_LOGIN в SECRETS.env / .env
 *
 * Usage: node src/setup-direct-ppm.js
 */
import { loadEnv } from './lib/env.js';

loadEnv();

const TOKEN = process.env.YANDEX_DIRECT_TOKEN;
const LOGIN = process.env.YANDEX_DIRECT_LOGIN;
const CID = Number(process.env.YANDEX_DIRECT_CAMPAIGN_ID || 713043326);
const HREF = 'https://trekerarbitrag.ru/click/0BL6esOO';

async function direct(service, body) {
  const res = await fetch(`https://api.direct.yandex.com/json/v5/${service}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Client-Login': LOGIN,
      'Accept-Language': 'ru',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`${service}: ${data.error.error_code} ${data.error.error_string} — ${data.error.error_detail}`);
  }
  return data.result;
}

async function main() {
  if (!TOKEN || !LOGIN) {
    console.error('Need YANDEX_DIRECT_TOKEN and YANDEX_DIRECT_LOGIN');
    process.exit(1);
  }

  const camps = await direct('campaigns', {
    method: 'get',
    params: {
      SelectionCriteria: { Ids: [CID] },
      FieldNames: ['Id', 'Name', 'State', 'Status', 'StatusClarification'],
      TextCampaignFieldNames: ['BiddingStrategy', 'TrackingParams', 'Settings'],
    },
  });
  const c = camps.Campaigns?.[0];
  if (!c) {
    console.error('Campaign not found', CID);
    process.exit(1);
  }

  console.log('Campaign:', c.Id, c.Name);
  console.log('Status:', c.Status, c.State, c.StatusClarification);
  console.log('Strategy:', JSON.stringify(c.TextCampaign?.BiddingStrategy, null, 2));
  console.log('TrackingParams:', c.TextCampaign?.TrackingParams);
  console.log('Href for ads should be:', HREF);

  const ads = await direct('ads', {
    method: 'get',
    params: {
      SelectionCriteria: { CampaignIds: [CID] },
      FieldNames: ['Id', 'AdGroupId', 'Status', 'State', 'StatusClarification', 'Type'],
      TextAdFieldNames: ['Title', 'Text', 'Href', 'AdImageHash', 'SitelinkSetId'],
    },
  });
  for (const ad of ads.Ads || []) {
    console.log(
      `Ad ${ad.Id}: ${ad.Status}/${ad.State} | ${ad.TextAd?.Title} | ${ad.TextAd?.Href}`,
    );
  }

  if (c.State === 'OFF' && c.Status === 'ACCEPTED') {
    console.log('\nReady to resume. Run campaigns.resume when you want traffic.');
  } else if (c.Status === 'MODERATION') {
    console.log('\nWaiting for moderation. After accept — turn campaign ON in UI or via API.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
