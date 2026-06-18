import { Pool } from 'pg';

// All connection params come from environment variables.
// Set these in Vercel Dashboard → Settings → Environment Variables.
const opsDbPool = new Pool({
  user:     process.env.OPS_DB_USER,
  password: process.env.OPS_DB_PASSWORD,
  host:     process.env.OPS_DB_HOST,
  port:     Number(process.env.OPS_DB_PORT) || 25060,
  database: process.env.OPS_DB_NAME,
  ssl: process.env.OPS_DB_SSL === 'false'
    ? false
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function queryOpsDb(text: string, params?: any[]) {
  const client = await opsDbPool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export async function logActivity(agentEmail: string, actionType: string, target?: string | null, req?: Request) {
  let location = 'Unknown';
  if (req) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'Local';
    if (ip && ip !== '::1' && !ip.startsWith('127.') && !ip.startsWith('192.168.')) {
      try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country`, { signal: AbortSignal.timeout(2000) });
        const d = await res.json();
        if (d.status === 'success') {
          location = `${d.city}, ${d.country}`;
        }
      } catch {}
    }
  }

  return queryOpsDb(
    'INSERT INTO ops_activity_logs (agent_email, action_type, target, location) VALUES ($1, $2, $3, $4)',
    [agentEmail, actionType, target || null, location]
  );
}
