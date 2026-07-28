import { Router } from 'express';
import { db } from '../db.js';
import { makeCampaignKey } from '../lib/tracking.js';

const FIELDS = [
  'name',
  'vertical',
  'geo',
  'source',
  'funnel',
  'payout_model',
  'bid_hint',
  'heat',
  'difficulty',
  'rating',
  'where_to_pour',
  'creatives',
  'landing_notes',
  'offer_notes',
  'risks',
  'checklist',
  'status',
  'notes',
];

const router = Router();

function pick(body, fields) {
  const data = {};
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  return data;
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const vertical = String(req.query.vertical || '').trim();
  const geo = String(req.query.geo || '').trim();
  const source = String(req.query.source || '').trim();
  const heat = String(req.query.heat || '').trim();
  const status = String(req.query.status || '').trim();

  const where = [];
  const params = [];

  if (q) {
    where.push(
      `(name LIKE ? OR vertical LIKE ? OR geo LIKE ? OR source LIKE ? OR where_to_pour LIKE ? OR notes LIKE ?)`
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (vertical) {
    where.push('vertical = ?');
    params.push(vertical);
  }
  if (geo) {
    where.push('(geo = ? OR geo LIKE ?)');
    params.push(geo, `%${geo}%`);
  }
  if (source) {
    where.push('(source = ? OR source LIKE ?)');
    params.push(source, `%${source}%`);
  }
  if (heat) {
    where.push('heat = ?');
    params.push(heat);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  const sql = `SELECT * FROM bundles ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY rating DESC, id DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/meta/filters', (_req, res) => {
  const verticals = db
    .prepare(`SELECT DISTINCT vertical FROM bundles WHERE vertical != '' ORDER BY vertical`)
    .all()
    .map((r) => r.vertical);
  const geos = db
    .prepare(`SELECT DISTINCT geo FROM bundles WHERE geo != '' ORDER BY geo`)
    .all()
    .map((r) => r.geo);
  const sources = db
    .prepare(`SELECT DISTINCT source FROM bundles WHERE source != '' ORDER BY source`)
    .all()
    .map((r) => r.source);
  res.json({ verticals, geos, sources });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM bundles WHERE id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const data = pick(req.body, FIELDS);
  if (!data.name) return res.status(400).json({ error: 'name required' });
  if (data.rating != null) data.rating = Math.max(1, Math.min(5, Number(data.rating) || 3));
  const keys = Object.keys(data);
  const placeholders = keys.map((k) => `@${k}`).join(', ');
  const info = db
    .prepare(`INSERT INTO bundles (${keys.join(', ')}) VALUES (${placeholders})`)
    .run(data);
  res.status(201).json(db.prepare(`SELECT * FROM bundles WHERE id = ?`).get(Number(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM bundles WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = pick(req.body, FIELDS);
  if (data.rating != null) data.rating = Math.max(1, Math.min(5, Number(data.rating) || 3));
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ error: 'Empty body' });
  data.id = id;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE bundles SET ${sets} WHERE id = @id`).run(data);
  res.json(db.prepare(`SELECT * FROM bundles WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare(`DELETE FROM bundles WHERE id = ?`).run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/** Create source + offer + landing + campaign from a bundle playbook */
router.post('/:id/launch', (req, res) => {
  const bundle = db.prepare(`SELECT * FROM bundles WHERE id = ?`).get(Number(req.params.id));
  if (!bundle) return res.status(404).json({ error: 'Not found' });

  const override = req.body || {};
  const uid = req.user.id;
  const payout = Number(override.payout ?? 40);
  const costValue = Number(override.cost_value ?? parseBid(bundle.bid_hint) ?? 0.25);
  const offerUrl =
    override.offer_url ||
    `https://example-aff.net/click?offer=${encodeURIComponent(bundle.vertical)}&sub1={clickid}&geo={country}`;
  const landingUrl =
    override.landing_url ||
    `https://example-landings.test/${slug(bundle.vertical)}-${slug(bundle.geo)}/?cid={clickid}`;

  const result = db.transaction(() => {
    let sourceId = override.traffic_source_id ? Number(override.traffic_source_id) : null;
    if (!sourceId) {
      const existing = db
        .prepare(
          `SELECT id FROM traffic_sources WHERE user_id = ? AND name = ? COLLATE NOCASE`,
        )
        .get(uid, bundle.source);
      if (existing) {
        sourceId = existing.id;
      } else {
        const tokens = sourceTokens(bundle.source);
        const info = db
          .prepare(
            `INSERT INTO traffic_sources (user_id, name, cost_param, currency, token1, token2, token3, notes)
             VALUES (@user_id, @name, 'cost', 'USD', @token1, @token2, @token3, @notes)`,
          )
          .run({
            user_id: uid,
            name: bundle.source,
            ...tokens,
            notes: `Авто из связки #${bundle.id}`,
          });
        sourceId = Number(info.lastInsertRowid);
      }
    }

    const offerInfo = db
      .prepare(
        `INSERT INTO offers (user_id, name, url, payout, currency, geo, network, status, notes)
         VALUES (@user_id, @name, @url, @payout, 'USD', @geo, @network, 'active', @notes)`,
      )
      .run({
        user_id: uid,
        name: override.offer_name || `${bundle.vertical} · ${bundle.geo}`,
        url: offerUrl,
        payout,
        geo: bundle.geo.split(/[,/]/)[0].trim(),
        network: override.network || 'Manual',
        notes: [bundle.offer_notes, `Связка: ${bundle.name}`].filter(Boolean).join('\n'),
      });
    const offerId = Number(offerInfo.lastInsertRowid);

    let landingId = null;
    const funnel = String(bundle.funnel || '').toLowerCase();
    if (funnel !== 'direct' && funnel !== 'direct-to-offer') {
      const landInfo = db
        .prepare(
          `INSERT INTO landings (user_id, name, url, notes) VALUES (@user_id, @name, @url, @notes)`,
        )
        .run({
          user_id: uid,
          name: override.landing_name || `Preland ${bundle.vertical} ${bundle.geo}`,
          url: landingUrl,
          notes: [bundle.landing_notes, 'CTA → /to-offer?clickid={clickid}']
            .filter(Boolean)
            .join('\n'),
        });
      landingId = Number(landInfo.lastInsertRowid);
    }

    const key = makeCampaignKey();
    const campInfo = db
      .prepare(
        `INSERT INTO campaigns (user_id, name, key, traffic_source_id, offer_id, landing_id, cost_model, cost_value, status, notes)
         VALUES (@user_id, @name, @key, @traffic_source_id, @offer_id, @landing_id, 'cpc', @cost_value, 'active', @notes)`,
      )
      .run({
        user_id: uid,
        name: override.campaign_name || `${bundle.source} → ${bundle.vertical} ${bundle.geo}`,
        key,
        traffic_source_id: sourceId,
        offer_id: offerId,
        landing_id: landingId,
        cost_value: costValue,
        notes: [
          `Запуск из связки #${bundle.id}: ${bundle.name}`,
          bundle.where_to_pour ? `Куда лить:\n${bundle.where_to_pour}` : '',
          bundle.creatives ? `Креативы:\n${bundle.creatives}` : '',
          bundle.risks ? `Риски:\n${bundle.risks}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      });

    return {
      campaign: db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(Number(campInfo.lastInsertRowid)),
      offer_id: offerId,
      landing_id: landingId,
      traffic_source_id: sourceId,
      click_path: `/click/${key}`,
    };
  })();

  res.status(201).json(result);
});

function slug(s) {
  return String(s || 'x')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'x';
}

function parseBid(hint) {
  if (!hint) return null;
  const m = String(hint).match(/(\d+[.,]?\d*)/);
  if (!m) return null;
  return Number(m[1].replace(',', '.'));
}

function sourceTokens(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('facebook') || s.includes('meta') || s.includes('fb')) {
    return { token1: 'utm_campaign', token2: 'utm_content', token3: 'placement' };
  }
  if (s.includes('google') || s.includes('uac') || s.includes('adwords')) {
    return { token1: 'campaignid', token2: 'adgroupid', token3: 'creative' };
  }
  if (s.includes('tiktok')) {
    return { token1: 'campaign_id', token2: 'adgroup_id', token3: 'ad_id' };
  }
  if (s.includes('push') || s.includes('propeller') || s.includes('rollerads')) {
    return { token1: 'zoneid', token2: 'bannerid', token3: 'campaignid' };
  }
  if (s.includes('taboola') || s.includes('outbrain') || s.includes('native')) {
    return { token1: 'campaign', token2: 'site', token3: 'thumbnail' };
  }
  return { token1: 'sub1', token2: 'sub2', token3: 'sub3' };
}

export default router;
