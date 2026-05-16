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
  console.log(`Paginating through ShipStation orders to find IMEI: ${IMEI}...`);
  let page = 1;
  let found = false;
  
  while (!found && page <= 5) {
    try {
      const res = await makeRequest(`/orders?pageSize=500&page=${page}`);
      if (!res.orders || res.orders.length === 0) {
        console.log(`No more orders on page ${page}.`);
        break;
      }
      
      console.log(`Scanning ${res.orders.length} orders on page ${page}...`);
      
      for (const order of res.orders) {
        const orderStr = JSON.stringify(order);
        if (orderStr.includes(IMEI)) {
          console.log(`\n============================`);
          console.log(`MATCH FOUND IN ORDER: ${order.orderNumber}`);
          console.log(`advancedOptions:`, order.advancedOptions);
          console.log(`============================\n`);
          found = true;
          break;
        }
      }
      page++;
      // simple rate limit pause
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error('Error fetching page', page, err);
      break;
    }
  }
  
  if (!found) console.log('Did not find the IMEI in the first 5 pages (2500 orders).');
}

run();
