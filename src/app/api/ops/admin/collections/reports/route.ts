import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getCollectionReport, parseCollectionReportFilters } from '@/lib/collectionsReporting';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    const filters = parseCollectionReportFilters(new URL(request.url).searchParams);
    const report = await getCollectionReport(filters);
    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    console.error('Collections report error:', error);
    return NextResponse.json({ error: error.message || 'Collections reporting is unavailable.' }, { status: 500 });
  }
}
