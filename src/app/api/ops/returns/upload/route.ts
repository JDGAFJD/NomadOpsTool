import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb, logActivity } from '@/lib/opsDb';
import {
  RETURN_MANAGER_ROLES,
  auditReturn,
  ensureReturnsTables,
  hasRole,
  parseReturnsCsv,
} from '@/lib/returnsWorkflow';

export const dynamic = 'force-dynamic';

type ImeiRow = { imei: string };

export async function GET() {
  try {
    const session = await verifyAuth();
    if (!hasRole(session, RETURN_MANAGER_ROLES)) {
      return NextResponse.json({ error: 'Returns Manager access required' }, { status: 403 });
    }

    await ensureReturnsTables();
    const batches = await queryOpsDb(`
      SELECT b.*,
             COUNT(r.id)::int AS stored_rows,
             COUNT(*) FILTER (WHERE r.status IN ('uploaded', 'match_found', 'needs_manual_review', 'ready_to_cancel'))::int AS pending_rows,
             COUNT(*) FILTER (WHERE r.status IN ('canceled', 'completed'))::int AS completed_rows
      FROM ops_return_batches b
      LEFT JOIN ops_returns r ON r.batch_uuid = b.batch_uuid
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT 30
    `);

    const recentReturns = await queryOpsDb(`
      SELECT id, batch_uuid, imei, device_condition, tracking_number, received_at, status,
             chargebee_subscription_id, chargebee_customer_email, error_message
      FROM ops_returns
      ORDER BY received_at DESC
      LIMIT 100
    `);

    return NextResponse.json({ success: true, batches: batches.rows, returns: recentReturns.rows });
  } catch (err: unknown) {
    console.error('Returns upload history error:', err);
    return NextResponse.json({ error: 'Failed to load returns upload history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!hasRole(session, RETURN_MANAGER_ROLES)) {
      return NextResponse.json({ error: 'Returns Manager access required' }, { status: 403 });
    }

    await ensureReturnsTables();

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 });
    }

    const text = await file.text();
    const parsed = parseReturnsCsv(text);
    const imeis = parsed.rows.map((row) => row.imei);
    const existing = imeis.length
      ? await queryOpsDb('SELECT imei FROM ops_returns WHERE imei = ANY($1::text[])', [imeis])
      : { rows: [] };
    const existingImeis = new Set((existing.rows as ImeiRow[]).map((row) => row.imei));
    const rowsToInsert = parsed.rows.filter((row) => !existingImeis.has(row.imei));
    const rejected = [
      ...parsed.rejected,
      ...parsed.rows
        .filter((row) => existingImeis.has(row.imei))
        .map((row) => ({ row: null, reason: 'IMEI already exists in returns database', imei: row.imei })),
    ];

    const batchUuid = crypto.randomUUID();
    await queryOpsDb(
      `INSERT INTO ops_return_batches
         (batch_uuid, uploaded_by, file_name, total_rows, imported_rows, rejected_rows)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [batchUuid, session.email, file.name || 'returns.csv', parsed.rows.length + parsed.rejected.length, rowsToInsert.length, rejected.length]
    );

    const imported = [];
    for (const row of rowsToInsert) {
      const inserted = await queryOpsDb(
        `INSERT INTO ops_returns
           (batch_uuid, imei, device_condition, tracking_number, uploaded_by, status)
         VALUES ($1, $2, $3, $4, $5, 'uploaded')
         RETURNING id, imei, device_condition, tracking_number, received_at, status`,
        [batchUuid, row.imei, row.device_condition, row.tracking_number, session.email]
      );
      const returnRecord = inserted.rows[0];
      imported.push(returnRecord);
      await auditReturn(returnRecord.id, session.email, 'uploaded_return', {
        batchUuid,
        trackingNumber: row.tracking_number,
        deviceCondition: row.device_condition,
      });
    }

    await logActivity(session.email, 'returns_csv_upload', `${rowsToInsert.length} imported`, request);

    return NextResponse.json({
      success: true,
      batchUuid,
      importedCount: rowsToInsert.length,
      rejectedCount: rejected.length,
      imported,
      rejected,
    });
  } catch (err: unknown) {
    console.error('Returns upload error:', err);
    return NextResponse.json({ error: 'Failed to process returns CSV' }, { status: 500 });
  }
}
