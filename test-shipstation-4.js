const https = require('https');

const API_KEY = 'e8256e85c21447c1847407994aa607dd';
const API_SECRET = '0cab786e4d7a45a89268473fbe563272';
const IMEI = '357632331334762';

const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'ssapi.shipstation.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

async function run() {
  console.log(`Starting aggressive scan for IMEI: ${IMEI}...`);
  let found = false;
  let page = 1;

  while (!found && page < 100) {
    try {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(makeRequest(`/orders?pageSize=500&page=${page + i}`));
      }
      
      const results = await Promise.all(promises);
      let emptyCount = 0;

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (!res.orders || res.orders.length === 0) {
          emptyCount++;
          continue;
        }

        console.log(`Scanning page ${page + i} (${res.orders.length} orders)...`);
        
        for (const order of res.orders) {
          const orderStr = JSON.stringify(order);
          if (orderStr.includes(IMEI)) {
            console.log(`\n============================`);
            console.log(`MATCH FOUND ON PAGE ${page + i}`);
            console.log(`Order Number: ${order.orderNumber}`);
            console.log(`Customer: ${order.customerEmail}`);
            console.log(`advancedOptions:`, JSON.stringify(order.advancedOptions));
            console.log(`============================\n`);
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (emptyCount === 5) {
        console.log('No more orders found. Reached end of ShipStation history.');
        break;
      }

      page += 5;
      // Sleep to avoid 429 Too Many Requests
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log('Error', e);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

run();
