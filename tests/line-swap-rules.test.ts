import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChargebeeEligibility, isDestinationCandidate, isSourceCandidate } from '../src/lib/lineSwaps/rules';
import { isValidIccid, isValidImei, type NormalizedThingSpaceDevice } from '../src/lib/lineSwaps/types';

const source: NormalizedThingSpaceDevice = {
  internalId: 1, mdn: '5551234567', iccid: '89148000000000000001', imei: '990016890110001',
  state: 'active', plan: 'EXACT-PLAN', customField4: '', customField5: 'Contract Ended',
};

test('source rule accepts only active, complete, unswapped Contract Ended lines', () => {
  assert.equal(isSourceCandidate(source), true);
  assert.equal(isSourceCandidate({ ...source, state: 'suspend' }), false);
  assert.equal(isSourceCandidate({ ...source, customField4: 'Swapped 2026-08-06' }), false);
  assert.equal(isSourceCandidate({ ...source, customField5: 'Contract Active' }), false);
  assert.equal(isSourceCandidate({ ...source, imei: '' }), false);
});
test('destination requires suspend, Contract Active, and exact case-sensitive plan', () => {
  const destination = { ...source, state: 'suspend', customField5: 'Contract Active' };
  assert.equal(isDestinationCandidate(destination, 'EXACT-PLAN'), true);
  assert.equal(isDestinationCandidate(destination, 'exact-plan'), false);
  assert.equal(isDestinationCandidate({ ...destination, state: 'pending restore' }, 'EXACT-PLAN'), false);
});

test('Chargebee gate blocks missing and ambiguous subscriptions', () => {
  assert.equal(evaluateChargebeeEligibility([], new Map()).reasonCode, 'NO_SUBSCRIPTION');
  assert.equal(evaluateChargebeeEligibility([{ id: 'a' }, { id: 'b' }], new Map()).reasonCode, 'AMBIGUOUS_SUBSCRIPTIONS');
});

test('Chargebee gate accepts each active-like status only when latest invoice is paid with zero due', () => {
  for (const status of ['active', 'in_trial', 'paused', 'future']) {
    const invoices = new Map([['sub', [
      { id: 'older', status: 'not_paid', amount_due: 100, date: 10 },
      { id: 'latest', status: 'paid', amount_due: 0, date: 20 },
    ]]]);
    const result = evaluateChargebeeEligibility([{ id: 'sub', customer_id: 'customer', status }], invoices);
    assert.equal(result.eligible, true, status);
    assert.equal(result.latestInvoiceId, 'latest');
  }
});

test('Chargebee gate rejects inactive, absent invoice, unpaid latest, and paid invoice with amount due', () => {
  assert.equal(evaluateChargebeeEligibility([{ id: 'sub', status: 'cancelled' }], new Map()).reasonCode, 'SUBSCRIPTION_NOT_ACTIVE_LIKE');
  assert.equal(evaluateChargebeeEligibility([{ id: 'sub', status: 'active' }], new Map()).reasonCode, 'NO_INVOICE');
  assert.equal(evaluateChargebeeEligibility([{ id: 'sub', status: 'active' }], new Map([['sub', [{ status: 'payment_due', amount_due: 100 }]]])).eligible, false);
  assert.equal(evaluateChargebeeEligibility([{ id: 'sub', status: 'active' }], new Map([['sub', [{ status: 'paid', amount_due: 1 }]]])).eligible, false);
});

test('parking identifiers enforce Inseego IMEI and Verizon ICCID formats', () => {
  assert.equal(isValidImei('990016890110001'), true);
  assert.equal(isValidImei('860016890110001'), false);
  assert.equal(isValidIccid('89148000000000000001'), true);
  assert.equal(isValidIccid('89147000000000000001'), false);
});
