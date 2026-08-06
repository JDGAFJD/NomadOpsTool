import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChargebeeEligibility, isDestinationCandidate, isSourceCandidate } from '../src/lib/lineSwaps/rules';
import { isValidIccid, isValidImei, type NormalizedThingSpaceDevice } from '../src/lib/lineSwaps/types';
import { buildFilteredDeviceListRequest } from '../src/lib/services/ThingSpaceService';
import { mapSyncRows, snapshotAgeMs } from '../src/lib/services/ThingSpaceSyncSheetService';
import { isFallbackEligibleError } from '../src/lib/lineSwaps/preview';

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

test('filtered source and destination payloads use supported filters and stable cursor', () => {
  assert.deepEqual(buildFilteredDeviceListRequest('acct', { currentState: 'active', customField5: 'Contract Ended' }, 123), {
    accountName: 'acct', currentState: 'active', customFields: [{ key: 'CustomField5', value: 'Contract Ended' }],
    largestDeviceIdSeen: 123, maxNumberOfDevices: 2000,
  });
  assert.deepEqual(buildFilteredDeviceListRequest('acct', { currentState: 'suspend', customField5: 'Contract Active', servicePlan: 'Exact Plan' }, 0), {
    accountName: 'acct', currentState: 'suspend', servicePlan: 'Exact Plan', customFields: [{ key: 'CustomField5', value: 'Contract Active' }],
    largestDeviceIdSeen: 0, maxNumberOfDevices: 2000,
  });
});

test('TS_Lines mapping uses named columns, normalizes identifiers, sorts, and drops duplicate IDs', () => {
  const headers = ['accountName', 'servicePlan', 'carrierState', 'DeviceId', 'mdn', 'imei', 'iccId', 'CustomField4', 'CustomField5'];
  const rows = [headers, ['a', 'P2', 'active', 20, '(555) 000-0002', '990016890110002', '89148000000000000002', '', 'Contract Ended'],
    ['a', 'P1', 'suspend', 10, '5550000001', '990016890110001', '89148000000000000001', '', 'Contract Active'],
    ['a', 'P3', 'active', 10, 'duplicate', '1', '2', '', 'Contract Ended']];
  const devices = mapSyncRows(rows);
  assert.deepEqual(devices.map(device => device.internalId), [10, 20]);
  assert.equal(devices[1].mdn, '5550000002');
});

test('fallback freshness and failure policy distinguish temporary failures from valid empty results', () => {
  const now = new Date('2026-08-06T12:00:00.000Z');
  assert.equal(snapshotAgeMs('2026-08-06T11:00:00.000Z', now), 3_600_000);
  assert.equal(Number.isNaN(snapshotAgeMs(undefined, now)), true);
  assert.equal(isFallbackEligibleError(Object.assign(new Error('rate limited'), { status: 429 })), true);
  assert.equal(isFallbackEligibleError(new Error('ThingSpace authentication failed')), true);
  assert.equal(isFallbackEligibleError(Object.assign(new Error('bad filter'), { status: 400 })), false);
});
