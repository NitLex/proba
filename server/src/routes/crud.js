import { Router } from 'express';
import { db } from '../db.js';

export function crudRouter(table, { searchable = ['name'], createFields, updateFields }) {
  const router = Router();

  router.get('/', (req, res) => {
    const q = String(req.query.q || '').trim();
    let rows;
    if (q && searchable.length) {
      const where = searchable.map((f) => `${f} LIKE ?`).join(' OR ');
      const params = searchable.map(() => `%${q}%`);
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY id DESC`).all(...params);
    } else {
      rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    const data = {};
    for (const f of createFields) {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    }
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'Empty body' });
    const placeholders = keys.map((k) => `@${k}`).join(', ');
    const info = db
      .prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`)
      .run(data);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(info.lastInsertRowid));
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const data = { id };
    for (const f of updateFields) {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    }
    const keys = Object.keys(data).filter((k) => k !== 'id');
    if (!keys.length) return res.status(400).json({ error: 'Empty body' });
    const sets = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id`).run(data);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  return router;
}
