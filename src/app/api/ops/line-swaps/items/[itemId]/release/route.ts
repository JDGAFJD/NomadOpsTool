import { verifyAuth } from '@/lib/auth';
import { getItem, updateItemStatus } from '@/lib/lineSwaps/store';
import { LineSwapSheetService } from '@/lib/services/LineSwapSheetService';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await verifyAuth();
  if (!session || session.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (!item || !['failed', 'quarantined'].includes(item.status)) return Response.json({ error: 'Reservation is not releasable' }, { status: 409 });
  const ts = new ThingSpaceService();
  const [iccid, imei] = await Promise.all([
    ts.getDeviceByIdentifier('iccid', item.parking_iccid || ''),
    ts.getDeviceByIdentifier('imei', item.parking_imei || ''),
  ]);
  if (iccid || imei) return Response.json({ error: 'Hardware is still present in ThingSpace and must remain quarantined' }, { status: 409 });
  const sheet = new LineSwapSheetService();
  const row = (await sheet.listInventory()).find(entry => entry.rowNumber === item.parking_sheet_row);
  if (!row || row.iccid !== item.parking_iccid || row.imei !== item.parking_imei) return Response.json({ error: 'Sheet inventory row changed' }, { status: 409 });
  await sheet.updateInventoryRows([{ ...row, status: 'Available', reservedAt: '', batchId: '', provenance: '', notes: `Released by ${session.email} after exact ThingSpace absence check` }]);
  await updateItemStatus(itemId, 'failed', { errorCode: 'RESERVATION_RELEASED', errorMessage: 'Quarantine released by admin after exact absence check' });
  return Response.json({ success: true });
}
