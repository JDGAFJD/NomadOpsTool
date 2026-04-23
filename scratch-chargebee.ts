import { ChargebeeService } from './src/lib/services/ChargebeeService';
import Database from 'better-sqlite3';

const db = new Database('./.data/settings.db');
const getSetting = (key: string) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
};

const cb = new ChargebeeService();
// Manually inject missing getSetting to simulate environment:
(cb as any).site = getSetting('chargebee_site');
(cb as any).apiKey = getSetting('chargebee_api_key');
(cb as any).baseUrl = `https://${(cb as any).site}.chargebee.com/api/v2`;

async function test(email: string) {
  console.log(`Testing Chargebee Data for ${email}`);
  const custRes = await cb.getCustomerData(email);
  if (!custRes.customers || custRes.customers.length === 0) {
    console.log('No customers found');
    return;
  }
  
  const customer = custRes.customers[0];
  console.log(`Customer: ${customer.id}`);
  
  for (const sub of customer.subscriptions || []) {
    console.log(`\n=== Subscription: ${sub.id} ===`);
    console.log(`Status: ${sub.status}`);
    console.log(`Due Invoices Count: ${sub.due_invoices_count}`);
    console.log(`Next Billing At: ${sub.next_billing_at ? new Date(sub.next_billing_at * 1000).toISOString() : 'N/A'}`);
    console.log(`Due Since: ${sub.due_since ? new Date(sub.due_since * 1000).toISOString() : 'N/A'}`);
    
    // Fetch comments
    console.log('\nFetching Comments...');
    const comments = await (cb as any).fetchApi(`/comments?entity_type[is]=subscription&entity_id[is]=${sub.id}`);
    console.log(comments ? `Found ${comments.list?.length} comments.` : 'Failed comments.');
    if (comments?.list?.length) console.log(comments.list[0]);
    
    // Fetch Invoices
    console.log('\nFetching Invoices...');
    const invoices = await cb.getInvoices(customer.id, sub.id);
    console.log(invoices ? `Found ${invoices.length} invoices.` : 'Failed invoices.');
    if (invoices?.length) console.log(invoices[0].id, invoices[0].status, invoices[0].total);
    
    // Fetch Transactions
    console.log('\nFetching Transactions...');
    const tx = await (cb as any).fetchApi(`/transactions?customer_id[is]=${customer.id}&limit=5`);
    console.log(tx ? `Found ${tx.list?.length} transactions.` : 'Failed tx.');
    
    // Fetch Credit Notes
    console.log('\nFetching Credit Notes...');
    const cv = await (cb as any).fetchApi(`/credit_notes?customer_id[is]=${customer.id}&limit=5`);
    console.log(cv ? `Found ${cv.list?.length} credit notes.` : 'Failed cv.');
  }
}

test('emailforallwork0@gmail.com');
