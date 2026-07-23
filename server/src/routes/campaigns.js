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
  'currency',
  'status',
  'unique_hours',
  'block_bots',
  'notes',
];

const router = Router();

function ownedRef(table, id, userId) {
  if (!id) return true;
  return !!db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
}

function getRotation(campaignId) {
  return db
    .prepare(
      `SELECT co.offer_id, co.weight, o.name AS offer_name
       FROM campaign_offers co
       JOIN offers o ON o.id = co.offer_id
       WHERE co.campaign_id = ?
       ORDER BY co.id ASC`
    )
    .all(campaignId);
}

function getPaths(campaignId) {
  const paths = db
    .prepare(
      `SELECT p.*, l.name AS landing_name
       FROM campaign_paths p
       LEFT JOIN landings l ON l.id = p.landing_id
       WHERE p.campaign_id = ?
       ORDER BY p.sort_order ASC, p.id ASC`
    )
    .all(campaignId);
  const offerStmt = db.prepare(
    `SELECT po.offer_id, po.weight, o.name AS offer_name
     FROM path_offers po
     JOIN offers o ON o.id = po.offer_id
     WHERE po.path_id = ?`
  );
  return paths.map((p) => ({ ...p, offers: offerStmt.all(p.id) }));
}

function getRules(campaignId) {
  const rules = db
    .prepare(
      `SELECT * FROM campaign_rules WHERE campaign_id = ? ORDER BY priority ASC, id ASC`
    )
    .all(campaignId);
  const condStmt = db.prepare(`SELECT field, operator, value FROM rule_conditions WHERE rule_id = ?`);
  return rules.map((r) => ({ ...r, conditions: condStmt.all(r.id) }));
}

function saveRotation(campaignId, offers, userId) {
  const list = Array.isArray(offers) ? offers : [];
  db.prepare(`DELETE FROM campaign_offers WHERE campaign_id = ?`).run(campaignId);
  const insert = db.prepare(
    `INSERT INTO campaign_offers (campaign_id, offer_id, weight) VALUES (?, ?, ?)`
  );
  for (const item of list) {
    const offerId = Number(item.offer_id);
    const weight = Math.max(0, Number(item.weight || 0));
    if (!offerId || weight <= 0) continue;
    if (!ownedRef('offers', offerId, userId)) {
      throw Object.assign(new Error('Invalid offer in rotation'), { status: 400 });
    }
    insert.run(campaignId, offerId, weight);
  }
}

function savePathsAndRules(campaignId, paths, rules, userId) {
  // wipe existing (cascade deletes path_offers / conditions via FK? path_offers cascades from paths;
  // rules cascade conditions. But rules reference paths - delete rules first)
  db.prepare(`DELETE FROM campaign_rules WHERE campaign_id = ?`).run(campaignId);
  db.prepare(`DELETE FROM campaign_paths WHERE campaign_id = ?`).run(campaignId);

  const insertPath = db.prepare(
    `INSERT INTO campaign_paths (campaign_id, name, weight, landing_id, enabled, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPathOffer = db.prepare(
    `INSERT INTO path_offers (path_id, offer_id, weight) VALUES (?, ?, ?)`
  );
  const insertRule = db.prepare(
    `INSERT INTO campaign_rules (campaign_id, name, priority, enabled, path_id)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertCond = db.prepare(
    `INSERT INTO rule_conditions (rule_id, field, operator, value) VALUES (?, ?, ?, ?)`
  );

  const pathIdMap = new Map(); // client temp id / index -> real id
  const list = Array.isArray(paths) ? paths : [];

  list.forEach((p, idx) => {
    const landingId = p.landing_id ? Number(p.landing_id) : null;
    if (landingId && !ownedRef('landings', landingId, userId)) {
      throw Object.assign(new Error('Invalid landing in path'), { status: 400 });
    }
    const info = insertPath.run(
      campaignId,
      String(p.name || `Path ${idx + 1}`),
      Math.max(0, Number(p.weight || 100)),
      landingId,
      p.enabled === false || p.enabled === 0 ? 0 : 1,
      p.is_default ? 1 : 0,
      Number(p.sort_order ?? idx)
    );
    const pathId = Number(info.lastInsertRowid);
    pathIdMap.set(String(p.client_id || p.id || idx), pathId);
    pathIdMap.set(`idx:${idx}`, pathId);

    for (const o of p.offers || []) {
      const offerId = Number(o.offer_id);
      const weight = Math.max(0, Number(o.weight || 0));
      if (!offerId || weight <= 0) continue;
      if (!ownedRef('offers', offerId, userId)) {
        throw Object.assign(new Error('Invalid offer in path'), { status: 400 });
      }
      insertPathOffer.run(pathId, offerId, weight);
    }
  });

  // ensure at least one default
  if (list.length) {
    const defaults = db
      .prepare(`SELECT id FROM campaign_paths WHERE campaign_id = ? AND is_default = 1`)
      .all(campaignId);
    if (!defaults.length) {
      const first = db
        .prepare(`SELECT id FROM campaign_paths WHERE campaign_id = ? ORDER BY id ASC LIMIT 1`)
        .get(campaignId);
      if (first) {
        db.prepare(`UPDATE campaign_paths SET is_default = 1 WHERE id = ?`).run(first.id);
      }
    }
  }

  for (const r of Array.isArray(rules) ? rules : []) {
    let pathId = null;
    if (r.path_id != null && r.path_id !== '') {
      pathId = pathIdMap.get(String(r.path_id)) || Number(r.path_id) || null;
      // verify belongs to campaign
      if (pathId) {
        const ok = db
          .prepare(`SELECT id FROM campaign_paths WHERE id = ? AND campaign_id = ?`)
          .get(pathId, campaignId);
        if (!ok) pathId = null;
      }
    }
    const info = insertRule.run(
      campaignId,
      String(r.name || 'Rule'),
      Number(r.priority || 100),
      r.enabled === false || r.enabled === 0 ? 0 : 1,
      pathId
    );
    const ruleId = Number(info.lastInsertRowid);
    for (const c of r.conditions || []) {
      if (!c.field || !c.value) continue;
      insertCond.run(
        ruleId,
        String(c.field),
        String(c.operator || 'eq'),
        String(c.value)
      );
    }
  }

  // sync legacy campaign_offers from default path
  const def = db
    .prepare(
      `SELECT id FROM campaign_paths WHERE campaign_id = ? AND is_default = 1 ORDER BY id ASC LIMIT 1`
    )
    .get(campaignId);
  if (def) {
    const offers = db
      .prepare(`SELECT offer_id, weight FROM path_offers WHERE path_id = ?`)
      .all(def.id);
    saveRotation(
      campaignId,
      offers.map((o) => ({ offer_id: o.offer_id, weight: o.weight })),
      userId
    );
    const land = db.prepare(`SELECT landing_id FROM campaign_paths WHERE id = ?`).get(def.id);
    const firstOffer = offers[0];
    db.prepare(`UPDATE campaigns SET landing_id = ?, offer_id = ? WHERE id = ?`).run(
      land?.landing_id || null,
      firstOffer?.offer_id || null,
      campaignId
    );
  }
}

function withExtras(row) {
  if (!row) return row;
  return {
    ...row,
    rotation: getRotation(row.id),
    paths: getPaths(row.id),
    rules: getRules(row.id),
  };
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
  res.json(db.prepare(sql).all(...params).map(withExtras));
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
  res.json(withExtras(row));
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
  data.unique_hours = Math.max(1, Number(data.unique_hours || 24));
  data.block_bots = data.block_bots ? 1 : 0;

  const srcId = data.traffic_source_id ? Number(data.traffic_source_id) : null;
  let offerId = data.offer_id ? Number(data.offer_id) : null;
  const landId = data.landing_id ? Number(data.landing_id) : null;
  const rotation = Array.isArray(req.body.rotation) ? req.body.rotation : null;
  if (rotation?.length && !offerId) offerId = Number(rotation[0].offer_id) || null;

  data.traffic_source_id = srcId;
  data.offer_id = offerId;
  data.landing_id = landId;

  if (
    !ownedRef('traffic_sources', srcId, req.user.id) ||
    !ownedRef('offers', offerId, req.user.id) ||
    !ownedRef('landings', landId, req.user.id)
  ) {
    return res.status(400).json({ error: 'Invalid source/offer/landing' });
  }

  const keys = Object.keys(data);
  const placeholders = keys.map((k) => `@${k}`).join(', ');
  try {
    const tx = db.transaction(() => {
      const info = db
        .prepare(`INSERT INTO campaigns (${keys.join(', ')}) VALUES (${placeholders})`)
        .run(data);
      const id = Number(info.lastInsertRowid);

      if (Array.isArray(req.body.paths) && req.body.paths.length) {
        savePathsAndRules(id, req.body.paths, req.body.rules || [], req.user.id);
      } else {
        const rot =
          rotation?.length
            ? rotation
            : offerId
              ? [{ offer_id: offerId, weight: 100 }]
              : [];
        savePathsAndRules(
          id,
          [
            {
              client_id: 'default',
              name: 'Default',
              weight: 100,
              landing_id: landId,
              is_default: 1,
              offers: rot,
            },
          ],
          req.body.rules || [],
          req.user.id
        );
      }
      return id;
    });
    const id = tx();
    res.status(201).json(withExtras(db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id)));
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
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
  if (data.unique_hours !== undefined) {
    data.unique_hours = Math.max(1, Number(data.unique_hours || 24));
  }
  if (data.block_bots !== undefined) data.block_bots = data.block_bots ? 1 : 0;

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
  try {
    const tx = db.transaction(() => {
      if (keys.length) {
        const sets = keys.map((k) => `${k} = @${k}`).join(', ');
        db.prepare(`UPDATE campaigns SET ${sets} WHERE id = @id AND user_id = @user_id`).run(data);
      }
      if (Array.isArray(req.body.paths)) {
        savePathsAndRules(id, req.body.paths, req.body.rules || [], req.user.id);
      } else if (Array.isArray(req.body.rotation)) {
        saveRotation(id, req.body.rotation, req.user.id);
      }
    });
    tx();
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Campaign key already exists' });
    }
    throw e;
  }
  res.json(withExtras(db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id)));
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare(`DELETE FROM campaigns WHERE id = ? AND user_id = ?`)
    .run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
