import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['pending', 'approved', 'rejected', 'all']);
const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureCollectionsTables();
    const status = STATUSES.has(request.nextUrl.searchParams.get('status') || '')
      ? request.nextUrl.searchParams.get('status') || 'all'
      : 'all';
    const search = request.nextUrl.searchParams.get('search')?.trim();
    const agent = request.nextUrl.searchParams.get('agent')?.trim();
    const from = request.nextUrl.searchParams.get('from')?.trim();
    const to = request.nextUrl.searchParams.get('to')?.trim();
    const requestedPage = Number(request.nextUrl.searchParams.get('page'));
    const pageCandidate = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (status !== 'all') {
      params.push(status);
      clauses.push(`m.status=$${params.length}`);
    }
    if (agent && agent !== 'all') {
      params.push(agent);
      clauses.push(`LOWER(m.submitting_agent_email)=LOWER($${params.length})`);
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      const p = params.length;
      clauses.push(`(
        LOWER(COALESCE(c.customer_name,'')) LIKE $${p}
        OR LOWER(COALESCE(c.customer_email,'')) LIKE $${p}
        OR LOWER(COALESCE(c.subscription_id,'')) LIKE $${p}
        OR LOWER(COALESCE(m.submitting_agent_email,'')) LIKE $${p}
        OR LOWER(COALESCE(m.called_phone,'')) LIKE $${p}
        OR CAST(m.case_id AS TEXT) LIKE $${p}
        OR CAST(m.id AS TEXT) LIKE $${p}
      )`);
    }
    if (from) {
      params.push(from);
      clauses.push(`m.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      clauses.push(`m.created_at < $${params.length}::date + INTERVAL '1 day'`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [total, counts, agents] = await Promise.all([
      queryOpsDb(
        `SELECT COUNT(*)::int AS total
         FROM ops_collection_missed_attempt_requests m
         JOIN ops_collection_cases c ON c.id=m.case_id
         ${where}`,
        params
      ),
      queryOpsDb(`SELECT
        COUNT(*) FILTER(WHERE status='pending')::int AS pending,
        COUNT(*) FILTER(WHERE status='approved')::int AS approved,
        COUNT(*) FILTER(WHERE status='rejected')::int AS rejected,
        COUNT(*)::int AS total
        FROM ops_collection_missed_attempt_requests`),
      queryOpsDb(`SELECT DISTINCT submitting_agent_email AS agent
        FROM ops_collection_missed_attempt_requests
        WHERE submitting_agent_email IS NOT NULL
        ORDER BY submitting_agent_email`),
    ]);
    const totalRecords = Number(total.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    const page = Math.min(pageCandidate, totalPages);
    const offset = (page - 1) * PAGE_SIZE;
    const recordParams = [...params, PAGE_SIZE, offset];
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
       LIMIT $${recordParams.length - 1} OFFSET $${recordParams.length}`,
      recordParams
    );
    return NextResponse.json({
      success: true,
      viewerRole: session.role,
      agentEmail: session.email,
      requests: result.rows,
      counts: counts.rows[0] || {},
      agents: agents.rows.map(row => row.agent),
      pagination: { page, pageSize: PAGE_SIZE, totalRecords, totalPages },
    });
  } catch (error: any) {
    console.error('Missed attempt list failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not load missed attempt requests.' }, { status: 500 });
  }
}
