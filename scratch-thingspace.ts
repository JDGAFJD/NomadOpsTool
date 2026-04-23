import { ThingSpaceService } from './src/lib/services/ThingSpaceService';
import Database from 'better-sqlite3';

const db = new Database('./.data/settings.db');
const getSetting = (key: string) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
};

const thingspace = new ThingSpaceService();
(thingspace as any).clientId = getSetting('thingspace_client_id');
(thingspace as any).clientSecret = getSetting('thingspace_client_secret');
(thingspace as any).accountName = getSetting('thingspace_account_name');
(thingspace as any).username = getSetting('thingspace_username');
(thingspace as any).password = getSetting('thingspace_password');

async function test(iccid: string) {
  console.log(`Testing ThingSpace for ${iccid}`);
  
  const tokens = await (thingspace as any).getTokens();
  console.log('Tokens:', tokens);

  const res = await fetch(`https://thingspace.verizon.com/api/m2m/v1/devices/actions/list`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens?.oauth}`,
        'VZ-M2M-Token': tokens?.session,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountName: (thingspace as any).accountName,
        filter: {
          deviceIdentifierFilters: [{ kind: 'iccid', contains: iccid }]
        }
      })
    });
    
  console.log('ThingSpace Status Code:', res.status);
  const data = await res.json();
  console.log('ThingSpace Data:', data);
}

test('89148000009857216875');
