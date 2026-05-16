const fs = require('fs');

const tickets = JSON.parse(fs.readFileSync('tickets_dump.json', 'utf8'));

// Normalize subject to group similar tickets
const normalizeSubject = (subject) => {
  if (!subject) return 'No Subject';
  return subject
    .replace(/^(Re:\s*|Fwd:\s*)+/gi, '') // Remove Re: and Fwd:
    .replace(/[\[\]]/g, '')              // Remove brackets
    .trim();
};

const uniqueCases = {};

tickets.forEach(t => {
  const norm = normalizeSubject(t.subject);
  if (!uniqueCases[norm]) {
    uniqueCases[norm] = {
      count: 0,
      ids: [],
      originalSubjects: new Set()
    };
  }
  uniqueCases[norm].count++;
  if (uniqueCases[norm].ids.length < 3) {
    uniqueCases[norm].ids.push(t.id);
  }
  uniqueCases[norm].originalSubjects.add(t.subject);
});

// Sort by frequency
const sortedCases = Object.entries(uniqueCases)
  .sort((a, b) => b[1].count - a[1].count)
  .map(([subject, data]) => ({
    subject,
    count: data.count,
    ids: data.ids,
    originalSubjects: Array.from(data.originalSubjects)
  }));

// Helper to categorize
const categorized = {
  billing: [],
  retention: [],
  technical: [],
  shipping: [],
  internal: [],
  other: []
};

sortedCases.forEach(c => {
  const s = c.subject.toLowerCase();
  if (s.includes('invoice') || s.includes('billing') || s.includes('paid') || s.includes('payment') || s.includes('charge')) {
    categorized.billing.push(c);
  } else if (s.includes('promise') || s.includes('cancel') || s.includes('stop') || s.includes('refund')) {
    categorized.retention.push(c);
  } else if (s.includes('wi-fi') || s.includes('internet') || s.includes('troubleshoot') || s.includes('service restored') || s.includes('service update') || s.includes('router') || s.includes('speed') || s.includes('connection')) {
    categorized.technical.push(c);
  } else if (s.includes('ship') || s.includes('delivery') || s.includes('tracking')) {
    categorized.shipping.push(c);
  } else if (s.includes('meeting') || s.includes('candidate') || s.includes('fabrication') || s.includes('workplaces')) {
    categorized.internal.push(c);
  } else {
    categorized.other.push(c);
  }
});

const printCategory = (name, arr) => {
  console.log(`\n=== ${name.toUpperCase()} (${arr.reduce((acc, c) => acc + c.count, 0)} total) ===`);
  arr.forEach(c => {
    console.log(` - [${c.count}x] ${c.subject} (IDs: ${c.ids.join(', ')})`);
  });
};

printCategory('Billing', categorized.billing);
printCategory('Retention', categorized.retention);
printCategory('Technical', categorized.technical);
printCategory('Shipping', categorized.shipping);
printCategory('Other', categorized.other.slice(0, 50)); // Print top 50 other
