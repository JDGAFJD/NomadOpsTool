import { ChargebeeService } from '../services/ChargebeeService';
import { LineSwapSheetService } from '../services/LineSwapSheetService';
import { ThingSpaceService } from '../services/ThingSpaceService';
import { ThingSpaceSyncSheetService } from '../services/ThingSpaceSyncSheetService';
import { evaluateChargebeeEligibility, isDestinationCandidate, isSourceCandidate } from './rules';
import { activeReservations, createPreviewBatch, getBatch, type PreviewItemInput, type PreviewSourceMetadata } from './store';
import { type ChargebeeEligibility, type InventoryRow, type NormalizedThingSpaceDevice } from './types';
import { queryOpsDb } from '../opsDb';

export async function buildLineSwapPreview(operatorEmail: string, requestedSize: number) {
  const size = Math.max(1, Math.min(50, Math.trunc(requestedSize)));
  const thingSpace = new ThingSpaceService();
  const chargebee = new ChargebeeService();
  const sheet = new LineSwapSheetService();
  if (!thingSpace.isConfigured()) throw new Error('ThingSpace is not configured');
  if (!sheet.isConfigured()) throw new Error('Google Sheets service account is not configured');

  await releaseExpiredReservations(sheet);
  const [inventory, reservations] = await Promise.all([sheet.listInventory(), activeReservations()]);

  const selection = await loadCandidatePool(thingSpace, size, reservations);
  const sources = selection.sources;
  console.info('[line-swaps:preview] candidates loaded', { source: selection.metadata.dataSource, sourceCount: sources.length });

  // Exactly one logical Chargebee evaluation per selected source ICCID.
  const eligibilityEntries = await Promise.all(sources.map(async source => [source.mdn, await chargebeeEligibility(chargebee, source.iccid)] as const));
  const eligibilityByMdn = new Map(eligibilityEntries);
  const eligibleCount = sources.filter(source => eligibilityByMdn.get(source.mdn)?.eligible).length;

  const inventoryCandidates = inventory.filter(row => row.status === 'Available' && !reservations.parkingIccids.has(row.iccid));
  const availableInventory = await findUnusedParkingHardware(thingSpace, inventoryCandidates, eligibleCount);
  const destinationNeeds = countDestinationNeeds(sources, eligibilityByMdn, availableInventory.length);
  let destinationSnapshot = selection.snapshotDevices;
  try {
    const destinationPools = await loadDestinations(thingSpace, destinationSnapshot, destinationNeeds, reservations.destinationMdns);
    return await finishPreview({ operatorEmail, size, sources, eligibilityByMdn, availableInventory, destinationPools, selection, sheet });
  } catch (error) {
    if (destinationSnapshot || !isFallbackEligibleError(error)) throw error;
    console.warn('[line-swaps:preview] filtered destination request failed; using fresh TS_Lines fallback', safeError(error));
    const snapshot = await new ThingSpaceSyncSheetService().loadFreshSnapshot();
    destinationSnapshot = snapshot.devices;
    selection.metadata = { dataSource: 'Sheet fallback', sourceVerifiedAt: snapshot.verifiedAt, sourceSnapshotAgeSeconds: Math.floor(snapshot.ageMs / 1000) };
    const destinationPools = await loadDestinations(thingSpace, destinationSnapshot, destinationNeeds, reservations.destinationMdns);
    return await finishPreview({ operatorEmail, size, sources, eligibilityByMdn, availableInventory, destinationPools, selection, sheet });
  }
}

async function finishPreview({ operatorEmail, size, sources, eligibilityByMdn, availableInventory, destinationPools, selection, sheet }: {
  operatorEmail: string; size: number; sources: NormalizedThingSpaceDevice[]; eligibilityByMdn: Map<string, ChargebeeEligibility>;
  availableInventory: InventoryRow[]; destinationPools: Map<string, NormalizedThingSpaceDevice[]>;
  selection: { metadata: PreviewSourceMetadata }; sheet: LineSwapSheetService;
}) {

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
    if (executable) usedInventoryRows.add(parking!.rowNumber);
    items.push({ source, eligibility, destination, parking, executable, blockReason });
  }

  const batchId = await createPreviewBatch(operatorEmail, size, items, selection.metadata);
  const now = new Date().toISOString();
  const reservationsToWrite = items.filter(item => item.executable && item.parking).map(item => ({
    ...item.parking!, status: 'Reserved' as const, reservedAt: now, batchId,
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

async function loadCandidatePool(
  thingSpace: ThingSpaceService,
  size: number,
  reservations: Awaited<ReturnType<typeof activeReservations>>,
): Promise<{ sources: NormalizedThingSpaceDevice[]; snapshotDevices: NormalizedThingSpaceDevice[] | null; metadata: PreviewSourceMetadata }> {
  const verifiedAt = new Date().toISOString();
  try {
    const sources = await thingSpace.listFilteredDevices({
      currentState: 'active', customField5: 'Contract Ended', limit: size,
      accept: device => isSourceCandidate(device) && !reservations.sourceMdns.has(device.mdn),
    });
    return { sources, snapshotDevices: null, metadata: { dataSource: 'ThingSpace live', sourceVerifiedAt: verifiedAt, sourceSnapshotAgeSeconds: null } };
  } catch (error) {
    if (!isFallbackEligibleError(error)) throw error;
    console.warn('[line-swaps:preview] filtered ThingSpace request failed; attempting fresh TS_Lines fallback', safeError(error));
    const snapshot = await new ThingSpaceSyncSheetService().loadFreshSnapshot();
    const sources = snapshot.devices.filter(isSourceCandidate).filter(device => !reservations.sourceMdns.has(device.mdn)).slice(0, size);
    return {
      sources,
      snapshotDevices: snapshot.devices,
      metadata: { dataSource: 'Sheet fallback', sourceVerifiedAt: snapshot.verifiedAt, sourceSnapshotAgeSeconds: Math.floor(snapshot.ageMs / 1000) },
    };
  }
}

async function loadDestinations(
  thingSpace: ThingSpaceService,
  snapshotDevices: NormalizedThingSpaceDevice[] | null,
  needs: Map<string, number>,
  reservedMdns: Set<string>,
): Promise<Map<string, NormalizedThingSpaceDevice[]>> {
  const entries = await Promise.all([...needs].map(async ([plan, needed]) => {
    const candidates = snapshotDevices
      ? snapshotDevices.filter(device => isDestinationCandidate(device, plan) && !reservedMdns.has(device.mdn)).slice(0, needed)
      : await thingSpace.listFilteredDevices({
        currentState: 'suspend', customField5: 'Contract Active', servicePlan: plan, limit: needed,
        accept: device => isDestinationCandidate(device, plan) && !reservedMdns.has(device.mdn),
      });
    return [plan, candidates] as const;
  }));
  return new Map(entries);
}

export async function findUnusedParkingHardware(thingSpace: ThingSpaceService, rows: InventoryRow[], needed: number): Promise<InventoryRow[]> {
  const found: InventoryRow[] = [];
  for (let offset = 0; offset < rows.length && found.length < needed; offset += 8) {
    const chunk = rows.slice(offset, offset + 8);
    const checks = await Promise.all(chunk.map(async row => {
      const [byIccid, byImei] = await Promise.all([
        thingSpace.getDeviceByIdentifier('iccid', row.iccid),
        thingSpace.getDeviceByIdentifier('imei', row.imei),
      ]);
      return !byIccid && !byImei ? row : null;
    }));
    found.push(...checks.filter((row): row is InventoryRow => Boolean(row)));
  }
  return found.slice(0, needed);
}

function countDestinationNeeds(sources: NormalizedThingSpaceDevice[], eligibility: Map<string, ChargebeeEligibility>, parkingCapacity: number) {
  const needs = new Map<string, number>();
  for (const source of sources) {
    if (parkingCapacity <= 0) break;
    if (!eligibility.get(source.mdn)?.eligible) continue;
    needs.set(source.plan, (needs.get(source.plan) || 0) + 1);
    parkingCapacity -= 1;
  }
  return needs;
}

export function isFallbackEligibleError(error: unknown): boolean {
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 429 || status >= 500 || status === 401 || status === 403) return true;
  const text = safeError(error).toLowerCase();
  return /timeout|timed out|authentication|session|oauth|fetch failed|econnreset|etimedout/.test(text);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
}

async function releaseExpiredReservations(sheet: LineSwapSheetService): Promise<void> {
  const expired = await queryOpsDb(
    `SELECT i.id, i.batch_id, i.parking_sheet_row FROM ops_line_swap_items i JOIN ops_line_swap_batches b ON b.id = i.batch_id
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
    if (!subscription.id) return;
    const latest = await chargebee.getLatestInvoiceForSubscription(subscription.id);
    invoices.set(subscription.id, latest ? [latest] : []);
  }));
  return evaluateChargebeeEligibility(subscriptions, invoices);
}
