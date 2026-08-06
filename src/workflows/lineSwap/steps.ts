import { FatalError, RetryableError } from 'workflow';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { LineSwapSheetService } from '@/lib/services/LineSwapSheetService';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';
import { evaluateChargebeeEligibility } from '@/lib/lineSwaps/rules';
import { finalizeBatch, getBatch, getItem, updateItemStatus, type SwapItemRecord } from '@/lib/lineSwaps/store';
import { ACTIVE_LIKE_SUBSCRIPTION_STATUSES, isValidIccid, isValidImei, maskIdentifier } from '@/lib/lineSwaps/types';
import { postDirectToSlack } from '@/lib/slack';

const DONALD_VICKER_ID = 'U09CJN82597';
type ExecutableSwapItem = SwapItemRecord & {
  destination_mdn: string; destination_iccid: string; destination_imei: string;
  parking_sheet_row: number; parking_iccid: string; parking_imei: string;
};

export async function revalidateItem(itemId: string) {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const cb = new ChargebeeService();
  const [source, destination, parkingIccidMatch, parkingImeiMatch] = await Promise.all([
    ts.getDeviceByIdentifier('mdn', item.source_mdn),
    ts.getDeviceByIdentifier('mdn', item.destination_mdn),
    ts.getDeviceByIdentifier('iccid', item.parking_iccid),
    ts.getDeviceByIdentifier('imei', item.parking_imei),
  ]);
  if (!source || !destination) throw new FatalError('Source or destination MDN no longer exists');

  const sourceParked = source.iccid === item.parking_iccid && source.imei === item.parking_imei;
  const destinationReplaced = destination.iccid === item.source_iccid && destination.imei === item.source_imei;
  if (!sourceParked) {
    if (source.state !== 'active' || source.customField5.toLowerCase() !== 'contract ended' || source.customField4.toLowerCase().startsWith('swapped')) {
      throw new FatalError('Source line is no longer an unswapped active Contract Ended line');
    }
    if (source.iccid !== item.source_iccid || source.imei !== item.source_imei || source.plan.trim() !== item.source_plan.trim()) {
      throw new FatalError('Source identifiers or plan changed after preview');
    }
    if (parkingIccidMatch || parkingImeiMatch) throw new FatalError('Parking hardware is already present in ThingSpace');
  }

  if (!destinationReplaced) {
    if (!['suspend', 'active'].includes(destination.state) || destination.customField5.toLowerCase() !== 'contract active') {
      throw new FatalError('Destination is no longer a safe Contract Active line');
    }
    if (destination.plan.trim() !== item.source_plan.trim()) throw new FatalError('Destination plan no longer exactly matches source plan');
    if (destination.iccid !== item.destination_iccid || destination.imei !== item.destination_imei) {
      throw new FatalError('Destination identifiers changed after preview');
    }
    const destinationSubscriptions = await cb.findSubscriptionsByIccid(destination.iccid);
    if (destinationSubscriptions.some(subscription => ACTIVE_LIKE_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase()))) {
      throw new FatalError('Destination now has an active-like Chargebee subscription');
    }
  }

  const subscriptions = await cb.findSubscriptionsByIccid(item.source_iccid);
  const invoices = new Map<string, Array<{ id?: string; status?: string; amount_due?: number; date?: number; created_at?: number }>>();
  await Promise.all(subscriptions.map(async subscription => {
    if (subscription.id) invoices.set(subscription.id, await cb.getAllInvoicesForSubscription(subscription.id));
  }));
  const eligibility = evaluateChargebeeEligibility(subscriptions, invoices);
  if (!eligibility.eligible) throw new FatalError(`Chargebee gate changed: ${eligibility.reasonCode}`);
  return { sourceParked, destinationReplaced, destinationActive: destination.state === 'active' };
}

export async function dispatchParking(itemId: string): Promise<string | null> {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const source = await ts.getDeviceByIdentifier('mdn', item.source_mdn);
  if (source?.iccid === item.parking_iccid && source?.imei === item.parking_imei) return null;
  await updateItemStatus(itemId, 'parking');
  try {
    const requestId = item.park_request_id || await ts.change4gIdentifiers(item.source_mdn, item.parking_imei, item.parking_iccid);
    await updateItemStatus(itemId, 'parking', { parkRequestId: requestId });
    return requestId;
  } catch (error) { throwCarrierError(error); }
}

export async function dispatchRestore(itemId: string): Promise<string | null> {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const destination = await ts.getDeviceByIdentifier('mdn', item.destination_mdn);
  if (destination?.state === 'active') return null;
  if (destination?.state !== 'suspend') throw new FatalError(`Destination cannot be restored from state ${destination?.state || 'missing'}`);
  await updateItemStatus(itemId, 'restoring');
  try {
    const requestId = item.restore_request_id || await ts.restoreByMdn(item.destination_mdn);
    await updateItemStatus(itemId, 'restoring', { restoreRequestId: requestId });
    return requestId;
  } catch (error) { throwCarrierError(error); }
}

export async function dispatchReplacement(itemId: string): Promise<string | null> {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const destination = await ts.getDeviceByIdentifier('mdn', item.destination_mdn);
  if (destination?.iccid === item.source_iccid && destination?.imei === item.source_imei) return null;
  if (destination?.state !== 'active') throw new FatalError('Destination is not active before replacement');
  await updateItemStatus(itemId, 'replacing');
  try {
    const requestId = item.replace_request_id || await ts.change4gIdentifiers(item.destination_mdn, item.source_imei, item.source_iccid);
    await updateItemStatus(itemId, 'replacing', { replaceRequestId: requestId });
    return requestId;
  } catch (error) { throwCarrierError(error); }
}

export async function dispatchSwapNote(itemId: string): Promise<string | null> {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const source = await ts.getDeviceByIdentifier('mdn', item.source_mdn);
  const note = `Swapped ${chicagoDate()}`;
  if (source?.customField4 === note) return null;
  try {
    const requestId = item.custom_field_request_id || await ts.updateCustomFieldByMdn(item.source_mdn, 'CustomField4', note);
    await updateItemStatus(itemId, 'verifying', { customFieldRequestId: requestId });
    return requestId;
  } catch (error) { throwCarrierError(error); }
}

export async function getCarrierRequestStatus(requestId: string): Promise<'pending' | 'success' | 'failure'> {
  'use step';
  return new ThingSpaceService().getRequestStatus(requestId);
}

export async function verifyParked(itemId: string): Promise<boolean> {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const source = await ts.getDeviceByIdentifier('mdn', item.source_mdn);
  return Boolean(source && source.state === 'active' && source.iccid === item.parking_iccid && source.imei === item.parking_imei && source.customField5.toLowerCase() === 'contract ended');
}

export async function verifyDestinationActive(itemId: string): Promise<boolean> {
  'use step';
  const item = await requiredItem(itemId);
  return (await new ThingSpaceService().getDeviceByIdentifier('mdn', item.destination_mdn))?.state === 'active';
}

export async function verifyReplacement(itemId: string): Promise<boolean> {
  'use step';
  const item = await requiredItem(itemId);
  const destination = await new ThingSpaceService().getDeviceByIdentifier('mdn', item.destination_mdn);
  return Boolean(destination && destination.state === 'active' && destination.iccid === item.source_iccid && destination.imei === item.source_imei && destination.plan.trim() === item.source_plan.trim());
}

export async function verifySwapNote(itemId: string): Promise<boolean> {
  'use step';
  const item = await requiredItem(itemId);
  const source = await new ThingSpaceService().getDeviceByIdentifier('mdn', item.source_mdn);
  return Boolean(source && source.customField4 === `Swapped ${chicagoDate()}` && source.customField5.toLowerCase() === 'contract ended');
}

export async function finalizeInventory(itemId: string): Promise<void> {
  'use step';
  const item = await requiredItem(itemId);
  const ts = new ThingSpaceService();
  const sheet = new LineSwapSheetService();
  const [oldIccid, oldImei, inventory] = await Promise.all([
    ts.getDeviceByIdentifier('iccid', item.destination_iccid),
    ts.getDeviceByIdentifier('imei', item.destination_imei),
    sheet.listInventory(),
  ]);
  const now = new Date().toISOString();
  const parking = inventory.find(row => row.rowNumber === item.parking_sheet_row);
  if (!parking || parking.iccid !== item.parking_iccid || parking.imei !== item.parking_imei) throw new FatalError('Reserved parking sheet row changed');
  await sheet.updateInventoryRows([{
    ...parking,
    status: 'Used',
    usedAt: now,
    batchId: item.batch_id,
    provenance: `Parked ended-contract MDN ending ${item.source_mdn.slice(-4)}`,
    notes: 'Verified attached in ThingSpace',
  }]);

  const releasedStatus = oldIccid || oldImei || !isValidIccid(item.destination_iccid) || !isValidImei(item.destination_imei) ? 'Quarantined' : 'Available';
  const existingReleased = inventory.find(row => row.iccid === item.destination_iccid && row.imei === item.destination_imei);
  const released = {
    imei: item.destination_imei,
    iccid: item.destination_iccid,
    status: releasedStatus as 'Available' | 'Quarantined',
    reservedAt: '',
    usedAt: '',
    batchId: item.batch_id,
    provenance: `Released from contract-active MDN ending ${item.destination_mdn.slice(-4)}`,
    notes: releasedStatus === 'Available' ? 'Verified absent from ThingSpace after replacement' : 'Still present in ThingSpace or not reusable Inseego-format hardware; manual review required',
  };
  if (existingReleased) await sheet.updateInventoryRows([{ ...released, rowNumber: existingReleased.rowNumber }]);
  else await sheet.appendInventory(released);
  if (releasedStatus === 'Quarantined') throw new FatalError('Released destination hardware is still present in ThingSpace');
}

export async function completeItem(itemId: string): Promise<void> {
  'use step';
  await updateItemStatus(itemId, 'completed');
}

export async function completeItemWithWarning(itemId: string, message: string): Promise<void> {
  'use step';
  await updateItemStatus(itemId, 'completed_with_warning', {
    errorCode: 'CUSTOM_FIELD_WARNING',
    errorMessage: message.slice(0, 800),
  });
  const item = await requiredItem(itemId);
  await sendBatchAlert(item.batch_id, `Carrier swap completed with a metadata warning for source ${maskIdentifier(item.source_mdn)}`);
}

export async function handleItemFailure(itemId: string, message: string): Promise<void> {
  'use step';
  const item = await requiredItem(itemId);
  const sheet = new LineSwapSheetService();
  const inventory = await sheet.listInventory().catch(() => []);
  const parking = inventory.find(row => row.rowNumber === item.parking_sheet_row);
  const mutationStarted = ['parking', 'restoring', 'replacing', 'verifying'].includes(item.status) || Boolean(item.park_request_id);
  if (parking) {
    await sheet.updateInventoryRows([{
      ...parking,
      status: mutationStarted ? 'Quarantined' : 'Available',
      reservedAt: mutationStarted ? parking.reservedAt : '',
      batchId: mutationStarted ? item.batch_id : '',
      notes: mutationStarted ? 'Carrier workflow failed after mutation began; manual review required' : 'Preview reservation released after preflight failure',
    }]).catch(() => undefined);
  }
  await updateItemStatus(itemId, mutationStarted ? 'quarantined' : 'failed', {
    errorCode: mutationStarted ? 'PARTIAL_CARRIER_FAILURE' : 'PREFLIGHT_FAILURE',
    errorMessage: message.slice(0, 800),
  });
  await sendBatchAlert(item.batch_id, `Line swap ${mutationStarted ? 'quarantined' : 'failed'} for source ${maskIdentifier(item.source_mdn)}`);
}

export async function finishBatch(batchId: string): Promise<void> {
  'use step';
  await finalizeBatch(batchId);
  await sendBatchAlert(batchId, 'Contract-line swap batch finished');
}

async function requiredItem(itemId: string): Promise<ExecutableSwapItem> {
  const item = await getItem(itemId);
  if (!item) throw new FatalError('Swap item not found');
  if (!item.executable || !item.destination_mdn || !item.destination_iccid || !item.destination_imei || !item.parking_sheet_row || !item.parking_iccid || !item.parking_imei) {
    throw new FatalError('Swap item does not have a complete executable mapping');
  }
  return item as ExecutableSwapItem;
}

async function sendBatchAlert(batchId: string, title: string): Promise<void> {
  const snapshot = await getBatch(batchId);
  if (!snapshot) return;
  const counts = snapshot.counts;
  const completed = Number(counts.completed || 0);
  const failed = Number(counts.failed || 0) + Number(counts.quarantined || 0) + Number(counts.completed_with_warning || 0);
  const inProcess = snapshot.items.filter((item: { status: string }) => ['reserved', 'parking', 'restoring', 'replacing', 'verifying'].includes(item.status)).length;
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const url = base ? `${base}/ops/line-swaps?batch=${batchId}` : '';
  await postDirectToSlack(DONALD_VICKER_ID, [
    { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150) } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Completed*\n${completed}` },
      { type: 'mrkdwn', text: `*Failed / review*\n${failed}` },
      { type: 'mrkdwn', text: `*In process*\n${inProcess}` },
      { type: 'mrkdwn', text: `*Batch*\n\`${batchId}\`` },
    ] },
    ...(url ? [{ type: 'section', text: { type: 'mrkdwn', text: `<${url}|Open batch>` } }] : []),
  ], `${title}: ${completed} completed, ${failed} failed/review, ${inProcess} in process`);
}

function chicagoDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function throwCarrierError(error: unknown): never {
  const status = Number((error as { status?: number } | null)?.status || 0);
  const message = error instanceof Error ? error.message : 'Carrier request failed';
  if (status === 429) throw new RetryableError(message, { retryAfter: '1m' });
  if (status >= 400 && status < 500) throw new FatalError(message);
  throw error;
}
