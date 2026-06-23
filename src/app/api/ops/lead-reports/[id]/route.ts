import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getLeadReportDetail } from '@/lib/leadReports';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const reportId = Number(id);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return NextResponse.json({ error: 'Invalid report id.' }, { status: 400 });
  }
  try {
    const url = new URL(request.url);
    const detail = await getLeadReportDetail(reportId, url.searchParams);
    if (!detail) return NextResponse.json({ error: 'Lead report not found.' }, { status: 404 });
    return NextResponse.json({ success: true, ...detail });
  } catch (error: any) {
    console.error('Lead report detail error:', error);
    return NextResponse.json({ error: error.message || 'Lead report detail is unavailable.' }, { status: 500 });
  }
}
