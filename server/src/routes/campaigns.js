import { Router } from 'express';
import { db } from '../db.js';
import { makeCampaignKey } from '../lib/tracking.js';

const fields = [
  'name',
  'key',
  'traffic_source_id',
  'offer_id',
  'landing_id',
  'cost_model',
  'cost_value',
  'status',
  'notes',
];

const router = Router();

function ownedRef(table, id, userId) {
  if (!id) return true;
  return !!db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  let sql = `
    SELECT c.*,
      o.name AS offer_name,
      l.name AS landing_name,
      s.name AS source_name
    FROM campaigns c
    LEFT JOIN offers o ON o.id = c.offer_id
    LEFT JOIN landings l ON l.id = c.landing_id
    LEFT JOIN traffic_sources s ON s.id = c.traffic_source_id
    WHERE c.user_id = ?
  `;
  const params = [req.user.id];
  if (q) {
    sql += ` AND (c.name LIKE ? OR c.key LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY c.id DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare(
      `SELECT c.*, o.name AS offer_name, l.name AS landing_name, s.name AS source_name
       FROM campaigns c
       LEFT JOIN offers o ON o.id = c.offer_id
       LEFT JOIN landings l ON l.id = c.landing_id
       LEFT JOIN traffic_sources s ON s.id = c.traffic_source_id
       WHERE c.id = ? AND c.user_id = ?`
    )
    .get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const data = { user_id: req.user.id };
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (!data.name) return res.status(400).json({ error: 'name required' });
  if (!data.key) data.key = makeCampaignKey();
  data.cost_model = data.cost_model || 'cpc';
  data.cost_value = Number(data.cost_value || 0);
  data.status = data.status || 'active';

  const srcId = data.traffic_source_id ? Number(data.traffic_source_id) : null;
  const offerId = data.offer_id ? Number(data.offer_id) : null;
  const landId = data.landing_id ? Number(data.landing_id) : null;
  data.traffic_source_id = srcId;
  data.offer_id = offerId;
  data.landing_id = landId;

  if (!ownedRef('traffic_sources', srcId, req.user.id) ||
      !ownedRef('offers', offerId, req.user.id) ||
      !ownedRef('landings', landId, req.user.id)) {
    return res.status(400).json({ error: 'Invalid source/offer/landing' });
  }

  const keys = Object.keys(data);
  const placeholders = keys.map((k) => `@${k}`).join(', ');
  try {
    const info = db
      .prepare(`INSERT INTO campaigns (${keys.join(', ')}) VALUES (${placeholders})`)
      .run(data);
    const row = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(Number(info.lastInsertRowid));
    res.status(201).json(row);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Campaign key already exists' });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare(`SELECT * FROM campaigns WHERE id = ? AND user_id = ?`)
    .get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = { id, user_id: req.user.id };
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }

  if (data.traffic_source_id !== undefined) {
    data.traffic_source_id = data.traffic_source_id ? Number(data.traffic_source_id) : null;
    if (!ownedRef('traffic_sources', data.traffic_source_id, req.user.id)) {
      return res.status(400).json({ error: 'Invalid source' });
    }
  }
  if (data.offer_id !== undefined) {
    data.offer_id = data.offer_id ? Number(data.offer_id) : null;
    if (!ownedRef('offers', data.offer_id, req.user.id)) {
      return res.status(400).json({ error: 'Invalid offer' });
    }
  }
  if (data.landing_id !== undefined) {
    data.landing_id = data.landing_id ? Number(data.landing_id) : null;
    if (!ownedRef('landings', data.landing_id, req.user.id)) {
      return res.status(400).json({ error: 'Invalid landing' });
    }
  }

  const keys = Object.keys(data).filter((k) => k !== 'id' && k !== 'user_id');
  if (!keys.length) return res.status(400).json({ error: 'Empty body' });
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  try {
    db.prepare(`UPDATE campaigns SET ${sets} WHERE id = @id AND user_id = @user_id`).run(data);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Campaign key already exists' });
    }
    throw e;
  }
  res.json(db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare(`DELETE FROM campaigns WHERE id = ? AND user_id = ?`)
    .run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
