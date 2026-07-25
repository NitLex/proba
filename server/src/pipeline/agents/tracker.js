import { db } from '../../db.js';
import {
  buildLeadgidPostbackUrl,
  leadgidPostbackInstructions,
} from '../../lib/leadgidPostback.js';
import { makeCampaignKey } from '../../lib/tracking.js';
import {
  remoteApi,
  remoteBase,
  remoteConfigured,
  remoteLogin,
} from '../../lib/arbtrackRemote.js';

function localBase() {
  return (process.env.ARBTRACK_LOCAL_URL || 'http://localhost:3001').replace(/\/$/, '');
}

function publicClickBase() {
  // Click/postback URLs always point at prod tracker when remote mode is on
  if (remoteConfigured()) return remoteBase();
  return (process.env.ARBTRACK_PUBLIC_URL || localBase()).replace(/\/$/, '');
}

function upsertSourceLocal(name, postbackUrl) {
  const existing = db.prepare(`SELECT * FROM traffic_sources WHERE name = ?`).get(name);
  if (existing) {
    if (postbackUrl && !existing.postback_url) {
      db.prepare(`UPDATE traffic_sources SET postback_url = ? WHERE id = ?`).run(
        postbackUrl,
        existing.id,
      );
      return db.prepare(`SELECT * FROM traffic_sources WHERE id = ?`).get(existing.id);
    }
    return existing;
  }
  const info = db
    .prepare(
      `INSERT INTO traffic_sources (name, postback_url, cost_param, currency, token1, token2, token3, notes)
       VALUES (?, ?, 'cost', 'RUB', 'utm_campaign', 'utm_content', 'source', ?)`,
    )
    .run(name, postbackUrl || '', 'Создано pipeline tracker-агентом (local)');
  return db.prepare(`SELECT * FROM traffic_sources WHERE id = ?`).get(info.lastInsertRowid);
}

function upsertOfferLocal(offer) {
  const name = offer.name || offer.offer_name || 'Pipeline offer';
  const url = offer.url || offer.offer_url || 'https://example.com/?clickid={clickid}';
  const existing = db.prepare(`SELECT * FROM offers WHERE name = ? AND url = ?`).get(name, url);
  if (existing) {
    db.prepare(
      `UPDATE offers SET payout = ?, currency = ?, geo = ?, network = ?, notes = ?, status = 'active' WHERE id = ?`,
    ).run(
      Number(offer.payout || existing.payout || 0),
      offer.currency || existing.currency || 'RUB',
      offer.geo || existing.geo || '',
      offer.network || existing.network || '',
      offer.notes || existing.notes || '',
      existing.id,
    );
    return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(existing.id);
  }
  const info = db
    .prepare(
      `INSERT INTO offers (name, url, payout, currency, geo, network, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(
      name,
      url,
      Number(offer.payout || 0),
      offer.currency || 'RUB',
      offer.geo || '',
      offer.network || '',
      offer.notes || 'pipeline',
    );
  return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(info.lastInsertRowid);
}

function createCampaignLocal({ name, sourceId, offerId, cpc, notes }) {
  const key = makeCampaignKey();
  const info = db
    .prepare(
      `INSERT INTO campaigns (name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, status, notes)
       VALUES (?, ?, ?, ?, NULL, 'cpc', ?, 'active', ?)`,
    )
    .run(name, key, sourceId, offerId, cpc, notes);
  return db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(info.lastInsertRowid);
}

async function upsertSourceRemote(token, name) {
  const list = await remoteApi(token, 'GET', '/api/sources');
  const existing = (list || []).find(
    (s) => s.name === name || /yandex|рся|direct/i.test(s.name),
  );
  if (existing) return existing;
  return remoteApi(token, 'POST', '/api/sources', {
    name,
    postback_url: buildLeadgidPostbackUrl(remoteBase()),
    cost_param: 'cost',
    currency: 'RUB',
    token1: 'utm_campaign',
    token2: 'utm_content',
    token3: 'source',
    notes: 'Создано локальным оркестратором · постбэк LeadGid вставить вручную',
  });
}

async function upsertOfferRemote(token, offer) {
  const list = await remoteApi(token, 'GET', '/api/offers');
  const name = offer.name || offer.offer_name || 'Pipeline offer';
  const url = offer.url || offer.offer_url || 'https://example.com/?clickid={clickid}';
  const marker = offer.network_offer_id || offer.offer_id || name;
  const existing = (list || []).find(
    (o) =>
      o.name === name ||
      String(o.notes || '').includes(String(marker)) ||
      o.url === url,
  );
  const body = {
    name,
    url,
    payout: Number(offer.payout || 0),
    currency: offer.currency || 'RUB',
    geo: offer.geo || 'RU',
    network: offer.network || '',
    status: 'active',
    notes: `pipeline:${marker}\n${offer.notes || ''}`,
  };
  if (existing) return remoteApi(token, 'PUT', `/api/offers/${existing.id}`, body);
  return remoteApi(token, 'POST', '/api/offers', body);
}

async function createCampaignRemote(token, { name, sourceId, offerId, cpc, notes }) {
  // Prod branch API shape may differ; try common fields
  const body = {
    name,
    traffic_source_id: sourceId,
    offer_id: offerId,
    landing_id: null,
    cost_model: 'cpc',
    cost_value: cpc,
    status: 'active',
    notes,
  };
  return remoteApi(token, 'POST', '/api/campaigns', body);
}

export async function runTracker({ offer, context, dryRun }) {
  const playbook = context.playbook || {};
  const sourceName = playbook.source || offer.source || 'Yandex Direct РСЯ';
  const cpc = Number(playbook.economics?.cpc_max || offer.cpc || 7);
  const campaignName =
    offer.campaign_name ||
    `РСЯ → ${offer.name || 'Offer'} (${playbook.geo || offer.geo || 'RU'})`;
  // Local orchestrator can force local DB via PIPELINE_TRACKER_MODE=local (tests / offline)
  const useRemote =
    remoteConfigured() && String(process.env.PIPELINE_TRACKER_MODE || 'remote') !== 'local';
  const base = publicClickBase();
  const postbackTemplate = buildLeadgidPostbackUrl(base);
  const postbackHelp = leadgidPostbackInstructions(postbackTemplate);

  if (dryRun) {
    const tracker = {
      dry_run: true,
      mode: useRemote ? 'remote' : 'local',
      base,
      postback_url: postbackTemplate,
      postback_help: postbackHelp,
      planned: { sourceName, campaignName, cpc, postbackTemplate, base },
    };
    return {
      summary: `Dry-run: трекер ${useRemote ? 'REMOTE ' + remoteBase() : 'local'} — сущности не создавались. Постбэк LeadGid — вручную.`,
      tracker,
      cursor_prompt: [
        'Проверь план трекера и создай source/offer/campaign.',
        `LeadGid postback (вручную): ${postbackTemplate}`,
      ].join('\n'),
      context_patch: { tracker },
    };
  }

  let source;
  let offerRow;
  let campaign;

  if (useRemote) {
    const token = await remoteLogin();
    source = await upsertSourceRemote(token, sourceName);
    offerRow = await upsertOfferRemote(token, offer);
    campaign = await createCampaignRemote(token, {
      name: campaignName,
      sourceId: source.id,
      offerId: offerRow.id,
      cpc,
      notes: `pipeline:${offer.network_offer_id || offer.offer_id || ''}\n${(playbook.angles || []).map((a) => a.id).join(',')}`,
    });
  } else {
    source = upsertSourceLocal(sourceName, postbackTemplate);
    offerRow = upsertOfferLocal(offer);
    campaign = createCampaignLocal({
      name: campaignName,
      sourceId: source.id,
      offerId: offerRow.id,
      cpc,
      notes: `pipeline:${offer.network_offer_id || offer.offer_id || ''}`,
    });
  }

  const key = campaign.key || campaign.campaign_key;
  const clickUrl = key
    ? `${base}/click/${key}?utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}`
    : `${base}/click/?utm_campaign={campaign_id}&utm_content={ad_id}`;

  const tracker = {
    mode: useRemote ? 'remote' : 'local',
    base,
    source: { id: source.id, name: source.name },
    offer: { id: offerRow.id, name: offerRow.name, url: offerRow.url, payout: offerRow.payout },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      key,
      cost_value: campaign.cost_value,
      status: campaign.status,
    },
    click_url: clickUrl,
    postback_url: postbackTemplate,
    postback_help: postbackHelp,
  };

  return {
    summary: `Трекер (${tracker.mode}): ${campaign.name}${key ? ' · key ' + key : ''} · постбэк LeadGid — вручную`,
    tracker,
    cursor_prompt: [
      `Трекер: ${base} (mode=${tracker.mode})`,
      `Click: ${clickUrl}`,
      `LeadGid Postback (ВРУЧНУЮ в кабинете): ${postbackTemplate}`,
      postbackHelp.where,
      postbackHelp.note,
    ].join('\n'),
    context_patch: { tracker },
  };
}
