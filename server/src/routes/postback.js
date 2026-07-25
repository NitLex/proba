import { Router } from 'express';
import { db } from '../db.js';
import { parseCost } from '../lib/tracking.js';

const router = Router();

/**
 * Network postback endpoint (Binom-style).
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

  const statusRaw = String(req.query.status || req.query.event || 'lead').toLowerCase();
  const statusMap = {
    lead: 'lead',
    sale: 'sale',
    approved: 'sale',
    approve: 'sale',
    confirmed: 'sale',
    paid: 'sale',
    dep: 'sale',
    deposit: 'sale',
    goal: 'sale',
    rejected: 'rejected',
    reject: 'rejected',
    declined: 'rejected',
    trash: 'rejected',
    hold: 'hold',
    pending: 'hold',
    waiting: 'hold',
  };
  const status = statusMap[statusRaw] || statusRaw;

  let payout = parseCost(req.query.payout ?? req.query.sum ?? req.query.amount, null);
  if (payout === null) {
    payout = status === 'sale' || status === 'lead' ? Number(click?.offer_payout || 0) : 0;
  }

  // LeadGid / network URL testers often send placeholder clickids (e.g. aff_sub_value).
  // Always acknowledge with HTTP 200 so the network marks postback as delivered.
  if (!click) {
    const info = db
      .prepare(
        `INSERT INTO conversions (
          clickid, click_row_id, campaign_id, offer_id, status, payout, currency, txid, raw_query
        ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`
      )
      .run(
        clickid,
        status,
        payout ?? 0,
        String(req.query.currency || 'RUB'),
        String(req.query.txid || req.query.transaction_id || ''),
        new URLSearchParams(req.query).toString()
      );
    return res.json({
      ok: true,
      unmatched: true,
      id: Number(info.lastInsertRowid),
      payout: payout ?? 0,
      status,
    });
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
