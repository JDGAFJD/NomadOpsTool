import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { importLeadReportCsv, listLeadReports } from '@/lib/leadReports';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await listLeadReports();
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error('Lead report list error:', error);
    return NextResponse.json({ error: error.message || 'Lead reports are unavailable.' }, { status: 500 });
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
    if (!file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ error: 'Upload a .csv 3CX report.' }, { status: 400 });

    const result = await importLeadReportCsv({
      csv: await file.text(),
      fileName: file.name || 'lead-call-report.csv',
      uploadedBy: session.email,
      request,
    });

    return NextResponse.json({
      success: true,
      duplicate: result.duplicate,
      batch: result.batch,
      rejected: result.parsed.rejected,
      reportDates: result.parsed.reportDates,
    });
  } catch (error: any) {
    console.error('Lead report upload error:', error);
    return NextResponse.json({ error: error.message || 'The lead report could not be processed.' }, { status: 400 });
  }
}
