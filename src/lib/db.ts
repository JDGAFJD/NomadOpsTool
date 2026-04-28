import path from 'path';
import fs from 'fs';

// ─── ENV → Settings key map ───────────────────────────────────────────────────
// When running on Vercel (no persistent filesystem), we fall back to process.env.
// The key names here match exactly what the admin UI stores in the SQLite DB.
const ENV_FALLBACKS: Record<string, string> = {
  chargebee_site:           'CHARGEBEE_SITE',
  chargebee_api_key:        'CHARGEBEE_API_KEY',
  thingspace_client_id:     'THINGSPACE_CLIENT_ID',
  thingspace_client_secret: 'THINGSPACE_CLIENT_SECRET',
  thingspace_account_name:  'THINGSPACE_ACCOUNT_NAME',
  thingspace_username:      'THINGSPACE_USERNAME',
  thingspace_password:      'THINGSPACE_PASSWORD',
  freescout_api_url:        'FREESCOUT_API_URL',
  freescout_api_key:        'FREESCOUT_API_KEY',
  shopify_admin_key:        'SHOPIFY_ADMIN_KEY',
  shopify_store_domain:     'SHOPIFY_STORE_DOMAIN',
  shipstation_api_key:      'SHIPSTATION_API_KEY',
  shipstation_api_secret:   'SHIPSTATION_API_SECRET',
  slack_bot_token:          'SLACK_BOT_TOKEN',
  openai_api_key:           'OPENAI_API_KEY',
  jwt_secret:               'JWT_SECRET',
};

export interface Setting {
  key: string;
  value: string;
}

// ─── SQLite (local dev only) ──────────────────────────────────────────────────
// On Vercel the filesystem is read-only, so we skip SQLite and rely solely on
// process.env via the ENV_FALLBACKS map above.
let db: import('better-sqlite3').Database | null = null;

function getDb() {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'settings.db');
    db = new Database(dbPath);
    db!.pragma('journal_mode = WAL');
    db!.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    return db;
  } catch {
    // Vercel / read-only filesystem — SQLite not available, use env vars only
    return null;
  }
}

export function getSetting(key: string): string | null {
  // 1. Try SQLite (works locally)
  const database = getDb();
  if (database) {
    try {
      const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Setting | undefined;
      if (row) return row.value;
    } catch {
      // fall through
    }
  }

  // 2. Fall back to environment variable (works on Vercel)
  const envKey = ENV_FALLBACKS[key];
  if (envKey && process.env[envKey]) {
    return process.env[envKey]!;
  }

  return null;
}

export function setSetting(key: string, value: string): void {
  const database = getDb();
  if (!database) {
    console.warn(`[db] Cannot persist setting "${key}" — SQLite unavailable (Vercel?). Use environment variables.`);
    return;
  }
  database.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const result: Record<string, string> = {};

  // Merge env var fallbacks first (lower priority)
  for (const [settingKey, envKey] of Object.entries(ENV_FALLBACKS)) {
    if (process.env[envKey]) {
      result[settingKey] = process.env[envKey]!;
    }
  }

  // Overlay with any DB-saved values (higher priority — user overrides via admin UI)
  const database = getDb();
  if (database) {
    try {
      const rows = database.prepare('SELECT key, value FROM settings').all() as Setting[];
      rows.forEach(row => { result[row.key] = row.value; });
    } catch {
      // ignore
    }
  }

  return result;
}

export default { getSetting, setSetting, getAllSettings };
