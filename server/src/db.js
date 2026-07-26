import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'arbtrack.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`
  ).run(key, value);
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      telegram TEXT NOT NULL DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS traffic_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      postback_url TEXT DEFAULT '',
      cost_param TEXT DEFAULT 'cost',
      currency TEXT DEFAULT 'USD',
      token1 TEXT DEFAULT '',
      token2 TEXT DEFAULT '',
      token3 TEXT DEFAULT '',
      token4 TEXT DEFAULT '',
      token5 TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      payout REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      geo TEXT DEFAULT '',
      network TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS landings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      traffic_source_id INTEGER REFERENCES traffic_sources(id) ON DELETE SET NULL,
      offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
      landing_id INTEGER REFERENCES landings(id) ON DELETE SET NULL,
      cost_model TEXT NOT NULL DEFAULT 'cpc',
      cost_value REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      unique_hours INTEGER NOT NULL DEFAULT 24,
      block_bots INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      weight REAL NOT NULL DEFAULT 100,
      UNIQUE(campaign_id, offer_id)
    );

    CREATE TABLE IF NOT EXISTS campaign_paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Default',
      weight REAL NOT NULL DEFAULT 100,
      landing_id INTEGER REFERENCES landings(id) ON DELETE SET NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS path_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path_id INTEGER NOT NULL REFERENCES campaign_paths(id) ON DELETE CASCADE,
      offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      weight REAL NOT NULL DEFAULT 100,
      UNIQUE(path_id, offer_id)
    );

    CREATE TABLE IF NOT EXISTS campaign_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Rule',
      priority INTEGER NOT NULL DEFAULT 100,
      enabled INTEGER NOT NULL DEFAULT 1,
      path_id INTEGER REFERENCES campaign_paths(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rule_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES campaign_rules(id) ON DELETE CASCADE,
      field TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT 'eq',
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clickid TEXT NOT NULL UNIQUE,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
      landing_id INTEGER REFERENCES landings(id) ON DELETE SET NULL,
      traffic_source_id INTEGER REFERENCES traffic_sources(id) ON DELETE SET NULL,
      ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      country TEXT DEFAULT '',
      city TEXT DEFAULT '',
      device TEXT DEFAULT '',
      os TEXT DEFAULT '',
      browser TEXT DEFAULT '',
      referer TEXT DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      is_unique INTEGER NOT NULL DEFAULT 1,
      is_bot INTEGER NOT NULL DEFAULT 0,
      token1 TEXT DEFAULT '',
      token2 TEXT DEFAULT '',
      token3 TEXT DEFAULT '',
      token4 TEXT DEFAULT '',
      token5 TEXT DEFAULT '',
      query_string TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clickid TEXT NOT NULL,
      click_row_id INTEGER REFERENCES clicks(id) ON DELETE SET NULL,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'lead',
      payout REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      txid TEXT DEFAULT '',
      raw_query TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clicks_campaign ON clicks(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_clicks_created ON clicks(created_at);
    CREATE INDEX IF NOT EXISTS idx_clicks_clickid ON clicks(clickid);
    CREATE INDEX IF NOT EXISTS idx_conversions_clickid ON conversions(clickid);
    CREATE INDEX IF NOT EXISTS idx_conversions_created ON conversions(created_at);
    CREATE INDEX IF NOT EXISTS idx_campaigns_key ON campaigns(key);
    CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_offers_user ON offers(user_id);
    CREATE INDEX IF NOT EXISTS idx_sources_user ON traffic_sources(user_id);
    CREATE INDEX IF NOT EXISTS idx_landings_user ON landings(user_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_offers_campaign ON campaign_offers(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_paths_campaign ON campaign_paths(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_rules_campaign ON campaign_rules(campaign_id);

    CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_key TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '/',
      ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_site_visits_visitor ON site_visits(visitor_key);
    CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at);
  `);

  ensureColumn('traffic_sources', 'user_id', 'INTEGER');
  ensureColumn('offers', 'user_id', 'INTEGER');
  ensureColumn('landings', 'user_id', 'INTEGER');
  ensureColumn('campaigns', 'user_id', 'INTEGER');
  ensureColumn('campaigns', 'unique_hours', 'INTEGER NOT NULL DEFAULT 24');
  ensureColumn('campaigns', 'block_bots', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('campaigns', 'currency', "TEXT NOT NULL DEFAULT 'USD'");
  ensureColumn('campaigns', 'direct_campaign_id', 'TEXT');
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_campaigns_direct_id ON campaigns(direct_campaign_id)`,
    );
  } catch {
    /* ignore */
  }
  ensureColumn('users', 'email', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'telegram', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');

  ensureSetting('registration_enabled', '1');
  ensureSetting('invite_code', '');

  // migrate legacy single offer_id into campaign_offers
  db.prepare(
    `INSERT OR IGNORE INTO campaign_offers (campaign_id, offer_id, weight)
     SELECT id, offer_id, 100 FROM campaigns WHERE offer_id IS NOT NULL`
  ).run();

  // create default path for campaigns that have none
  const camps = db.prepare(`SELECT id, landing_id FROM campaigns`).all();
  const pathCount = db.prepare(
    `SELECT COUNT(*) AS c FROM campaign_paths WHERE campaign_id = ?`
  );
  const insertPath = db.prepare(
    `INSERT INTO campaign_paths (campaign_id, name, weight, landing_id, enabled, is_default, sort_order)
     VALUES (?, 'Default', 100, ?, 1, 1, 0)`
  );
  const insertPathOffer = db.prepare(
    `INSERT OR IGNORE INTO path_offers (path_id, offer_id, weight) VALUES (?, ?, ?)`
  );
  for (const c of camps) {
    if (pathCount.get(c.id).c > 0) continue;
    const info = insertPath.run(c.id, c.landing_id || null);
    const pathId = Number(info.lastInsertRowid);
    const offers = db
      .prepare(`SELECT offer_id, weight FROM campaign_offers WHERE campaign_id = ?`)
      .all(c.id);
    for (const o of offers) insertPathOffer.run(pathId, o.offer_id, o.weight);
  }

  // promote first user to admin if none
  const adminCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE is_admin = 1`).get().c;
  if (!adminCount) {
    const first = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`).get();
    if (first) db.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(first.id);
  }
}

export function getSetting(key, fallback = '') {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

initSchema();
