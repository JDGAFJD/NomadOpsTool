const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  user: 'chargebee-sync',
  password: process.env.OPS_DB_PASSWORD,
  host: 'lrlos-postgres-do-user-15661062-0.f.db.ondigitalocean.com',
  port: 25060,
  database: 'chargebee-sync',
  ssl: {
    rejectUnauthorized: false
  }
});

async function seed() {
  try {
    await client.connect();
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ops_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('ops_users table created/verified.');

    const email = 'test@test.com';
    const plainPassword = 'Awais@0301';
    
    const hash = await bcrypt.hash(plainPassword, 10);
    
    await client.query(`
      INSERT INTO ops_users (email, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (email) DO UPDATE SET password_hash = $2
    `, [email, hash]);

    console.log('Seed user test@test.com created/updated securely.');

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

seed();
