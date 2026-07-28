import { db } from '../db.js';
import { applyMacros } from './tracking.js';

/**
 * Fire traffic source S2S postback after a conversion is recorded.
 * Never throws — networks must not fail because of outbound notify.
 */
export async function fireSourcePostback({ click, status, payout, currency, txid }) {
  if (!click?.traffic_source_id) {
    return { ok: false, skipped: true, reason: 'no_traffic_source' };
  }

  const source = db
    .prepare(`SELECT id, name, postback_url FROM traffic_sources WHERE id = ?`)
    .get(click.traffic_source_id);
  const template = String(source?.postback_url || '').trim();
  if (!template) {
    return { ok: false, skipped: true, reason: 'no_postback_url' };
  }

  const campaign = click.campaign_id
    ? db
        .prepare(`SELECT id, name, key FROM campaigns WHERE id = ?`)
        .get(click.campaign_id)
    : null;
  const offer = click.offer_id
    ? db.prepare(`SELECT id, name FROM offers WHERE id = ?`).get(click.offer_id)
    : null;

  const url = applyMacros(template, {
    clickid: click.clickid,
    campaign_id: click.campaign_id,
    campaign_name: campaign?.name || '',
    campaign_key: campaign?.key || '',
    offer_id: click.offer_id,
    offer_name: offer?.name || '',
    cost: click.cost,
    payout,
    status,
    txid,
    currency,
    country: click.country,
    city: click.city,
    device: click.device,
    os: click.os,
    browser: click.browser,
    ip: click.ip,
    user_agent: click.user_agent,
    referer: click.referer,
    token1: click.token1,
    token2: click.token2,
    token3: click.token3,
    token4: click.token4,
    token5: click.token5,
  });

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return {
      ok: res.ok,
      status: res.status,
      url,
      source_id: source.id,
      source_name: source.name,
    };
  } catch (err) {
    console.warn('[source-postback]', source?.name || source?.id, err.message);
    return {
      ok: false,
      error: err.message,
      url,
      source_id: source?.id,
    };
  }
}
