import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import {
  COLLECTION_REPORT_MODEL,
  collectionReportAiSnapshot,
  generateCollectionReportSummary,
  getCollectionReport,
  parseCollectionReportFilters,
} from '@/lib/collectionsReporting';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    const body = await request.json();
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'agent', 'attempt', 'outcome', 'status', 'reason']) {
      if (typeof body[key] === 'string') params.set(key, body[key]);
    }
    const filters = parseCollectionReportFilters(params);
    const report = await getCollectionReport(filters);
    const snapshot = collectionReportAiSnapshot(report);
    const summary = await generateCollectionReportSummary(snapshot);
    const inserted = await queryOpsDb(
      `INSERT INTO ops_collection_report_summaries
       (generated_by,filters,metric_snapshot,summary,model)
       VALUES ($1,$2::jsonb,$3::jsonb,$4,$5)
       RETURNING id,generated_by,filters,summary,model,created_at`,
      [session.email, JSON.stringify(filters), JSON.stringify(snapshot), summary, COLLECTION_REPORT_MODEL]
    );
    await logActivity(session.email, 'generate_collection_report_summary', String(inserted.rows[0].id), request);
    return NextResponse.json({ success: true, summary: inserted.rows[0] });
  } catch (error: any) {
    console.error('Collections report summary error:', error);
    return NextResponse.json({ error: error.message || 'The AI summary could not be generated.' }, { status: 502 });
  }
}
