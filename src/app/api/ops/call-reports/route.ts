import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCallReportTables, importCallReportCsv } from '@/lib/callReports';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureCallReportTables();
    const [batches, stats, mappings, verifications, users] = await Promise.all([
      queryOpsDb(`
        SELECT * FROM ops_call_report_batches
        ORDER BY created_at DESC LIMIT 30
      `),
      queryOpsDb(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE state='pending')::int AS pending,
          COUNT(*) FILTER (WHERE state='verified')::int AS verified,
          COUNT(*) FILTER (WHERE state='outcome_mismatch')::int AS outcome_mismatch,
          COUNT(*) FILTER (WHERE state='unverified')::int AS unverified,
          COUNT(*) FILTER (WHERE state='mapping_required')::int AS mapping_required
        FROM ops_call_verifications
        WHERE evidence_source='csv'
      `),
      queryOpsDb(`
        SELECT m.*,u.role
        FROM ops_3cx_agent_mappings m
        LEFT JOIN ops_users u ON LOWER(u.email)=LOWER(m.ops_email)
        ORDER BY m.extension
      `),
      queryOpsDb(`
        SELECT v.*
        FROM ops_call_verifications v
        WHERE v.evidence_source='csv'
        ORDER BY v.submitted_at DESC LIMIT 200
      `),
      session.role === 'admin'
        ? queryOpsDb('SELECT id,email,role FROM ops_users ORDER BY email')
        : Promise.resolve({ rows: [] }),
    ]);
    const unmapped = await queryOpsDb(`
      SELECT r.agent_extension,MAX(r.agent_display_name) AS agent_display_name,
        COUNT(*)::int AS call_count,MAX(r.report_date) AS latest_report_date
      FROM ops_call_report_rows r
      LEFT JOIN ops_3cx_agent_mappings m ON m.extension=r.agent_extension
      WHERE m.id IS NULL
      GROUP BY r.agent_extension
      ORDER BY latest_report_date DESC,r.agent_extension
    `);
    return NextResponse.json({
      success: true,
      viewerRole: session.role,
      agentEmail: session.email,
      batches: batches.rows,
      stats: stats.rows[0],
      mappings: mappings.rows,
      unmapped: unmapped.rows,
      verifications: verifications.rows,
      users: users.rows,
    });
  } catch (error: any) {
    console.error('Call report history error:', error);
    return NextResponse.json({ error: error.message || 'Call verification history is unavailable.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'CSV file is required.' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'CSV files must be 10 MB or smaller.' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ error: 'Upload a .csv call report.' }, { status: 400 });
    const result = await importCallReportCsv({
      csv: await file.text(),
      fileName: file.name || 'call-report.csv',
      uploadedBy: session.email,
    });
    await logActivity(
      session.email,
      'upload_call_report',
      `${result.batch.report_start_date}:${result.batch.report_end_date}:${result.batch.id}`,
      request
    );
    return NextResponse.json({
      success: true,
      duplicate: result.duplicate,
      batch: result.batch,
      processing: result.processing,
      processingByDate: 'processingByDate' in result ? result.processingByDate : null,
      rejected: result.parsed.rejected,
    });
  } catch (error: any) {
    console.error('Call report upload error:', error);
    return NextResponse.json({ error: error.message || 'The call report could not be processed.' }, { status: 400 });
  }
}
