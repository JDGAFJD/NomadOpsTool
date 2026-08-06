import { ChargebeeService } from '../services/ChargebeeService';
import { LineSwapSheetService } from '../services/LineSwapSheetService';
import { ThingSpaceService } from '../services/ThingSpaceService';
import { evaluateChargebeeEligibility, isDestinationCandidate, isSourceCandidate } from './rules';
import { activeReservations, createPreviewBatch, getBatch, type PreviewItemInput } from './store';
import { ACTIVE_LIKE_SUBSCRIPTION_STATUSES, type ChargebeeEligibility, type InventoryRow, type NormalizedThingSpaceDevice } from './types';
import { queryOpsDb } from '../opsDb';

export async function buildLineSwapPreview(operatorEmail: string, requestedSize: number) {
  const size = Math.max(1, Math.min(50, Math.trunc(requestedSize)));
  const thingSpace = new ThingSpaceService();
  const chargebee = new ChargebeeService();
  const sheet = new LineSwapSheetService();
  if (!thingSpace.isConfigured()) throw new Error('ThingSpace is not configured');
  if (!sheet.isConfigured()) throw new Error('Google Sheets service account is not configured');

  await releaseExpiredReservations(sheet);

  const [devices, inventory, reservations] = await Promise.all([
    thingSpace.listAllDevices(),
    sheet.listInventory(),
    activeReservations(),
  ]);

  const occupiedIccids = new Set(devices.map(device => device.iccid).filter(Boolean));
  const occupiedImeis = new Set(devices.map(device => device.imei).filter(Boolean));
  const availableInventory = inventory.filter(row => row.status === 'Available'
    && !reservations.parkingIccids.has(row.iccid)
    && !occupiedIccids.has(row.iccid)
    && !occupiedImeis.has(row.imei));

  const sources = devices.filter(isSourceCandidate)
    .filter(device => !reservations.sourceMdns.has(device.mdn))
    .slice(0, size);
  const suspended = devices.filter(device => device.state === 'suspend' && device.customField5.toLowerCase() === 'contract active')
    .filter(device => !reservations.destinationMdns.has(device.mdn));

  const usedDestinationMdns = new Set<string>();
  const usedInventoryRows = new Set<number>();
  const items: PreviewItemInput[] = [];

  for (const source of sources) {
    const eligibility = await chargebeeEligibility(chargebee, source.iccid);
    let destination: NormalizedThingSpaceDevice | null = null;
    let parking: InventoryRow | null = null;
    let blockReason: string | null = eligibility.eligible ? null : eligibility.reasonCode;

    if (eligibility.eligible) {
      parking = availableInventory.find(row => !usedInventoryRows.has(row.rowNumber)) || null;
      if (!parking) blockReason = 'NO_AVAILABLE_PARKING_HARDWARE';
    }

    if (eligibility.eligible && parking) {
      for (const candidate of suspended) {
        if (usedDestinationMdns.has(candidate.mdn) || !isDestinationCandidate(candidate, source.plan)) continue;
        const subscriptions = await chargebee.findSubscriptionsByIccid(candidate.iccid);
        const hasActiveLike = subscriptions.some(subscription => ACTIVE_LIKE_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase()));
        if (!hasActiveLike) {
          destination = candidate;
          break;
        }
      }
      if (!destination) blockReason = 'NO_SAFE_SAME_PLAN_DESTINATION';
    }

    const executable = eligibility.eligible && Boolean(parking && destination) && !blockReason;
    if (executable) {
      usedInventoryRows.add(parking!.rowNumber);
      usedDestinationMdns.add(destination!.mdn);
    }
    items.push({ source, eligibility, destination, parking, executable, blockReason });
  }

  const batchId = await createPreviewBatch(operatorEmail, size, items);
  const now = new Date().toISOString();
  const reservationsToWrite = items.filter(item => item.executable && item.parking).map(item => ({
    ...item.parking!,
    status: 'Reserved' as const,
    reservedAt: now,
    batchId,
    provenance: `Reserved for contract-line swap from MDN ending ${item.source.mdn.slice(-4)}`,
    notes: 'Expires 30 minutes after preview creation if not confirmed',
  }));
  try {
    await sheet.ensureSchema();
    await sheet.updateInventoryRows(reservationsToWrite);
  } catch (error) {
    await Promise.all(reservationsToWrite.map(row => sheet.updateInventoryRows([{ ...row, status: 'Quarantined', notes: 'Reservation write was not fully confirmed; manual review required' }]).catch(() => undefined)));
    throw error;
  }
  return getBatch(batchId);
}

async function releaseExpiredReservations(sheet: LineSwapSheetService): Promise<void> {
  const expired = await queryOpsDb(
    `SELECT i.id, i.batch_id, i.parking_sheet_row
     FROM ops_line_swap_items i JOIN ops_line_swap_batches b ON b.id = i.batch_id
     WHERE b.status = 'preview' AND b.expires_at <= NOW() AND i.status = 'reserved'`,
  ).catch(() => ({ rows: [] as Array<{ id: string; batch_id: string; parking_sheet_row: number }> }));
  if (!expired.rows.length) return;
  const inventory = await sheet.listInventory();
  const updates = expired.rows.map(row => inventory.find(item => item.rowNumber === row.parking_sheet_row && item.batchId === row.batch_id))
    .filter((row): row is InventoryRow => Boolean(row))
    .map(row => ({ ...row, status: 'Available' as const, reservedAt: '', batchId: '', provenance: '', notes: 'Expired preview reservation released automatically' }));
  await sheet.updateInventoryRows(updates);
  const batchIds = [...new Set(expired.rows.map(row => row.batch_id))];
  await queryOpsDb(`UPDATE ops_line_swap_items SET status = 'failed', error_code = 'PREVIEW_EXPIRED', error_message = 'Preview reservation expired', completed_at = NOW(), updated_at = NOW() WHERE batch_id = ANY($1::uuid[]) AND status = 'reserved'`, [batchIds]);
  await queryOpsDb(`UPDATE ops_line_swap_batches SET status = 'failed', updated_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'preview'`, [batchIds]);
}

async function chargebeeEligibility(chargebee: ChargebeeService, iccid: string): Promise<ChargebeeEligibility> {
  const subscriptions = await chargebee.findSubscriptionsByIccid(iccid);
  const invoices = new Map<string, Array<{ id?: string; status?: string; amount_due?: number; date?: number; created_at?: number }>>();
  await Promise.all(subscriptions.map(async subscription => {
    if (subscription.id) invoices.set(subscription.id, await chargebee.getAllInvoicesForSubscription(subscription.id));
  }));
  return evaluateChargebeeEligibility(subscriptions, invoices);
}
