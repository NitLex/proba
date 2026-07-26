import { db } from '../../db.js';
import {
  buildLeadgidPostbackUrl,
  leadgidPostbackInstructions,
  validateOfferTrackingUrl,
  ensureOfferTrackingUrl,
} from '../../lib/leadgidPostback.js';
import { makeCampaignKey } from '../../lib/tracking.js';
import { generatePreland } from '../../lib/preland.js';
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

function resolveOwnerUserId(explicit) {
  if (explicit) return Number(explicit);
  if (process.env.PIPELINE_OWNER_USER_ID) return Number(process.env.PIPELINE_OWNER_USER_ID);
  const login = process.env.ARBTRACK_USERNAME || process.env.ARBTRACK_LOGIN || '';
  if (login) {
    const row = db.prepare(`SELECT id FROM users WHERE lower(username) = lower(?)`).get(login);
    if (row) return row.id;
  }
  // Prefer first non-demo registered user
  const reg = db
    .prepare(`SELECT id FROM users WHERE lower(username) != 'demo' ORDER BY id ASC LIMIT 1`)
    .get();
  return reg?.id || null;
}

function upsertSourceLocal(name, postbackUrl, userId) {
  const existing = userId
    ? db.prepare(`SELECT * FROM traffic_sources WHERE name = ? AND user_id = ?`).get(name, userId)
    : db.prepare(`SELECT * FROM traffic_sources WHERE name = ?`).get(name);
  if (existing) {
    const patches = [];
    const vals = [];
    if (postbackUrl && !existing.postback_url) {
      patches.push('postback_url = ?');
      vals.push(postbackUrl);
    }
    if (userId && !existing.user_id) {
      patches.push('user_id = ?');
      vals.push(userId);
    }
    if (!existing.currency || existing.currency === 'USD') {
      patches.push(`currency = 'RUB'`);
    }
    if (patches.length) {
      vals.push(existing.id);
      db.prepare(`UPDATE traffic_sources SET ${patches.join(', ')} WHERE id = ?`).run(...vals);
      return db.prepare(`SELECT * FROM traffic_sources WHERE id = ?`).get(existing.id);
    }
    return existing;
  }
  const info = db
    .prepare(
      `INSERT INTO traffic_sources (user_id, name, postback_url, cost_param, currency, token1, token2, token3, notes)
       VALUES (?, ?, ?, 'cost', 'RUB', 'utm_campaign', 'utm_content', 'source', ?)`,
    )
    .run(userId || null, name, postbackUrl || '', 'Создано pipeline tracker-агентом (local)');
  return db.prepare(`SELECT * FROM traffic_sources WHERE id = ?`).get(info.lastInsertRowid);
}

function findExistingOfferLocal(offer, name, url, userId) {
  const byExact = userId
    ? db.prepare(`SELECT * FROM offers WHERE name = ? AND url = ? AND user_id = ?`).get(name, url, userId)
    : db.prepare(`SELECT * FROM offers WHERE name = ? AND url = ?`).get(name, url);
  if (byExact) return byExact;

  // Same LeadGid offer_id / name without aff_sub yet → reuse and patch URL
  const lgId = offer.network_offer_id || offer.offer_id || '';
  if (lgId) {
    const byLg = userId
      ? db
          .prepare(
            `SELECT * FROM offers
             WHERE user_id = ? AND (url LIKE ? OR notes LIKE ?)
             ORDER BY id DESC LIMIT 1`,
          )
          .get(userId, `%offer_id=${lgId}%`, `%pipeline:${lgId}%`)
      : db
          .prepare(
            `SELECT * FROM offers
             WHERE url LIKE ? OR notes LIKE ?
             ORDER BY id DESC LIMIT 1`,
          )
          .get(`%offer_id=${lgId}%`, `%pipeline:${lgId}%`);
    if (byLg) return byLg;
  }

  if (name) {
    const byName = userId
      ? db.prepare(`SELECT * FROM offers WHERE name = ? AND user_id = ? ORDER BY id DESC LIMIT 1`).get(name, userId)
      : db.prepare(`SELECT * FROM offers WHERE name = ? ORDER BY id DESC LIMIT 1`).get(name);
    if (byName && /leadgid|go\.leadgid/i.test(byName.url || '')) return byName;
  }
  return null;
}

function upsertOfferLocal(offer, userId) {
  const name = offer.name || offer.offer_name || 'Pipeline offer';
  const rawUrl = offer.url || offer.offer_url || 'https://example.com/?clickid={clickid}';
  const network = offer.network || '';
  const url = ensureOfferTrackingUrl(rawUrl, { network });
  const currency = offer.currency || 'RUB';
  const existing = findExistingOfferLocal(offer, name, url, userId);
  if (existing) {
    const fixedUrl = ensureOfferTrackingUrl(existing.url || url, {
      network: network || existing.network || '',
    });
    db.prepare(
      `UPDATE offers SET url = ?, payout = ?, currency = ?, geo = ?, network = ?, notes = ?, status = 'active', user_id = COALESCE(user_id, ?) WHERE id = ?`,
    ).run(
      fixedUrl,
      Number(offer.payout || existing.payout || 0),
      currency || existing.currency || 'RUB',
      offer.geo || existing.geo || '',
      network || existing.network || '',
      offer.notes || existing.notes || '',
      userId || null,
      existing.id,
    );
    return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(existing.id);
  }
  const info = db
    .prepare(
      `INSERT INTO offers (user_id, name, url, payout, currency, geo, network, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(
      userId || null,
      name,
      url,
      Number(offer.payout || 0),
      currency,
      offer.geo || '',
      network,
      offer.notes || 'pipeline',
    );
  return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(info.lastInsertRowid);
}

function createCampaignLocal({ name, sourceId, offerId, landingId, cpc, notes, userId, currency }) {
  const key = makeCampaignKey();
  const info = db
    .prepare(
      `INSERT INTO campaigns (user_id, name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, currency, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'cpc', ?, ?, 'active', ?)`,
    )
    .run(
      userId || null,
      name,
      key,
      sourceId,
      offerId,
      landingId || null,
      cpc,
      currency || 'RUB',
      notes,
    );
  return db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(info.lastInsertRowid);
}

function upsertLandingLocal({ name, url, userId, notes }) {
  const existing = userId
    ? db.prepare(`SELECT * FROM landings WHERE url = ? AND user_id = ?`).get(url, userId)
    : db.prepare(`SELECT * FROM landings WHERE url = ?`).get(url);
  if (existing) return existing;
  const info = db
    .prepare(
      `INSERT INTO landings (user_id, name, url, notes) VALUES (?, ?, ?, ?)`,
    )
    .run(userId || null, name, url, notes || 'pipeline preland');
  return db.prepare(`SELECT * FROM landings WHERE id = ?`).get(info.lastInsertRowid);
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
  const network = offer.network || '';
  const url = ensureOfferTrackingUrl(
    offer.url || offer.offer_url || 'https://example.com/?clickid={clickid}',
    { network },
  );
  const marker = offer.network_offer_id || offer.offer_id || name;
  const existing = (list || []).find(
    (o) =>
      (o.name === name && o.url === url) ||
      String(o.notes || '').includes(`pipeline:${marker}`) ||
      (marker && String(o.url || '').includes(`offer_id=${marker}`)),
  );
  if (existing) {
    const fixedUrl = ensureOfferTrackingUrl(existing.url || url, {
      network: network || existing.network || '',
    });
    if (fixedUrl !== existing.url) {
      return remoteApi(token, 'PUT', `/api/offers/${existing.id}`, {
        ...existing,
        url: fixedUrl,
        status: 'active',
      });
    }
    return existing;
  }
  return remoteApi(token, 'POST', '/api/offers', {
    name,
    url,
    payout: Number(offer.payout || 0),
    currency: offer.currency || 'RUB',
    geo: offer.geo || '',
    network,
    status: 'active',
    notes: `pipeline:${marker}\n${offer.notes || ''}`,
  });
}

async function createCampaignRemote(token, { name, sourceId, offerId, cpc, notes, currency }) {
  const body = {
    name,
    traffic_source_id: sourceId,
    offer_id: offerId,
    landing_id: null,
    cost_model: 'cpc',
    cost_value: cpc,
    currency: currency || 'RUB',
    status: 'active',
    notes,
  };
  return remoteApi(token, 'POST', '/api/campaigns', body);
}

export async function runTracker({ offer, context, dryRun, ownerUserId }) {
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
  const userId = resolveOwnerUserId(ownerUserId || context.owner_user_id);
  const currency = offer.currency || 'RUB';
  const verticalKey = playbook.vertical_key || '';
  const wantPreland =
    String(process.env.PIPELINE_PRELAND || offer.use_preland || '1') !== '0' &&
    /fintech_cards|fintech_loans/i.test(verticalKey || 'fintech_cards');
  // Normalize offer URL before create/validate (LeadGid → aff_sub={clickid})
  offer.url = ensureOfferTrackingUrl(offer.url || offer.offer_url || '', {
    network: offer.network || '',
  });
  if (offer.offer_url) offer.offer_url = offer.url;
  const offerTrack = validateOfferTrackingUrl(offer.url || '');

  if (dryRun) {
    const tracker = {
      dry_run: true,
      mode: useRemote ? 'remote' : 'local',
      base,
      owner_user_id: userId,
      postback_url: postbackTemplate,
      postback_help: postbackHelp,
      offer_tracking: offerTrack,
      preland_planned: wantPreland,
      planned: {
        sourceName,
        campaignName,
        cpc,
        postbackTemplate,
        base,
        currency,
        offer_url: offer.url,
      },
    };
    return {
      summary: `Dry-run: трекер ${useRemote ? 'REMOTE ' + remoteBase() : 'local'} — сущности не создавались. Постбэк LeadGid — вручную.`,
      tracker,
      failed: !offerTrack.ok,
      cursor_prompt: [
        'Проверь план трекера и создай source/offer/campaign.',
        `Offer URL: ${offer.url}`,
        `LeadGid postback (вручную): ${postbackTemplate}`,
      ].join('\n'),
      context_patch: { tracker },
    };
  }

  let source;
  let offerRow;
  let campaign;
  let landing = null;
  let preland = null;

  if (wantPreland && !useRemote) {
    const angle = (playbook.angles || [])[0] || { id: 'main', title: 'Основной' };
    preland = generatePreland({
      offer,
      angle,
      verticalKey: verticalKey || 'fintech_cards',
      runId: context.run_id || `offer-${Date.now()}`,
      publicBase: base,
    });
  }

  if (useRemote) {
    const token = await remoteLogin();
    source = await upsertSourceRemote(token, sourceName);
    offerRow = await upsertOfferRemote(token, offer);
    campaign = await createCampaignRemote(token, {
      name: campaignName,
      sourceId: source.id,
      offerId: offerRow.id,
      cpc,
      currency,
      notes: `pipeline:${offer.network_offer_id || offer.offer_id || ''}\n${(playbook.angles || []).map((a) => a.id).join(',')}`,
    });
  } else {
    if (!userId) {
      return {
        summary: 'Трекер: не удалось определить владельца (user_id) — сущности не привязаны к аккаунту',
        failed: true,
        tracker: { error: 'no_owner_user_id' },
        cursor_prompt: 'Залогинься зарегистрированным пользователем и перезапусти пайплайн.',
        context_patch: { tracker: { error: 'no_owner_user_id' } },
      };
    }
    source = upsertSourceLocal(sourceName, postbackTemplate, userId);
    offerRow = upsertOfferLocal(offer, userId);
    if (preland?.url) {
      landing = upsertLandingLocal({
        name: `Preland · ${offer.name || 'offer'}`,
        url: preland.url,
        userId,
        notes: `pipeline preland ${preland.slug}`,
      });
    }
    campaign = createCampaignLocal({
      name: campaignName,
      sourceId: source.id,
      offerId: offerRow.id,
      landingId: landing?.id || null,
      cpc,
      userId,
      currency,
      notes: `pipeline:${offer.network_offer_id || offer.offer_id || ''}`,
    });
  }

  const key = campaign.key || campaign.campaign_key;
  const clickUrl = key
    ? `${base}/click/${key}?utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}`
    : `${base}/click/?utm_campaign={campaign_id}&utm_content={ad_id}`;

  const finalOfferTrack = validateOfferTrackingUrl(offerRow.url || '');
  const tracker = {
    mode: useRemote ? 'remote' : 'local',
    base,
    owner_user_id: userId,
    source: { id: source.id, name: source.name, currency: source.currency || 'RUB' },
    offer: {
      id: offerRow.id,
      name: offerRow.name,
      url: offerRow.url,
      payout: offerRow.payout,
      currency: offerRow.currency || currency,
    },
    landing: landing
      ? { id: landing.id, name: landing.name, url: landing.url }
      : null,
    preland,
    offer_tracking: finalOfferTrack,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      key,
      cost_value: campaign.cost_value,
      currency: campaign.currency || currency,
      status: campaign.status,
      landing_id: campaign.landing_id || landing?.id || null,
    },
    click_url: clickUrl,
    postback_url: postbackTemplate,
    postback_help: postbackHelp,
  };

  const trackingOk = Boolean(finalOfferTrack.ok);
  return {
    summary: trackingOk
      ? `Трекер (${tracker.mode}): ${campaign.name}${key ? ' · key ' + key : ''} · user #${userId || '—'} · ${currency}${preland ? ' · preland' : ''} · aff_sub ok · постбэк LeadGid — вручную`
      : `Трекер: нет aff_sub={clickid} в URL оффера — постбэки не склеятся (${finalOfferTrack.reason})`,
    failed: !trackingOk,
    tracker,
    cursor_prompt: [
      `Трекер: ${base} (mode=${tracker.mode}, user_id=${userId})`,
      `Click: ${clickUrl}`,
      `Offer URL: ${offerRow.url}`,
      preland ? `Preland: ${preland.url}` : 'Preland: off (direct-to-offer)',
      `Offer tracking: ${finalOfferTrack.reason}`,
      `LeadGid Postback (ВРУЧНУЮ в кабинете): ${postbackTemplate}`,
      postbackHelp.where,
      postbackHelp.note,
    ].join('\n'),
    context_patch: { tracker },
  };
}
