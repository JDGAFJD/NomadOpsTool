import { randomUUID } from 'node:crypto';
import { queryOpsDb, withOpsDbTransaction } from '../opsDb';
import type { ChargebeeEligibility, InventoryRow, NormalizedThingSpaceDevice, SwapItemStatus } from './types';

export type PreviewItemInput = {
  source: NormalizedThingSpaceDevice;
  eligibility: ChargebeeEligibility;
  destination: NormalizedThingSpaceDevice | null;
  parking: InventoryRow | null;
  executable: boolean;
  blockReason: string | null;
};

export type SwapItemRecord = {
  id: string; batch_id: string; position: number; status: SwapItemStatus; executable: boolean;
  block_reason: string | null; source_mdn: string; source_iccid: string; source_imei: string; source_plan: string;
  destination_mdn: string | null; destination_iccid: string | null; destination_imei: string | null;
  parking_sheet_row: number | null; parking_iccid: string | null; parking_imei: string | null;
  park_request_id: string | null; restore_request_id: string | null; replace_request_id: string | null;
  custom_field_request_id: string | null; error_message: string | null;
  chargebee_status: string | null; chargebee_invoice_status: string | null; chargebee_reason: string;
};

export async function ensureLineSwapTables(): Promise<void> {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_line_swap_batches (
      id UUID PRIMARY KEY,
      requested_size INTEGER NOT NULL CHECK (requested_size BETWEEN 1 AND 50),
      operator_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'preview',
      workflow_run_id TEXT,
      confirmed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_line_swap_items (
      id UUID PRIMARY KEY,
      batch_id UUID NOT NULL REFERENCES ops_line_swap_batches(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      status TEXT NOT NULL,
      executable BOOLEAN NOT NULL,
      block_reason TEXT,
      source_internal_id BIGINT NOT NULL,
      source_mdn TEXT NOT NULL,
      source_iccid TEXT NOT NULL,
      source_imei TEXT NOT NULL,
      source_plan TEXT NOT NULL,
      source_cf4 TEXT NOT NULL DEFAULT '',
      source_cf5 TEXT NOT NULL DEFAULT '',
      destination_internal_id BIGINT,
      destination_mdn TEXT,
      destination_iccid TEXT,
      destination_imei TEXT,
      parking_sheet_row INTEGER,
      parking_iccid TEXT,
      parking_imei TEXT,
      chargebee_subscription_id TEXT,
      chargebee_customer_id TEXT,
      chargebee_status TEXT,
      chargebee_invoice_id TEXT,
      chargebee_invoice_status TEXT,
      chargebee_amount_due BIGINT,
      chargebee_reason TEXT NOT NULL,
      park_request_id TEXT,
      restore_request_id TEXT,
      replace_request_id TEXT,
      custom_field_request_id TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE(batch_id, position)
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_line_swap_events (
      id BIGSERIAL PRIMARY KEY,
      batch_id UUID NOT NULL REFERENCES ops_line_swap_batches(id) ON DELETE CASCADE,
      item_id UUID REFERENCES ops_line_swap_items(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_line_swap_items_batch ON ops_line_swap_items(batch_id, position)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_line_swap_items_status ON ops_line_swap_items(status)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_line_swap_batches_status ON ops_line_swap_batches(status, expires_at)`);
}

export async function createPreviewBatch(operatorEmail: string, requestedSize: number, items: PreviewItemInput[]): Promise<string> {
  await ensureLineSwapTables();
  const batchId = randomUUID();
  await withOpsDbTransaction(async client => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ops_line_swap_preview'))`);
    await client.query(
      `INSERT INTO ops_line_swap_batches (id, requested_size, operator_email, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes')`,
      [batchId, requestedSize, operatorEmail],
    );
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.executable) {
        const conflict = await client.query(
          `SELECT id FROM ops_line_swap_items
           WHERE status IN ('reserved','parking','restoring','replacing','verifying')
             AND (source_mdn = $1 OR destination_mdn = $2 OR parking_iccid = $3)
           LIMIT 1`,
          [item.source.mdn, item.destination?.mdn, item.parking?.iccid],
        );
        if (conflict.rowCount) throw new Error('A selected line or inventory row was reserved concurrently; preview again');
      }
      await client.query(
        `INSERT INTO ops_line_swap_items (
          id, batch_id, position, status, executable, block_reason,
          source_internal_id, source_mdn, source_iccid, source_imei, source_plan, source_cf4, source_cf5,
          destination_internal_id, destination_mdn, destination_iccid, destination_imei,
          parking_sheet_row, parking_iccid, parking_imei,
          chargebee_subscription_id, chargebee_customer_id, chargebee_status,
          chargebee_invoice_id, chargebee_invoice_status, chargebee_amount_due, chargebee_reason
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
        )`,
        [
          randomUUID(), batchId, index + 1, item.executable ? 'reserved' : 'blocked', item.executable, item.blockReason,
          item.source.internalId, item.source.mdn, item.source.iccid, item.source.imei, item.source.plan, item.source.customField4, item.source.customField5,
          item.destination?.internalId || null, item.destination?.mdn || null, item.destination?.iccid || null, item.destination?.imei || null,
          item.parking?.rowNumber || null, item.parking?.iccid || null, item.parking?.imei || null,
          item.eligibility.subscriptionId, item.eligibility.customerId, item.eligibility.subscriptionStatus,
          item.eligibility.latestInvoiceId, item.eligibility.latestInvoiceStatus, item.eligibility.latestInvoiceAmountDue, item.eligibility.reasonCode,
        ],
      );
    }
    await client.query(`INSERT INTO ops_line_swap_events (batch_id, event_type, detail) VALUES ($1, 'preview_created', $2::jsonb)`, [batchId, JSON.stringify({ requestedSize, candidates: items.length })]);
  });
  return batchId;
}

export async function getBatch(batchId: string) {
  await ensureLineSwapTables();
  const [batch, items, events] = await Promise.all([
    queryOpsDb(`SELECT * FROM ops_line_swap_batches WHERE id = $1`, [batchId]),
    queryOpsDb(`SELECT * FROM ops_line_swap_items WHERE batch_id = $1 ORDER BY position`, [batchId]),
    queryOpsDb(`SELECT * FROM ops_line_swap_events WHERE batch_id = $1 ORDER BY id DESC LIMIT 100`, [batchId]),
  ]);
  if (!batch.rows[0]) return null;
  const counts = items.rows.reduce((acc: Record<string, number>, item: { status: string }) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return { batch: batch.rows[0], items: items.rows, events: events.rows, counts };
}

export async function getItem(itemId: string): Promise<SwapItemRecord | null> {
  await ensureLineSwapTables();
  return (await queryOpsDb(`SELECT * FROM ops_line_swap_items WHERE id = $1`, [itemId])).rows[0] || null;
}

export async function getExecutableItemIds(batchId: string): Promise<string[]> {
  const result = await queryOpsDb(
    `SELECT id FROM ops_line_swap_items WHERE batch_id = $1 AND executable = TRUE AND status IN ('reserved','failed','completed_with_warning') ORDER BY position`,
    [batchId],
  );
  return result.rows.map(row => row.id);
}

export async function claimBatchForStart(batchId: string): Promise<void> {
  const result = await queryOpsDb(
    `UPDATE ops_line_swap_batches SET status = 'starting', confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'preview' AND expires_at > NOW()`,
    [batchId],
  );
  if (!result.rowCount) throw new Error('Preview expired, was already confirmed, or does not exist');
}

export async function attachWorkflowRun(batchId: string, runId: string): Promise<void> {
  await queryOpsDb(
    `UPDATE ops_line_swap_batches SET status = 'running', workflow_run_id = $2, updated_at = NOW() WHERE id = $1 AND status = 'starting'`,
    [batchId, runId],
  );
  await addSwapEvent(batchId, null, 'batch_confirmed', { runId });
}

export async function resetBatchStart(batchId: string, message: string): Promise<void> {
  await queryOpsDb(
    `UPDATE ops_line_swap_batches SET status = 'preview', confirmed_at = NULL, updated_at = NOW() WHERE id = $1 AND status = 'starting'`,
    [batchId],
  );
  await addSwapEvent(batchId, null, 'workflow_start_failed', { message: message.slice(0, 500) });
}

export async function updateItemStatus(itemId: string, status: SwapItemStatus, fields: Record<string, unknown> = {}): Promise<void> {
  const allowed: Record<string, string> = {
    parkRequestId: 'park_request_id', restoreRequestId: 'restore_request_id', replaceRequestId: 'replace_request_id',
    customFieldRequestId: 'custom_field_request_id', errorCode: 'error_code', errorMessage: 'error_message',
  };
  const values: unknown[] = [itemId, status];
  const assignments = [`status = $2`, `updated_at = NOW()`];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed[key]) continue;
    values.push(value);
    assignments.push(`${allowed[key]} = $${values.length}`);
  }
  if (['completed', 'completed_with_warning', 'quarantined', 'failed'].includes(status)) assignments.push(`completed_at = NOW()`);
  await queryOpsDb(`UPDATE ops_line_swap_items SET ${assignments.join(', ')} WHERE id = $1`, values);
  const item = await getItem(itemId);
  if (item) await addSwapEvent(item.batch_id, itemId, `item_${status}`, fields);
}

export async function addSwapEvent(batchId: string, itemId: string | null, eventType: string, detail: Record<string, unknown> = {}): Promise<void> {
  await queryOpsDb(
    `INSERT INTO ops_line_swap_events (batch_id, item_id, event_type, detail) VALUES ($1, $2, $3, $4::jsonb)`,
    [batchId, itemId, eventType, JSON.stringify(detail)],
  );
}

export async function finalizeBatch(batchId: string): Promise<void> {
  const result = await queryOpsDb(`SELECT status, COUNT(*)::int AS count FROM ops_line_swap_items WHERE batch_id = $1 GROUP BY status`, [batchId]);
  const counts = Object.fromEntries(result.rows.map(row => [row.status, Number(row.count)]));
  const failed = (counts.failed || 0) + (counts.quarantined || 0) + (counts.completed_with_warning || 0);
  await queryOpsDb(
    `UPDATE ops_line_swap_batches SET status = $2, updated_at = NOW() WHERE id = $1`,
    [batchId, failed ? 'completed_with_failures' : 'completed'],
  );
  await addSwapEvent(batchId, null, 'batch_finished', counts);
}

export async function activeReservations(): Promise<{ sourceMdns: Set<string>; destinationMdns: Set<string>; parkingIccids: Set<string> }> {
  await ensureLineSwapTables();
  const result = await queryOpsDb(
    `SELECT source_mdn, destination_mdn, parking_iccid FROM ops_line_swap_items
     WHERE status IN ('reserved','parking','restoring','replacing','verifying')`,
  );
  return {
    sourceMdns: new Set(result.rows.map(row => row.source_mdn).filter(Boolean)),
    destinationMdns: new Set(result.rows.map(row => row.destination_mdn).filter(Boolean)),
    parkingIccids: new Set(result.rows.map(row => row.parking_iccid).filter(Boolean)),
  };
}
