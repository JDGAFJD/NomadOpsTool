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

  console.info('[line-swaps:preview] base data loaded', { deviceCount: devices.length, sourceCount: sources.length, inventoryCount: availableInventory.length });

  const eligibilityEntries = await Promise.all(sources.map(async source => [source.mdn, await chargebeeEligibility(chargebee, source.iccid)] as const));
  const eligibilityByMdn = new Map(eligibilityEntries);
  const destinationNeeds = new Map<string, number>();
  let parkingCapacity = availableInventory.length;
  for (const source of sources) {
    if (parkingCapacity <= 0) break;
    if (!eligibilityByMdn.get(source.mdn)?.eligible) continue;
    destinationNeeds.set(source.plan, (destinationNeeds.get(source.plan) || 0) + 1);
    parkingCapacity -= 1;
  }
  const destinationPools = new Map(await Promise.all([...destinationNeeds].map(async ([plan, needed]) => [
    plan,
    await findSafeDestinations(chargebee, suspended.filter(candidate => isDestinationCandidate(candidate, plan)), needed),
  ] as const)));

  const usedInventoryRows = new Set<number>();
  const items: PreviewItemInput[] = [];

  for (const source of sources) {
    const eligibility = eligibilityByMdn.get(source.mdn)!;
    let destination: NormalizedThingSpaceDevice | null = null;
    let parking: InventoryRow | null = null;
    let blockReason: string | null = eligibility.eligible ? null : eligibility.reasonCode;

    if (eligibility.eligible) {
      parking = availableInventory.find(row => !usedInventoryRows.has(row.rowNumber)) || null;
      if (!parking) blockReason = 'NO_AVAILABLE_PARKING_HARDWARE';
    }

    if (eligibility.eligible && parking) {
      destination = destinationPools.get(source.plan)?.shift() || null;
      if (!destination) blockReason = 'NO_SAFE_SAME_PLAN_DESTINATION';
    }

    const executable = eligibility.eligible && Boolean(parking && destination) && !blockReason;
    if (executable) {
      usedInventoryRows.add(parking!.rowNumber);
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
  const snapshot = await getBatch(batchId);
  if (!snapshot) throw new Error('Preview batch was created but could not be reloaded');
  return snapshot;
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

async function findSafeDestinations(chargebee: ChargebeeService, candidates: NormalizedThingSpaceDevice[], needed: number) {
  const safe: NormalizedThingSpaceDevice[] = [];
  const concurrency = 8;
  const inspectionLimit = Math.min(candidates.length, Math.max(needed * 8, 32));
  for (let offset = 0; offset < inspectionLimit && safe.length < needed; offset += concurrency) {
    const window = candidates.slice(offset, Math.min(offset + concurrency, inspectionLimit));
    const results = await Promise.all(window.map(async candidate => {
      const subscriptions = await chargebee.findSubscriptionsByIccid(candidate.iccid);
      const hasActiveLike = subscriptions.some(subscription => ACTIVE_LIKE_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase()));
      return hasActiveLike ? null : candidate;
    }));
    safe.push(...results.filter((candidate): candidate is NormalizedThingSpaceDevice => Boolean(candidate)));
  }
  console.info('[line-swaps:preview] destination scan completed', { plan: candidates[0]?.plan || '', inspected: inspectionLimit, safeCount: safe.length, needed });
  return safe.slice(0, needed);
}
