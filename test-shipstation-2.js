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
  console.log(`Searching for IMEI: ${IMEI} using customField1 param...`);
  try {
    const res = await makeRequest(`/orders?customField1=${IMEI}`);
    if (res.orders && res.orders.length > 0) {
      console.log(`Found ${res.orders.length} orders using customField1 param!`);
      res.orders.forEach(o => console.log(`Order: ${o.orderNumber}, CustomField1: ${o.advancedOptions?.customField1}`));
    } else {
      console.log(`No orders found using customField1 param.`);
    }
  } catch (err) {
    console.error('Error with customField1:', err);
  }
}

run();
