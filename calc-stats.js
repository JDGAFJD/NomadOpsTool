const fs = require('fs');

const tickets = JSON.parse(fs.readFileSync('tickets_dump.json', 'utf8'));

const total = tickets.length;

let billing = [];
let retention = [];
let technical = [];
let shipping = [];
let internal = [];
let other = [];

tickets.forEach(t => {
  const s = t.subject.toLowerCase();
  if (s.includes('invoice') || s.includes('billing') || s.includes('paid') || s.includes('payment')) {
    billing.push(t);
  } else if (s.includes('promise') || s.includes('cancel') || s.includes('stop')) {
    retention.push(t);
  } else if (s.includes('wi-fi') || s.includes('internet') || s.includes('troubleshoot') || s.includes('service restored') || s.includes('service update')) {
    technical.push(t);
  } else if (s.includes('ship') || s.includes('delivery')) {
    shipping.push(t);
  } else if (s.includes('meeting') || s.includes('candidate') || s.includes('fabrication') || s.includes('workplaces')) {
    internal.push(t);
  } else {
    other.push(t);
  }
});

const getPercent = (arr) => ((arr.length / total) * 100).toFixed(1);
const getIds = (arr) => arr.slice(0, 3).map(t => `#${t.id}`).join(', ');

console.log(`Billing: ${billing.length} (${getPercent(billing)}%) | IDs: ${getIds(billing)}`);
console.log(`Retention: ${retention.length} (${getPercent(retention)}%) | IDs: ${getIds(retention)}`);
console.log(`Technical: ${technical.length} (${getPercent(technical)}%) | IDs: ${getIds(technical)}`);
console.log(`Shipping: ${shipping.length} (${getPercent(shipping)}%) | IDs: ${getIds(shipping)}`);
console.log(`Internal: ${internal.length} (${getPercent(internal)}%) | IDs: ${getIds(internal)}`);
console.log(`Other: ${other.length} (${getPercent(other)}%) | IDs: ${getIds(other)}`);

