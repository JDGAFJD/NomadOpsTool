import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['pending', 'approved', 'rejected', 'all']);

export async function GET(request: NextRequest) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    await ensureCollectionsTables();
    const status = STATUSES.has(request.nextUrl.searchParams.get('status') || '')
      ? request.nextUrl.searchParams.get('status') || 'pending'
      : 'pending';
    const params: unknown[] = [];
    const where = status === 'all' ? '' : (params.push(status), `WHERE m.status=$${params.length}`);
    const result = await queryOpsDb(
      `SELECT m.*,c.customer_name,c.customer_email,c.subscription_id,c.currency_code,
        COALESCE((
          SELECT json_agg(i ORDER BY i.paid_at DESC NULLS LAST)
          FROM ops_collection_invoices i
          WHERE i.case_id=c.id AND i.paid_at IS NOT NULL AND i.amount_due=0 AND i.amount_paid>0
        ), '[]'::json) AS paid_invoices
       FROM ops_collection_missed_attempt_requests m
       JOIN ops_collection_cases c ON c.id=m.case_id
       ${where}
       ORDER BY CASE WHEN m.status='pending' THEN 0 ELSE 1 END,m.created_at DESC
       LIMIT 200`,
      params
    );
    return NextResponse.json({ success: true, requests: result.rows });
  } catch (error: any) {
    console.error('Missed attempt list failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not load missed attempt requests.' }, { status: 500 });
  }
}
