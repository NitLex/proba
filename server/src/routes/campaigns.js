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
  `;
  const params = [];
  if (q) {
    sql += ` WHERE c.name LIKE ? OR c.key LIKE ?`;
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
       WHERE c.id = ?`
    )
    .get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const data = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (!data.name) return res.status(400).json({ error: 'name required' });
  if (!data.key) data.key = makeCampaignKey();
  data.cost_model = data.cost_model || 'cpc';
  data.cost_value = Number(data.cost_value || 0);
  data.status = data.status || 'active';

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
  const existing = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = { id };
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  const keys = Object.keys(data).filter((k) => k !== 'id');
  if (!keys.length) return res.status(400).json({ error: 'Empty body' });
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  try {
    db.prepare(`UPDATE campaigns SET ${sets} WHERE id = @id`).run(data);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Campaign key already exists' });
    }
    throw e;
  }
  res.json(db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
