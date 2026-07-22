import { Router } from 'express';
import { db } from '../db.js';
import { parseCost } from '../lib/tracking.js';

const router = Router();

/**
 * Network postback endpoint.
 * Example: /postback?clickid={clickid}&payout={payout}&status=approved&txid={txid}
 */
router.get('/postback', (req, res) => {
  const clickid = String(req.query.clickid || req.query.cid || req.query.external_id || '');
  if (!clickid) {
    return res.status(400).json({ ok: false, error: 'clickid required' });
  }

  const click = db
    .prepare(
      `SELECT cl.*, o.payout AS offer_payout, o.currency AS offer_currency
       FROM clicks cl
       LEFT JOIN offers o ON o.id = cl.offer_id
       WHERE cl.clickid = ?`
    )
    .get(clickid);

  if (!click) {
    return res.status(404).json({ ok: false, error: 'click not found' });
  }

  const statusRaw = String(req.query.status || req.query.event || 'lead').toLowerCase();
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
  const status = statusMap[statusRaw] || statusRaw;

  let payout = parseCost(req.query.payout ?? req.query.sum ?? req.query.amount, null);
  if (payout === null) {
    payout = status === 'sale' || status === 'lead' ? Number(click.offer_payout || 0) : 0;
  }

  const existing = db
    .prepare(`SELECT id FROM conversions WHERE clickid = ? AND status = ? LIMIT 1`)
    .get(clickid, status);

  if (existing && String(req.query.force || '') !== '1') {
    return res.json({ ok: true, duplicate: true, id: existing.id });
  }

  const info = db
    .prepare(
      `INSERT INTO conversions (
        clickid, click_row_id, campaign_id, offer_id, status, payout, currency, txid, raw_query
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clickid,
      click.id,
      click.campaign_id,
      click.offer_id,
      status,
      payout,
      String(req.query.currency || click.offer_currency || 'USD'),
      String(req.query.txid || req.query.transaction_id || ''),
      new URLSearchParams(req.query).toString()
    );

  res.json({ ok: true, id: Number(info.lastInsertRowid), payout, status });
});

export default router;
