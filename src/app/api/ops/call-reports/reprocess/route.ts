import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { processCallReportDate, reprocessVerification } from '@/lib/callReports';

export async function POST(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  try {
    const body = await request.json();
    if (body.verificationId) {
      const result = await reprocessVerification(Number(body.verificationId));
      return NextResponse.json({ success: true, result });
    }
    const reportDate = String(body.reportDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return NextResponse.json({ error: 'A valid report date is required.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, result: await processCallReportDate(reportDate) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Reprocessing failed.' }, { status: 500 });
  }
}
