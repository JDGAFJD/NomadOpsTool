import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCallReportTables, processCallReportDate } from '@/lib/callReports';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

async function requireAdmin() {
  const session = await verifyAuth();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }) };
  return { session };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  try {
    await ensureCallReportTables();
    const body = await request.json();
    const extension = String(body.extension || '').replace(/\D/g, '');
    const opsEmail = String(body.opsEmail || '').trim().toLowerCase();
    const displayName = String(body.displayName || '').trim();
    if (!extension || !opsEmail) return NextResponse.json({ error: 'Extension and OPS user are required.' }, { status: 400 });
    const user = await queryOpsDb('SELECT email FROM ops_users WHERE LOWER(email)=$1 LIMIT 1', [opsEmail]);
    if (!user.rows[0]) return NextResponse.json({ error: 'Select a valid OPS user.' }, { status: 400 });
    const mapping = await queryOpsDb(
      `INSERT INTO ops_3cx_agent_mappings (extension,display_name,ops_email,created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (extension) DO UPDATE SET
         display_name=EXCLUDED.display_name,ops_email=EXCLUDED.ops_email,updated_at=NOW()
       RETURNING *`,
      [extension, displayName || null, user.rows[0].email, auth.session.email]
    );
    const dates = await queryOpsDb('SELECT DISTINCT report_date::text AS report_date FROM ops_call_report_rows WHERE agent_extension=$1', [extension]);
    for (const row of dates.rows) await processCallReportDate(row.report_date);
    await logActivity(auth.session.email, 'map_3cx_agent', `${extension}:${user.rows[0].email}`, request);
    return NextResponse.json({ success: true, mapping: mapping.rows[0], reprocessedDates: dates.rows.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'The mapping could not be saved.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  try {
    await ensureCallReportTables();
    const body = await request.json();
    const extension = String(body.extension || '').replace(/\D/g, '');
    if (!extension) return NextResponse.json({ error: 'Extension is required.' }, { status: 400 });
    const dates = await queryOpsDb('SELECT DISTINCT report_date::text AS report_date FROM ops_call_report_rows WHERE agent_extension=$1', [extension]);
    await queryOpsDb('DELETE FROM ops_3cx_agent_mappings WHERE extension=$1', [extension]);
    for (const row of dates.rows) await processCallReportDate(row.report_date);
    await logActivity(auth.session.email, 'unmap_3cx_agent', extension, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'The mapping could not be removed.' }, { status: 500 });
  }
}
