import { Pool } from 'pg';

// Initialize a connection pool for the Ops Database
const opsDbPool = new Pool({
  user: 'chargebee-sync',
  password: process.env.OPS_DB_PASSWORD,
  host: 'lrlos-postgres-do-user-15661062-0.f.db.ondigitalocean.com',
  port: 25060,
  database: 'chargebee-sync',
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
