import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { chargebeeProfileUrl, ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

function filters(request: NextRequest, params: unknown[]) {
  const clauses: string[] = [];
  const search = request.nextUrl.searchParams.get('search')?.trim();
  const status = request.nextUrl.searchParams.get('status');
  const owner = request.nextUrl.searchParams.get('owner');
  const attemptValue = request.nextUrl.searchParams.get('attempt');
  const attempt = attemptValue === null ? null : Number(attemptValue);
  const minAmount = Number(request.nextUrl.searchParams.get('minAmount'));
  const maxAmount = Number(request.nextUrl.searchParams.get('maxAmount'));
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const p = params.length;
    clauses.push(`(LOWER(COALESCE(c.customer_name,'')) LIKE $${p} OR LOWER(COALESCE(c.customer_email,'')) LIKE $${p}
      OR LOWER(COALESCE(c.subscription_id,'')) LIKE $${p} OR CAST(c.id AS TEXT) LIKE $${p}
      OR EXISTS (SELECT 1 FROM ops_collection_invoices i WHERE i.case_id=c.id AND LOWER(i.invoice_id) LIKE $${p}))`);
  }
  if (status && status !== 'all') { params.push(status); clauses.push(`c.status = $${params.length}`); }
  if (owner && owner !== 'all') { params.push(owner); clauses.push(`c.assigned_to = $${params.length}`); }
  if (attempt !== null && Number.isInteger(attempt) && attempt >= 0) { params.push(attempt); clauses.push(`c.current_attempt = $${params.length}`); }
  if (Number.isFinite(minAmount) && minAmount > 0) { params.push(Math.round(minAmount * 100)); clauses.push(`c.total_amount_due >= $${params.length}`); }
  if (Number.isFinite(maxAmount) && maxAmount > 0) { params.push(Math.round(maxAmount * 100)); clauses.push(`c.total_amount_due <= $${params.length}`); }
  if (from) { params.push(from); clauses.push(`c.created_at >= $${params.length}::date`); }
  if (to) { params.push(to); clauses.push(`c.created_at < $${params.length}::date + INTERVAL '1 day'`); }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

const SELECT = `SELECT c.*, NOW() >= c.next_attempt_at AS due_now,
  COALESCE((SELECT json_agg(i ORDER BY i.failure_date DESC) FROM ops_collection_invoices i WHERE i.case_id=c.id), '[]'::json) AS invoices,
  COALESCE((SELECT json_agg(a ORDER BY a.created_at DESC) FROM ops_collection_attempts a WHERE a.case_id=c.id), '[]'::json) AS attempts,
  COALESCE((SELECT json_agg(e ORDER BY e.created_at DESC) FROM ops_collection_events e WHERE e.case_id=c.id), '[]'::json) AS events`;

export async function GET(request: NextRequest) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureCollectionsTables();
    const baseParams: unknown[] = [];
    const clause = filters(request, baseParams);
    const clone = () => [...baseParams];
    const [unassigned, mine, allActive, due, closed, collected, counts, owners, users] = await Promise.all([
      queryOpsDb(`${SELECT} FROM ops_collection_cases c WHERE c.status='unassigned' ${clause} ORDER BY c.created_at ASC LIMIT 200`, clone()),
      queryOpsDb(`${SELECT} FROM ops_collection_cases c WHERE c.assigned_to=$${baseParams.length + 1} AND c.status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused') ${clause} ORDER BY c.next_attempt_at ASC NULLS LAST`, [...clone(), session.email]),
      session.role === 'admin'
        ? queryOpsDb(`${SELECT} FROM ops_collection_cases c WHERE c.status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused') ${clause} ORDER BY c.next_attempt_at ASC NULLS LAST, c.created_at ASC LIMIT 200`, clone())
        : Promise.resolve({ rows: [] }),
      queryOpsDb(`${SELECT} FROM ops_collection_cases c WHERE c.assigned_to=$${baseParams.length + 1} AND c.status IN ('assigned','follow_up_pending','awaiting_payment_confirmation') AND c.next_attempt_at<=NOW() ${clause} ORDER BY c.next_attempt_at ASC`, [...clone(), session.email]),
      queryOpsDb(`${SELECT} FROM ops_collection_cases c WHERE c.status IN ('exhausted','canceled','completed_by_admin','closed_by_admin') ${clause} ORDER BY c.updated_at DESC LIMIT 200`, clone()),
      queryOpsDb(`${SELECT} FROM ops_collection_cases c WHERE c.status='collected' ${clause} ORDER BY c.collected_at DESC LIMIT 200`, clone()),
      queryOpsDb(`SELECT COUNT(*) FILTER(WHERE status='unassigned') unassigned,
        COUNT(*) FILTER(WHERE assigned_to=$1 AND status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused')) mine,
        COUNT(*) FILTER(WHERE assigned_to=$1 AND status IN ('assigned','follow_up_pending','awaiting_payment_confirmation') AND next_attempt_at<=NOW()) due,
        COUNT(*) FILTER(WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused')) active,
        COUNT(*) FILTER(WHERE status='collected') collected FROM ops_collection_cases`, [session.email]),
      queryOpsDb(`SELECT DISTINCT assigned_to FROM ops_collection_cases WHERE assigned_to IS NOT NULL ORDER BY assigned_to`),
      session.role === 'admin'
        ? queryOpsDb('SELECT id, email, role FROM ops_users ORDER BY email ASC')
        : Promise.resolve({ rows: [] }),
    ]);
    const decorate = (rows: any[]) => rows.map(row => ({ ...row, chargebeeUrl: chargebeeProfileUrl(row.subscription_id, row.customer_id) }));
    return NextResponse.json({
      success: true, agentEmail: session.email, viewerRole: session.role, users: users.rows,
      unassigned: decorate(unassigned.rows), mine: decorate(mine.rows), allActive: decorate(allActive.rows), due: decorate(due.rows),
      closed: decorate(closed.rows), collected: decorate(collected.rows),
      counts: counts.rows[0], owners: owners.rows.map(row => row.assigned_to),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Collections queue unavailable.' }, { status: 500 });
  }
}
