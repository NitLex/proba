import { Router } from 'express';
import { db } from '../db.js';
import { parseCost } from '../lib/tracking.js';
import { fireSourcePostback } from '../lib/sourcePostback.js';

const router = Router();

function normalizeStatus(raw) {
  const statusRaw = String(raw || 'lead').toLowerCase();
  const statusMap = {
    lead: 'lead',
    sale: 'sale',
    approved: 'sale',
    dep: 'sale',
    deposit: 'sale',
    rejected: 'rejected',
    trash: 'rejected',
    hold: 'hold',
  };
  return statusMap[statusRaw] || statusRaw;
}

/**
 * Network postback endpoint.
 * LeadGid validates URL with fake clickid=aff_sub_value — must return HTTP 200,
 * otherwise кабинет shows «Постбек не доставлен / 404».
 *
 * Example: /postback?clickid={aff_sub}&payout={payout}&status={status}&txid={transaction_id}
 */
function handlePostback(req, res) {
  const q = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
  const clickid = String(q.clickid || q.cid || q.external_id || q.aff_sub || '');
  if (!clickid) {
    return res.status(400).json({ ok: false, error: 'clickid required' });
  }

  const status = normalizeStatus(q.status || q.event);
  const txid = String(q.txid || q.transaction_id || '');
  let payout = parseCost(q.payout ?? q.sum ?? q.amount, null);

  const click = db
    .prepare(
      `SELECT cl.*, o.payout AS offer_payout, o.currency AS offer_currency
       FROM clicks cl
       LEFT JOIN offers o ON o.id = cl.offer_id
       WHERE cl.clickid = ?`,
    )
    .get(clickid);

  // Always 200 for networks (LeadGid test / delayed postback / lost click)
  if (!click) {
    const existing = db
      .prepare(`SELECT id FROM conversions WHERE clickid = ? AND status = ? LIMIT 1`)
      .get(clickid, status);
    if (existing && String(q.force || '') !== '1') {
      return res.json({ ok: true, duplicate: true, unmatched: true, id: existing.id });
    }

    if (payout === null) payout = 0;
    const info = db
      .prepare(
        `INSERT INTO conversions (
          clickid, click_row_id, campaign_id, offer_id, status, payout, currency, txid, raw_query
        ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(
        clickid,
        status,
        payout,
        String(q.currency || 'RUB'),
        txid,
        new URLSearchParams(q).toString(),
      );

    return res.json({
      ok: true,
      unmatched: true,
      id: Number(info.lastInsertRowid),
      payout,
      status,
      note: 'click not found — postback accepted (LeadGid/network OK)',
    });
  }

  if (payout === null) {
    payout = status === 'sale' || status === 'lead' ? Number(click.offer_payout || 0) : 0;
  }

  const existing = db
    .prepare(`SELECT id FROM conversions WHERE clickid = ? AND status = ? LIMIT 1`)
    .get(clickid, status);

  if (existing && String(q.force || '') !== '1') {
    return res.json({ ok: true, duplicate: true, id: existing.id });
  }

  const currency = String(q.currency || click.offer_currency || 'RUB');
  const info = db
    .prepare(
      `INSERT INTO conversions (
        clickid, click_row_id, campaign_id, offer_id, status, payout, currency, txid, raw_query
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      clickid,
      click.id,
      click.campaign_id,
      click.offer_id,
      status,
      payout,
      currency,
      txid,
      new URLSearchParams(q).toString(),
    );

  // Outbound to ad network / source — async, do not block affiliate response
  fireSourcePostback({ click, status, payout, currency, txid }).catch((err) => {
    console.warn('[postback] source notify failed', err.message);
  });

  res.json({ ok: true, id: Number(info.lastInsertRowid), payout, status });
}

router.get('/postback', handlePostback);
router.post('/postback', handlePostback);

export default router;
