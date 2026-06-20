import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { chargebeeProfileUrl, ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';
import { FreeScoutService } from '@/lib/services/FreeScoutService';
import { ensureCallVerificationTable } from '@/lib/callVerification';
import { isCallVerificationEnabled } from '@/lib/features';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const VIEWS = ['unassigned', 'mine', 'all', 'due', 'closed', 'collected'] as const;
type CollectionView = typeof VIEWS[number];

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
  const verification = request.nextUrl.searchParams.get('verification');
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
  if (verification && verification !== 'all') {
    if (verification === 'needs_review') {
      clauses.push(`EXISTS (
        SELECT 1 FROM ops_collection_attempts a
        JOIN ops_call_verifications v ON v.collection_attempt_id=a.id
        WHERE a.case_id=c.id AND v.state IN ('unverified','outcome_mismatch')
      )`);
    } else if (verification === 'not_tracked') {
      clauses.push(`NOT EXISTS (
        SELECT 1 FROM ops_collection_attempts a
        JOIN ops_call_verifications v ON v.collection_attempt_id=a.id
        WHERE a.case_id=c.id
      )`);
    } else {
      params.push(verification);
      clauses.push(`EXISTS (
        SELECT 1 FROM ops_collection_attempts a
        JOIN ops_call_verifications v ON v.collection_attempt_id=a.id
        WHERE a.case_id=c.id AND v.state=$${params.length}
      )`);
    }
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

const SELECT = `SELECT c.*, NOW() >= c.next_attempt_at AS due_now,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - c.created_at))))::bigint AS age_seconds,
  NOW() > c.created_at + INTERVAL '48 hours' AS sla_breached,
  COALESCE((SELECT json_agg(i ORDER BY i.failure_date DESC) FROM ops_collection_invoices i WHERE i.case_id=c.id), '[]'::json) AS invoices,
  COALESCE((
    SELECT json_agg(attempt_row ORDER BY attempt_row.created_at DESC)
    FROM (
      SELECT a.*, (SELECT row_to_json(v) FROM ops_call_verifications v WHERE v.collection_attempt_id=a.id LIMIT 1) AS verification
      FROM ops_collection_attempts a WHERE a.case_id=c.id
    ) attempt_row
  ), '[]'::json) AS attempts,
  (
    SELECT row_to_json(v) FROM ops_collection_attempts a
    JOIN ops_call_verifications v ON v.collection_attempt_id=a.id
    WHERE a.case_id=c.id ORDER BY a.created_at DESC LIMIT 1
  ) AS verification,
  COALESCE((SELECT json_agg(e ORDER BY e.created_at DESC) FROM ops_collection_events e WHERE e.case_id=c.id), '[]'::json) AS events`;

function viewQuery(view: CollectionView, session: any, params: unknown[]) {
  if (view === 'unassigned') {
    return `c.status='unassigned'`;
  }
  if (view === 'mine') {
    params.push(session.email);
    return `c.assigned_to=$${params.length} AND c.status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused')`;
  }
  if (view === 'all') {
    return `c.status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused')`;
  }
  if (view === 'due') {
    params.push(session.email);
    return `c.assigned_to=$${params.length} AND c.status IN ('assigned','follow_up_pending','awaiting_payment_confirmation') AND c.next_attempt_at<=NOW()`;
  }
  if (view === 'closed') {
    return `c.status IN ('exhausted','canceled','completed_by_admin','closed_by_admin')`;
  }
  return `c.status='collected'`;
}

export async function GET(request: NextRequest) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureCollectionsTables();
    await ensureCallVerificationTable();
    const callVerificationEnabled = isCallVerificationEnabled();
    if (!callVerificationEnabled) request.nextUrl.searchParams.delete('verification');
    if (request.nextUrl.searchParams.get('verification') === 'needs_review' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Administrator access is required for Needs Review.' }, { status: 403 });
    }
    const requestedView = request.nextUrl.searchParams.get('view');
    const view: CollectionView = VIEWS.includes(requestedView as CollectionView)
      ? requestedView as CollectionView
      : 'unassigned';
    if (view === 'all' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Administrator access is required for All Active cases.' }, { status: 403 });
    }
    const requestedPage = Number(request.nextUrl.searchParams.get('page'));
    const pageCandidate = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const sort = request.nextUrl.searchParams.get('sort') === 'newest' ? 'newest' : 'oldest';
    const baseParams: unknown[] = [];
    const clause = filters(request, baseParams);
    const viewParams = [...baseParams];
    const viewWhere = viewQuery(view, session, viewParams);
    const [total, counts, owners, users] = await Promise.all([
      queryOpsDb(`SELECT COUNT(*)::int AS total FROM ops_collection_cases c WHERE ${viewWhere} ${clause}`, viewParams),
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
    const totalRecords = Number(total.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    const page = Math.min(pageCandidate, totalPages);
    const offset = (page - 1) * PAGE_SIZE;
    const recordParams = [...viewParams, PAGE_SIZE, offset];
    const records = await queryOpsDb(
      `${SELECT}
       FROM ops_collection_cases c
       WHERE ${viewWhere} ${clause}
       ORDER BY (NOW() > c.created_at + INTERVAL '48 hours') DESC,
         c.created_at ${sort === 'newest' ? 'DESC' : 'ASC'},
         c.id ${sort === 'newest' ? 'DESC' : 'ASC'}
       LIMIT $${recordParams.length - 1} OFFSET $${recordParams.length}`,
      recordParams
    );
    const freeScout = new FreeScoutService();
    const decoratedRecords = records.rows.map(row => ({
      ...row,
      chargebeeUrl: chargebeeProfileUrl(row.subscription_id, row.customer_id),
      freeScoutUrl: freeScout.conversationUrl(row.latest_freescout_conversation_id),
      attempts: (row.attempts || []).map((attempt: any) => ({
        ...attempt,
        freeScoutUrl: freeScout.conversationUrl(attempt.freescout_conversation_id),
      })),
    }));
    return NextResponse.json({
      success: true, agentEmail: session.email, viewerRole: session.role, users: users.rows,
      callVerificationEnabled,
      records: decoratedRecords,
      pagination: { page, pageSize: PAGE_SIZE, totalRecords, totalPages },
      sort,
      counts: counts.rows[0], owners: owners.rows.map(row => row.assigned_to),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Collections queue unavailable.' }, { status: 500 });
  }
}
