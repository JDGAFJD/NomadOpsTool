import { Pool } from 'pg';

// All connection params come from environment variables.
// Set these in Vercel Dashboard → Settings → Environment Variables.
const opsDbPool = new Pool({
  user:     process.env.OPS_DB_USER,
  password: process.env.OPS_DB_PASSWORD,
  host:     process.env.OPS_DB_HOST,
  port:     Number(process.env.OPS_DB_PORT) || 25060,
  database: process.env.OPS_DB_NAME,
  ssl: {
    rejectUnauthorized: false
  },
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
