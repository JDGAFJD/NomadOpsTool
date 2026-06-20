// ─── Settings / db.ts ────────────────────────────────────────────────────────
// On Vercel (serverless), there is no persistent filesystem, so better-sqlite3
// cannot be used at runtime. ALL settings are sourced from environment variables.
// Locally, SQLite is used as a fallback so the Admin UI still works.

import type { Database as BetterSqlite3Database } from 'better-sqlite3';

// ─── ENV → Settings key map ───────────────────────────────────────────────────
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
  twilio_account_sid:       'TWILIO_ACCOUNT_SID',
  twilio_api_key_sid:       'TWILIO_API_KEY_SID',
  twilio_api_key_secret:    'TWILIO_API_KEY_SECRET',
  callback_freescout_mailbox_id: 'CALLBACK_FREESCOUT_MAILBOX_ID',
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
let _db: BetterSqlite3Database | null = null;
let _dbInitialized = false;

function getLocalDb(): BetterSqlite3Database | null {
  if (_dbInitialized) return _db;
  _dbInitialized = true;

  // Skip SQLite entirely on Vercel / read-only environments
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return null;
  }

  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');

    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, 'settings.db');
    _db = new Database(dbPath) as BetterSqlite3Database;
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    return _db;
  } catch {
    // Native module unavailable (Vercel build) — env vars only
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  // 1. Environment variable (highest priority — always works on Vercel)
  const envKey = ENV_FALLBACKS[key];
  if (envKey && process.env[envKey]) {
    return process.env[envKey]!;
  }

  // 2. Local SQLite DB (only available in local dev)
  const db = getLocalDb();
  if (db) {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Setting | undefined;
      if (row) return row.value;
    } catch { /* ignore */ }
  }

  return null;
}

export function setSetting(key: string, value: string): void {
  const db = getLocalDb();
  if (!db) {
    console.warn(`[db] Cannot persist setting "${key}" on Vercel — use environment variables.`);
    return;
  }
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const result: Record<string, string> = {};

  // Start with local DB values (if available)
  const db = getLocalDb();
  if (db) {
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all() as Setting[];
      rows.forEach(row => { result[row.key] = row.value; });
    } catch { /* ignore */ }
  }

  // Overlay env vars (higher priority — Vercel always wins)
  for (const [settingKey, envKey] of Object.entries(ENV_FALLBACKS)) {
    if (process.env[envKey]) {
      result[settingKey] = process.env[envKey]!;
    }
  }

  return result;
}

export default { getSetting, setSetting, getAllSettings };
