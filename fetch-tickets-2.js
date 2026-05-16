const https = require('https');

const API_URL = 'support.nomad-os.cloud';
const API_KEY = 'b9b6bf4876b2e0b77a481895dd1a8f28';

function fetchPage(page) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_URL,
      path: `/api/conversations?page=${page}&status=all`, // status=all to get active and closed
      method: 'GET',
      headers: {
        'X-FreeScout-API-Key': API_KEY,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  let page = 1;
  let hasMore = true;
  let recentTickets = [];
  
  console.log(`Fetching tickets updated after ${cutoffDate.toISOString()}...`);
  
  while (hasMore && page <= 50) { // Limit to 50 pages to prevent infinite loops
    try {
      console.log(`Fetching page ${page}...`);
      const data = await fetchPage(page);
      
      if (data.error) {
        console.error('API Error:', data.error);
        break;
      }
      
      const conversations = data._embedded ? data._embedded.conversations : [];
      console.log(`Received ${conversations.length} conversations on page ${page}`);
      
      if (conversations.length === 0) {
        hasMore = false;
        break;
      }
      
      let allOlder = true;
      for (const conv of conversations) {
        const updatedAt = new Date(conv.updatedAt || conv.createdAt); 
        if (updatedAt >= cutoffDate) {
          recentTickets.push(conv);
          allOlder = false;
        }
      }
      
      if (allOlder) {
        console.log('All tickets on this page are older than cutoff. Stopping.');
        hasMore = false;
      } else {
        page++;
      }
    } catch (e) {
      console.error('Error fetching page', page, e);
      break;
    }
  }
  
  console.log(`Fetched ${recentTickets.length} tickets from the last 7 days.`);
  
  // Quick summary
  const statusCounts = {};
  const mailboxCounts = {};
  
  const subjects = [];
  
  recentTickets.forEach(t => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    mailboxCounts[t.mailboxId] = (mailboxCounts[t.mailboxId] || 0) + 1;
    subjects.push({ id: t.id, subject: t.subject, status: t.status, date: t.updatedAt });
  });
  
  console.log('Status Counts:', statusCounts);
  console.log('Mailbox Counts:', mailboxCounts);
  console.log('\nSample Subjects:');
  subjects.slice(0, 50).forEach(s => console.log(` - [${s.status}] ${s.subject} (${s.date})`));
  
  const fs = require('fs');
  fs.writeFileSync('tickets_dump.json', JSON.stringify(recentTickets, null, 2));
}

run();
