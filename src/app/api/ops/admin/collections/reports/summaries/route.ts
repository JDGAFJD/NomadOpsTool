import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionReportTables } from '@/lib/collectionsReporting';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    await ensureCollectionReportTables();
    const summaries = await queryOpsDb(
      `SELECT id,generated_by,filters,summary,model,created_at
       FROM ops_collection_report_summaries
       ORDER BY created_at DESC LIMIT 30`
    );
    return NextResponse.json({ success: true, summaries: summaries.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Summary history is unavailable.' }, { status: 500 });
  }
}
