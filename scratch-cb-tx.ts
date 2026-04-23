import { ChargebeeService } from './src/lib/services/ChargebeeService';
import Database from 'better-sqlite3';

const db = new Database('./.data/settings.db');
const getSetting = (key: string) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
};

const cb = new ChargebeeService();
(cb as any).site = getSetting('chargebee_site');
(cb as any).apiKey = getSetting('chargebee_api_key');
(cb as any).baseUrl = `https://${(cb as any).site}.chargebee.com/api/v2`;

async function test() {
  const subId = '16BgXIUxqug513t51';
  // Get Customer ID for this sub? Or just get the subscription directly.
  const subRes = await (cb as any).fetchApi(`/subscriptions/${subId}`);
  console.log("Sub:", subRes?.subscription?.id);
  const custId = subRes?.subscription?.customer_id;
  
  if (custId) {
    const txs = await (cb as any).fetchApi(`/transactions?customer_id[is]=${custId}&limit=5`);
    console.log("Tx:", JSON.stringify(txs?.list?.map((t:any) => ({ id: t.transaction.id, status: t.transaction.status })), null, 2));
  }
}

test();
