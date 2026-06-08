import { queryOpsDb } from '@/lib/opsDb';

export type ReturnStatus =
  | 'uploaded'
  | 'match_found'
  | 'needs_manual_review'
  | 'ready_to_cancel'
  | 'canceled'
  | 'completed'
  | 'error';

export type ReturnCsvRow = {
  imei: string;
  device_condition: string;
  tracking_number: string;
};

type OpsSession = {
  role?: string;
} | null;

export const RETURN_MANAGER_ROLES = ['admin', 'returns_manager'];
export const CANCELLATION_ROLES = ['admin', 'cancellation_agent'];

export function hasRole(session: OpsSession, roles: string[]) {
  return Boolean(session?.role && roles.includes(session.role));
}

export async function ensureReturnsTables() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_return_batches (
      id SERIAL PRIMARY KEY,
      batch_uuid TEXT NOT NULL UNIQUE,
      uploaded_by TEXT NOT NULL,
      file_name TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      rejected_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_returns (
      id SERIAL PRIMARY KEY,
      batch_uuid TEXT REFERENCES ops_return_batches(batch_uuid),
      imei TEXT NOT NULL,
      device_condition TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'uploaded',
      uploaded_by TEXT NOT NULL,
      assigned_to TEXT,
      chargebee_customer_id TEXT,
      chargebee_customer_name TEXT,
      chargebee_customer_email TEXT,
      chargebee_subscription_id TEXT,
      chargebee_subscription_status TEXT,
      chargebee_match_payload JSONB,
      cancellation_reason TEXT,
      invoice_handling TEXT,
      canceled_by TEXT,
      canceled_at TIMESTAMPTZ,
      error_message TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_ops_returns_status ON ops_returns(status)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_ops_returns_imei ON ops_returns(imei)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_ops_returns_batch ON ops_returns(batch_uuid)`);

  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_return_audit (
      id SERIAL PRIMARY KEY,
      return_id INTEGER REFERENCES ops_returns(id) ON DELETE CASCADE,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function auditReturn(returnId: number, actorEmail: string, action: string, details?: Record<string, unknown>) {
  await queryOpsDb(
    `INSERT INTO ops_return_audit (return_id, actor_email, action, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [returnId, actorEmail, action, JSON.stringify(details || {})]
  );
}

export function normalizeImei(value: string) {
  return value.replace(/\D/g, '').trim();
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseReturnsCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [] as ReturnCsvRow[], rejected: [{ row: 0, reason: 'CSV is empty' }] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ['imei', 'device_condition', 'tracking_number'];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      rows: [] as ReturnCsvRow[],
      rejected: [{ row: 1, reason: `Missing required header(s): ${missing.join(', ')}` }],
    };
  }

  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const rows: ReturnCsvRow[] = [];
  const rejected: { row: number; reason: string; imei?: string }[] = [];
  const seen = new Set<string>();

  lines.slice(1).forEach((line, offset) => {
    const rowNumber = offset + 2;
    const cells = parseCsvLine(line);
    const imei = normalizeImei(cells[index.imei] || '');
    const deviceCondition = (cells[index.device_condition] || '').trim();
    const trackingNumber = (cells[index.tracking_number] || '').trim();

    if (!imei) {
      rejected.push({ row: rowNumber, reason: 'Missing IMEI' });
      return;
    }
    if (imei.length < 14 || imei.length > 17) {
      rejected.push({ row: rowNumber, reason: 'IMEI must be 14-17 digits', imei });
      return;
    }
    if (!deviceCondition) {
      rejected.push({ row: rowNumber, reason: 'Missing device condition', imei });
      return;
    }
    if (!trackingNumber) {
      rejected.push({ row: rowNumber, reason: 'Missing tracking number', imei });
      return;
    }
    if (seen.has(imei)) {
      rejected.push({ row: rowNumber, reason: 'Duplicate IMEI in this CSV', imei });
      return;
    }

    seen.add(imei);
    rows.push({ imei, device_condition: deviceCondition, tracking_number: trackingNumber });
  });

  return { rows, rejected };
}
