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

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  `);

  // migrate older DBs created before auth
  ensureColumn('traffic_sources', 'user_id', 'INTEGER');
  ensureColumn('offers', 'user_id', 'INTEGER');
  ensureColumn('landings', 'user_id', 'INTEGER');
  ensureColumn('campaigns', 'user_id', 'INTEGER');
}

initSchema();
