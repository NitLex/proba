import { Router } from 'express';
import { db } from '../db.js';
import { toCsv } from '../lib/tracking.js';

const router = Router();

function dateFilter(from, to, column = 'created_at') {
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push(`${column} >= ?`);
    params.push(from.length === 10 ? `${from} 00:00:00` : from);
  }
  if (to) {
    clauses.push(`${column} <= ?`);
    params.push(to.length === 10 ? `${to} 23:59:59` : to);
  }
  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
}

/** Dominant currency for aggregated stats (by period click volume, else latest campaign). */
function userDisplayCurrency(uid, from, to) {
  const cf = dateFilter(from, to, 'cl.created_at');
  const top = db
    .prepare(
      `SELECT COALESCE(NULLIF(c.currency, ''), 'RUB') AS currency, COUNT(*) AS cnt
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ? AND ${cf.sql}
       GROUP BY c.currency
       ORDER BY cnt DESC
       LIMIT 1`
    )
    .get(uid, ...cf.params);
  if (top?.currency) return top.currency;

  const latest = db
    .prepare(
      `SELECT COALESCE(NULLIF(currency, ''), 'RUB') AS currency
       FROM campaigns WHERE user_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(uid);
  if (latest?.currency) return latest.currency;

  const offerCur = db
    .prepare(
      `SELECT COALESCE(NULLIF(currency, ''), 'RUB') AS currency
       FROM offers WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(uid);
  return offerCur?.currency || 'RUB';
}

router.get('/overview', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const currency = userDisplayCurrency(uid, from, to);
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const clicks = db
    .prepare(
      `SELECT
        COUNT(*) AS clicks,
        COALESCE(SUM(cl.is_unique), 0) AS uniques,
        COALESCE(SUM(CASE WHEN cl.is_bot = 0 THEN 1 ELSE 0 END), 0) AS real_clicks,
        COALESCE(SUM(cl.cost), 0) AS cost
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ? AND ${cf.sql}`
    )
    .get(uid, ...cf.params);

  const conv = db
    .prepare(
      `SELECT
        COUNT(*) AS conversions,
        COALESCE(SUM(CASE WHEN cv.status = 'sale' THEN 1 ELSE 0 END), 0) AS sales,
        COALESCE(SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END), 0) AS revenue
       FROM conversions cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.user_id = ? AND ${vf.sql}`
    )
    .get(uid, ...vf.params);

  const cost = Number(clicks.cost || 0);
  const revenue = Number(conv.revenue || 0);
  const profit = revenue - cost;
  const clickCount = Number(clicks.clicks || 0);
  const conversions = Number(conv.conversions || 0);

  res.json({
    clicks: clickCount,
    uniques: Number(clicks.uniques || 0),
    real_clicks: Number(clicks.real_clicks || 0),
    conversions,
    sales: Number(conv.sales || 0),
    cost: round(cost),
    revenue: round(revenue),
    profit: round(profit),
    roi: cost > 0 ? round((profit / cost) * 100) : null,
    cr: clickCount > 0 ? round((conversions / clickCount) * 100) : 0,
    epc: clickCount > 0 ? round(revenue / clickCount) : 0,
    cpa: conversions > 0 ? round(cost / conversions) : null,
    currency,
  });
});

router.get('/by-campaign', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const rows = db
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.key,
        c.status,
        COALESCE(NULLIF(c.currency, ''), 'RUB') AS currency,
        COALESCE(s.name, '—') AS source_name,
        COALESCE(o.name, '—') AS offer_name,
        COUNT(cl.id) AS clicks,
        COALESCE(SUM(cl.is_unique), 0) AS uniques,
        COALESCE(SUM(cl.cost), 0) AS cost,
        COALESCE(cv.conversions, 0) AS conversions,
        COALESCE(cv.sales, 0) AS sales,
        COALESCE(cv.revenue, 0) AS revenue
      FROM campaigns c
      LEFT JOIN traffic_sources s ON s.id = c.traffic_source_id
      LEFT JOIN offers o ON o.id = c.offer_id
      LEFT JOIN clicks cl ON cl.campaign_id = c.id AND ${cf.sql}
      LEFT JOIN (
        SELECT campaign_id,
          COUNT(*) AS conversions,
          SUM(CASE WHEN status = 'sale' THEN 1 ELSE 0 END) AS sales,
          SUM(CASE WHEN status IN ('lead','sale') THEN payout ELSE 0 END) AS revenue
        FROM conversions cv
        WHERE ${vf.sql}
        GROUP BY campaign_id
      ) cv ON cv.campaign_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY clicks DESC, c.id DESC`
    )
    .all(...cf.params, ...vf.params, uid);

  const enriched = rows.map(enrichRow);
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(res, 'by-campaign.csv', enriched, statsColumns(true));
  }
  res.json(enriched);
});

router.get('/by-path', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const rows = db
    .prepare(
      `SELECT
        COALESCE(p.id, 0) AS id,
        COALESCE(p.name, '(no path)') AS name,
        c.id AS campaign_id,
        c.name AS campaign_name,
        COALESCE(NULLIF(c.currency, ''), 'RUB') AS currency,
        COUNT(cl.id) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost,
        COALESCE(cv.conversions, 0) AS conversions,
        COALESCE(cv.revenue, 0) AS revenue
      FROM clicks cl
      JOIN campaigns c ON c.id = cl.campaign_id
      LEFT JOIN campaign_paths p ON p.id = cl.path_id
      LEFT JOIN (
        SELECT
          COALESCE(cl2.path_id, 0) AS path_key,
          cl2.campaign_id,
          COUNT(*) AS conversions,
          SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END) AS revenue
        FROM conversions cv
        JOIN clicks cl2 ON cl2.id = cv.click_row_id
        WHERE ${vf.sql}
        GROUP BY COALESCE(cl2.path_id, 0), cl2.campaign_id
      ) cv ON cv.path_key = COALESCE(cl.path_id, 0) AND cv.campaign_id = cl.campaign_id
      WHERE c.user_id = ? AND ${cf.sql}
      GROUP BY c.id, COALESCE(p.id, 0)
      ORDER BY clicks DESC`,
    )
    .all(...vf.params, uid, ...cf.params);

  const enriched = rows.map((r) =>
    enrichRow({
      ...r,
      name: `${r.campaign_name} · ${r.name}`,
    }),
  );
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(res, 'by-path.csv', enriched, statsColumns());
  }
  res.json(enriched);
});

router.get('/by-rule', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const rows = db
    .prepare(
      `SELECT
        COALESCE(r.id, 0) AS id,
        COALESCE(r.name, '(default / no rule)') AS name,
        c.id AS campaign_id,
        c.name AS campaign_name,
        COALESCE(NULLIF(c.currency, ''), 'RUB') AS currency,
        COUNT(cl.id) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost,
        COALESCE(cv.conversions, 0) AS conversions,
        COALESCE(cv.revenue, 0) AS revenue
      FROM clicks cl
      JOIN campaigns c ON c.id = cl.campaign_id
      LEFT JOIN campaign_rules r ON r.id = cl.rule_id
      LEFT JOIN (
        SELECT
          COALESCE(cl2.rule_id, 0) AS rule_key,
          cl2.campaign_id,
          COUNT(*) AS conversions,
          SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END) AS revenue
        FROM conversions cv
        JOIN clicks cl2 ON cl2.id = cv.click_row_id
        WHERE ${vf.sql}
        GROUP BY COALESCE(cl2.rule_id, 0), cl2.campaign_id
      ) cv ON cv.rule_key = COALESCE(cl.rule_id, 0) AND cv.campaign_id = cl.campaign_id
      WHERE c.user_id = ? AND ${cf.sql}
      GROUP BY c.id, COALESCE(r.id, 0)
      ORDER BY clicks DESC`,
    )
    .all(...vf.params, uid, ...cf.params);

  const enriched = rows.map((r) =>
    enrichRow({
      ...r,
      name: `${r.campaign_name} · ${r.name}`,
    }),
  );
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(res, 'by-rule.csv', enriched, statsColumns());
  }
  res.json(enriched);
});

router.get('/by-offer', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const rows = db
    .prepare(
      `SELECT
        o.id,
        o.name,
        o.network,
        o.geo,
        o.payout,
        COALESCE(NULLIF(o.currency, ''), 'RUB') AS currency,
        COUNT(cl.id) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost,
        COALESCE(cv.conversions, 0) AS conversions,
        COALESCE(cv.revenue, 0) AS revenue
      FROM offers o
      LEFT JOIN clicks cl ON cl.offer_id = o.id AND ${cf.sql}
      LEFT JOIN (
        SELECT offer_id,
          COUNT(*) AS conversions,
          SUM(CASE WHEN status IN ('lead','sale') THEN payout ELSE 0 END) AS revenue
        FROM conversions cv
        WHERE ${vf.sql}
        GROUP BY offer_id
      ) cv ON cv.offer_id = o.id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY clicks DESC`
    )
    .all(...cf.params, ...vf.params, uid);

  const enriched = rows.map(enrichRow);
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(res, 'by-offer.csv', enriched, statsColumns());
  }
  res.json(enriched);
});

router.get('/by-source', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const rows = db
    .prepare(
      `SELECT
        s.id,
        s.name,
        COALESCE(NULLIF(s.currency, ''), 'RUB') AS currency,
        COUNT(cl.id) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost,
        COALESCE(cv.conversions, 0) AS conversions,
        COALESCE(cv.revenue, 0) AS revenue
      FROM traffic_sources s
      LEFT JOIN clicks cl ON cl.traffic_source_id = s.id AND ${cf.sql}
      LEFT JOIN (
        SELECT cl2.traffic_source_id AS source_id,
          COUNT(cv.id) AS conversions,
          SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END) AS revenue
        FROM conversions cv
        JOIN clicks cl2 ON cl2.clickid = cv.clickid
        WHERE ${vf.sql}
        GROUP BY cl2.traffic_source_id
      ) cv ON cv.source_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY clicks DESC`
    )
    .all(...cf.params, ...vf.params, uid);

  const enriched = rows.map(enrichRow);
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(res, 'by-source.csv', enriched, statsColumns());
  }
  res.json(enriched);
});

router.get('/by-day', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const currency = userDisplayCurrency(uid, from, to);
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const clickDays = db
    .prepare(
      `SELECT date(cl.created_at) AS day,
        COUNT(*) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ? AND ${cf.sql}
       GROUP BY date(cl.created_at)
       ORDER BY day`
    )
    .all(uid, ...cf.params);

  const convDays = db
    .prepare(
      `SELECT date(cv.created_at) AS day,
        COUNT(*) AS conversions,
        COALESCE(SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END), 0) AS revenue
       FROM conversions cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.user_id = ? AND ${vf.sql}
       GROUP BY date(cv.created_at)`
    )
    .all(uid, ...vf.params);

  const map = new Map();
  for (const r of clickDays) {
    map.set(r.day, {
      day: r.day,
      clicks: r.clicks,
      cost: Number(r.cost),
      conversions: 0,
      revenue: 0,
    });
  }
  for (const r of convDays) {
    const cur = map.get(r.day) || { day: r.day, clicks: 0, cost: 0, conversions: 0, revenue: 0 };
    cur.conversions = r.conversions;
    cur.revenue = Number(r.revenue);
    map.set(r.day, cur);
  }

  const enriched = [...map.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => enrichRow({ ...r, currency }));
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(
      res,
      'by-day.csv',
      enriched.map((r) => ({ ...r, name: r.day })),
      statsColumns()
    );
  }
  res.json(enriched);
});

router.get('/by-token', (req, res) => {
  const uid = req.user.id;
  const { from, to } = req.query;
  const currency = userDisplayCurrency(uid, from, to);
  const tokenField = ['token1', 'token2', 'token3', 'token4', 'token5'].includes(
    String(req.query.token || '')
  )
    ? String(req.query.token)
    : 'token1';
  const cf = dateFilter(from, to, 'cl.created_at');
  const vf = dateFilter(from, to, 'cv.created_at');

  const clickRows = db
    .prepare(
      `SELECT
        CASE WHEN cl.${tokenField} IS NULL OR cl.${tokenField} = '' THEN '(empty)' ELSE cl.${tokenField} END AS name,
        COUNT(cl.id) AS clicks,
        COALESCE(SUM(cl.cost), 0) AS cost,
        COALESCE(SUM(cl.is_unique), 0) AS uniques
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ? AND ${cf.sql}
       GROUP BY name`
    )
    .all(uid, ...cf.params);

  const convRows = db
    .prepare(
      `SELECT
        CASE WHEN cl.${tokenField} IS NULL OR cl.${tokenField} = '' THEN '(empty)' ELSE cl.${tokenField} END AS name,
        COUNT(cv.id) AS conversions,
        COALESCE(SUM(CASE WHEN cv.status IN ('lead','sale') THEN cv.payout ELSE 0 END), 0) AS revenue
       FROM conversions cv
       JOIN clicks cl ON cl.clickid = cv.clickid
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.user_id = ? AND ${vf.sql}
       GROUP BY name`
    )
    .all(uid, ...vf.params);

  const map = new Map();
  for (const r of clickRows) {
    map.set(r.name, {
      name: r.name,
      clicks: r.clicks,
      cost: Number(r.cost),
      uniques: Number(r.uniques),
      conversions: 0,
      revenue: 0,
    });
  }
  for (const r of convRows) {
    const cur = map.get(r.name) || {
      name: r.name,
      clicks: 0,
      cost: 0,
      uniques: 0,
      conversions: 0,
      revenue: 0,
    };
    cur.conversions = r.conversions;
    cur.revenue = Number(r.revenue);
    map.set(r.name, cur);
  }

  const enriched = [...map.values()]
    .sort((a, b) => b.clicks - a.clicks)
    .map((r) => enrichRow({ ...r, currency }));
  if (String(req.query.format || '') === 'csv') {
    return sendCsv(res, 'by-token.csv', enriched, statsColumns());
  }
  res.json(enriched);
});

router.get('/export/:kind', (req, res) => {
  const kind = String(req.params.kind || '');
  if (kind === 'clicks') {
    const rows = db
      .prepare(
        `SELECT cl.created_at, cl.clickid, c.name AS campaign_name, o.name AS offer_name,
                s.name AS source_name, cl.country, cl.device, cl.cost, cl.is_unique, cl.is_bot,
                cl.token1, cl.token2, cl.token3, cl.token4, cl.token5
         FROM clicks cl
         JOIN campaigns c ON c.id = cl.campaign_id
         LEFT JOIN offers o ON o.id = cl.offer_id
         LEFT JOIN traffic_sources s ON s.id = cl.traffic_source_id
         WHERE c.user_id = ?
         ORDER BY cl.id DESC
         LIMIT 5000`
      )
      .all(req.user.id);
    return sendCsv(res, 'clicks.csv', rows, [
      { key: 'created_at', label: 'created_at' },
      { key: 'clickid', label: 'clickid' },
      { key: 'campaign_name', label: 'campaign' },
      { key: 'offer_name', label: 'offer' },
      { key: 'source_name', label: 'source' },
      { key: 'country', label: 'country' },
      { key: 'device', label: 'device' },
      { key: 'cost', label: 'cost' },
      { key: 'is_unique', label: 'unique' },
      { key: 'is_bot', label: 'bot' },
      { key: 'token1', label: 'token1' },
      { key: 'token2', label: 'token2' },
      { key: 'token3', label: 'token3' },
      { key: 'token4', label: 'token4' },
      { key: 'token5', label: 'token5' },
    ]);
  }
  if (kind === 'conversions') {
    const rows = db
      .prepare(
        `SELECT cv.created_at, cv.clickid, c.name AS campaign_name, o.name AS offer_name,
                cv.status, cv.payout, cv.currency, cv.txid
         FROM conversions cv
         JOIN campaigns c ON c.id = cv.campaign_id
         LEFT JOIN offers o ON o.id = cv.offer_id
         WHERE c.user_id = ?
         ORDER BY cv.id DESC
         LIMIT 5000`
      )
      .all(req.user.id);
    return sendCsv(res, 'conversions.csv', rows, [
      { key: 'created_at', label: 'created_at' },
      { key: 'clickid', label: 'clickid' },
      { key: 'campaign_name', label: 'campaign' },
      { key: 'offer_name', label: 'offer' },
      { key: 'status', label: 'status' },
      { key: 'payout', label: 'payout' },
      { key: 'currency', label: 'currency' },
      { key: 'txid', label: 'txid' },
    ]);
  }
  return res.status(400).json({ error: 'Use format=csv on report endpoints, or clicks/conversions' });
});

router.get('/recent-clicks', (req, res) => {
  const uid = req.user.id;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { from, to, q, campaign_id: campaignId } = req.query;
  const cf = dateFilter(from, to, 'cl.created_at');
  const params = [uid, ...cf.params];
  let extra = '';
  if (campaignId) {
    extra += ' AND cl.campaign_id = ?';
    params.push(Number(campaignId));
  }
  if (q) {
    extra += ' AND (cl.clickid LIKE ? OR c.name LIKE ? OR IFNULL(cl.country, "") LIKE ? OR IFNULL(cl.token1, "") LIKE ?)';
    const like = `%${String(q)}%`;
    params.push(like, like, like, like);
  }
  params.push(limit);
  const rows = db
    .prepare(
      `SELECT cl.*, c.name AS campaign_name, c.currency AS currency,
              o.name AS offer_name, s.name AS source_name
       FROM clicks cl
       JOIN campaigns c ON c.id = cl.campaign_id
       LEFT JOIN offers o ON o.id = cl.offer_id
       LEFT JOIN traffic_sources s ON s.id = cl.traffic_source_id
       WHERE c.user_id = ? AND ${cf.sql}${extra}
       ORDER BY cl.id DESC
       LIMIT ?`
    )
    .all(...params);
  res.json(rows);
});

router.get('/recent-conversions', (req, res) => {
  const uid = req.user.id;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { from, to, q, campaign_id: campaignId, status } = req.query;
  const vf = dateFilter(from, to, 'cv.created_at');
  const params = [uid, ...vf.params];
  let extra = '';
  if (campaignId) {
    extra += ' AND cv.campaign_id = ?';
    params.push(Number(campaignId));
  }
  if (status) {
    extra += ' AND cv.status = ?';
    params.push(String(status));
  }
  if (q) {
    extra += ' AND (cv.clickid LIKE ? OR c.name LIKE ? OR IFNULL(o.name, "") LIKE ? OR IFNULL(cv.txid, "") LIKE ?)';
    const like = `%${String(q)}%`;
    params.push(like, like, like, like);
  }
  params.push(limit);
  const rows = db
    .prepare(
      `SELECT cv.*, c.name AS campaign_name, o.name AS offer_name
       FROM conversions cv
       JOIN campaigns c ON c.id = cv.campaign_id
       LEFT JOIN offers o ON o.id = cv.offer_id
       WHERE c.user_id = ? AND ${vf.sql}${extra}
       ORDER BY cv.id DESC
       LIMIT ?`
    )
    .all(...params);
  res.json(rows);
});

function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}

function enrichRow(row) {
  const clicks = Number(row.clicks || 0);
  const cost = Number(row.cost || 0);
  const revenue = Number(row.revenue || 0);
  const conversions = Number(row.conversions || 0);
  const profit = revenue - cost;
  return {
    ...row,
    currency: row.currency || 'RUB',
    clicks,
    cost: round(cost),
    revenue: round(revenue),
    conversions,
    profit: round(profit),
    roi: cost > 0 ? round((profit / cost) * 100) : null,
    cr: clicks > 0 ? round((conversions / clicks) * 100) : 0,
    epc: clicks > 0 ? round(revenue / clicks) : 0,
    cpa: conversions > 0 ? round(cost / conversions) : null,
  };
}

function statsColumns(withCampaignMeta = false) {
  const cols = [{ key: 'name', label: 'name' }];
  if (withCampaignMeta) {
    cols.push({ key: 'source_name', label: 'source' }, { key: 'offer_name', label: 'offer' });
  }
  cols.push(
    { key: 'clicks', label: 'clicks' },
    { key: 'conversions', label: 'conversions' },
    { key: 'cr', label: 'cr' },
    { key: 'cost', label: 'cost' },
    { key: 'revenue', label: 'revenue' },
    { key: 'profit', label: 'profit' },
    { key: 'roi', label: 'roi' },
    { key: 'epc', label: 'epc' },
    { key: 'cpa', label: 'cpa' }
  );
  return cols;
}

function sendCsv(res, filename, rows, columns) {
  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${csv}`);
}

export default router;
