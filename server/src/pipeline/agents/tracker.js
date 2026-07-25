import { db } from '../../db.js';
import { makeCampaignKey } from '../../lib/tracking.js';

function publicBase() {
  return (process.env.ARBTRACK_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
}

function upsertSource(name) {
  const existing = db.prepare(`SELECT * FROM traffic_sources WHERE name = ?`).get(name);
  if (existing) return existing;
  const info = db
    .prepare(
      `INSERT INTO traffic_sources (name, cost_param, currency, token1, token2, token3, notes)
       VALUES (?, 'cost', 'RUB', 'utm_campaign', 'utm_content', 'source', ?)`,
    )
    .run(name, 'Создано pipeline tracker-агентом');
  return db.prepare(`SELECT * FROM traffic_sources WHERE id = ?`).get(info.lastInsertRowid);
}

function upsertOffer(offer) {
  const name = offer.name || offer.offer_name || 'Pipeline offer';
  const url =
    offer.url ||
    offer.offer_url ||
    'https://example.com/?clickid={clickid}';
  const existing = db
    .prepare(`SELECT * FROM offers WHERE name = ? AND url = ?`)
    .get(name, url);
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

function createCampaign({ name, sourceId, offerId, cpc, notes }) {
  const key = makeCampaignKey();
  const info = db
    .prepare(
      `INSERT INTO campaigns (name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, status, notes)
       VALUES (?, ?, ?, ?, NULL, 'cpc', ?, 'active', ?)`,
    )
    .run(name, key, sourceId, offerId, cpc, notes);
  return db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(info.lastInsertRowid);
}

export async function runTracker({ offer, context, dryRun }) {
  const playbook = context.playbook || {};
  const sourceName = playbook.source || offer.source || 'Yandex Direct РСЯ';
  const cpc = Number(playbook.economics?.cpc_max || offer.cpc || 7);
  const campaignName =
    offer.campaign_name ||
    `РСЯ → ${offer.name || 'Offer'} (${playbook.geo || offer.geo || 'RU'})`;

  const postbackTemplate =
    `${publicBase()}/postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}`;

  if (dryRun) {
    return {
      summary: 'Dry-run: сущности трекера не создавались.',
      tracker: {
        dry_run: true,
        planned: { sourceName, campaignName, cpc, postbackTemplate },
      },
      cursor_prompt: 'Создай в ArbTrack source/offer/campaign по playbook.',
      context_patch: {},
    };
  }

  const source = upsertSource(sourceName);
  const offerRow = upsertOffer(offer);
  const campaign = createCampaign({
    name: campaignName,
    sourceId: source.id,
    offerId: offerRow.id,
    cpc,
    notes: `pipeline:${offer.network_offer_id || offer.offer_id || ''}\n${playbook.angles?.map((a) => a.id).join(',') || ''}`,
  });

  const clickUrl = `${publicBase()}/click/${campaign.key}?utm_campaign={campaign_id}&utm_content={ad_id}&utm_term={gbid}&source={source}`;

  // Optional: save/update a bundle playbook row for knowledge base
  let bundleId = null;
  try {
    const b = db
      .prepare(
        `INSERT INTO bundles (
          name, vertical, geo, source, funnel, payout_model, bid_hint, heat, difficulty, rating,
          where_to_pour, creatives, offer_notes, risks, checklist, status, notes
        ) VALUES (?, ?, ?, ?, ?, 'CPA', ?, 'warm', 'medium', 4, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .run(
        campaignName,
        playbook.vertical || 'Fintech',
        playbook.geo || offer.geo || 'RU',
        sourceName,
        playbook.funnel || 'direct',
        `CPC ≤ ${cpc} ₽`,
        'РСЯ, гео из playbook, минус мусор через 2–3 дня',
        (context.creatives?.briefs || []).map((c) => c.angle_id).join(', '),
        offer.notes || '',
        (playbook.risks || []).slice(0, 5).join('; '),
        '1) трекер 2) креативы 3) директ 4) постбек',
        `pipeline_campaign_key=${campaign.key}`,
      );
    bundleId = Number(b.lastInsertRowid);
  } catch {
    /* bundles table may differ in tests */
  }

  const tracker = {
    source: { id: source.id, name: source.name },
    offer: { id: offerRow.id, name: offerRow.name, url: offerRow.url, payout: offerRow.payout },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      key: campaign.key,
      cost_value: campaign.cost_value,
      status: campaign.status,
    },
    click_url: clickUrl,
    postback_url: postbackTemplate,
    bundle_id: bundleId,
  };

  return {
    summary: `Трекер: кампания ${campaign.key}, click ${clickUrl}`,
    tracker,
    cursor_prompt: [
      'Проверь трекер ArbTrack:',
      `Click: ${clickUrl}`,
      `Postback в партнёрке: ${postbackTemplate}`,
      'Убедись что aff_sub = clickid.',
    ].join('\n'),
    context_patch: { tracker },
  };
}
