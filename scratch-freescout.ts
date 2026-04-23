import Database from 'better-sqlite3';

const db = new Database('./.data/settings.db');
const getSetting = (key: string) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
};

const apiUrl = getSetting('freescout_api_url') || '';
const apiKey = getSetting('freescout_api_key') || '';
console.log('API Configured:', !!apiUrl, !!apiKey);

async function test(email: string) {
  const safeBaseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  try {
    let res = await fetch(`${safeBaseUrl}/api/customers?email=${email}`, {
      headers: { 'X-FreeScout-API-Key': apiKey, 'Accept': 'application/json' }
    });
    if (res.ok) {
       let data = await res.json();
       console.log('Customers Query (?email=): Found', data._embedded?.customers?.length || 0);
       if (data._embedded?.customers?.length > 0) {
          const custId = data._embedded.customers[0].id;
          let r2 = await fetch(`${safeBaseUrl}/api/conversations?customerId=${custId}`, {
            headers: { 'X-FreeScout-API-Key': apiKey, 'Accept': 'application/json' }
          });
          let d2 = await r2.json();
          console.log('Conversations by CustomerId:', d2._embedded?.conversations?.length || 0);
       }
    }
  } catch (e: any) { console.log('Err 1', e.message); }
  
  try {
    const res = await fetch(`${safeBaseUrl}/api/conversations?query=${email}`, {
      headers: { 'X-FreeScout-API-Key': apiKey, 'Accept': 'application/json' }
    });
    if (res.ok) {
       const data = await res.json();
       console.log('Conversations Query (?query=): Found', data._embedded?.conversations?.length || 0);
       if (data._embedded?.conversations?.length > 0) {
         console.log(data._embedded.conversations[0].id, data._embedded.conversations[0].subject);
       }
    }
  } catch (e: any) { console.log('Err 2', e.message); }
}

test('rhondag697@gmail.com');
