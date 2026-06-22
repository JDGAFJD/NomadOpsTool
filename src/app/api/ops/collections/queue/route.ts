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
const NON_VERIFIED_STATES = ['pending', 'mapping_required', 'unverified', 'outcome_mismatch'];

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
        WHERE a.case_id=c.id AND v.state IN ('unverified','outcome_mismatch','mapping_required')
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

const SLA_ANCHOR = `COALESCE(
  (SELECT MAX(sla_attempt.created_at) FROM ops_collection_attempts sla_attempt WHERE sla_attempt.case_id=c.id),
  c.created_at
)`;

const SELECT = `SELECT c.*, NOW() >= c.next_attempt_at AS due_now,
  ${SLA_ANCHOR} AS sla_anchor_at,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ${SLA_ANCHOR}))))::bigint AS age_seconds,
  NOW() > ${SLA_ANCHOR} + INTERVAL '48 hours' AS sla_breached,
  COALESCE((SELECT json_agg(i ORDER BY i.failure_date DESC) FROM ops_collection_invoices i WHERE i.case_id=c.id), '[]'::json) AS invoices,
  COALESCE((
    SELECT json_agg(attempt_row ORDER BY attempt_row.created_at DESC)
    FROM (
      SELECT a.*, (
        SELECT row_to_json(verification_row)
        FROM (
          SELECT v.*,COALESCE((
            SELECT json_agg(x ORDER BY x.created_at DESC)
            FROM ops_call_verification_explanations x WHERE x.verification_id=v.id
          ),'[]'::json) AS explanations
          FROM ops_call_verifications v WHERE v.collection_attempt_id=a.id LIMIT 1
        ) verification_row
      ) AS verification
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

function paidInvoiceExists(alias = 'paid_invoice') {
  return `${alias}.case_id=c.id
    AND ${alias}.paid_at IS NOT NULL
    AND ${alias}.amount_due=0
    AND ${alias}.amount_paid>0`;
}

function collectedFilters(request: NextRequest, params: unknown[], session: any, successScope: 'mine'|'all') {
  const clauses: string[] = [`EXISTS (
    SELECT 1 FROM ops_collection_invoices paid_invoice WHERE ${paidInvoiceExists()}
  )`];
  const search = request.nextUrl.searchParams.get('search')?.trim();
  const status = request.nextUrl.searchParams.get('status');
  const owner = request.nextUrl.searchParams.get('owner');
  const attemptValue = request.nextUrl.searchParams.get('attempt');
  const attempt = attemptValue === null ? null : Number(attemptValue);
  const minAmount = Number(request.nextUrl.searchParams.get('minAmount'));
  const maxAmount = Number(request.nextUrl.searchParams.get('maxAmount'));
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  const successVerification = request.nextUrl.searchParams.get('successVerification') || 'all';
  let attemptAgent: string | null = null;
  let attemptAgentParamIndex: number | null = null;
  if (owner && owner !== 'all') attemptAgent = owner;
  else if (successScope === 'mine') attemptAgent = session.email;

  const eligibleAttempt = (attemptAlias: string) => `EXISTS (
    SELECT 1 FROM ops_collection_invoices eligible_invoice
    WHERE ${paidInvoiceExists('eligible_invoice')}
      AND ${attemptAlias}.created_at >= COALESCE(eligible_invoice.failure_date,eligible_invoice.created_at)
      AND ${attemptAlias}.created_at <= eligible_invoice.paid_at
  )`;
  if (successScope === 'mine') {
    params.push(session.email);
    clauses.push(`EXISTS (
      SELECT 1 FROM ops_collection_attempts mine_attempt
      WHERE mine_attempt.case_id=c.id AND LOWER(mine_attempt.agent_email)=LOWER($${params.length})
        AND ${eligibleAttempt('mine_attempt')}
    )`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const p = params.length;
    clauses.push(`(LOWER(COALESCE(c.customer_name,'')) LIKE $${p}
      OR LOWER(COALESCE(c.customer_email,'')) LIKE $${p}
      OR LOWER(COALESCE(c.subscription_id,'')) LIKE $${p}
      OR CAST(c.id AS TEXT) LIKE $${p}
      OR EXISTS (SELECT 1 FROM ops_collection_invoices i WHERE i.case_id=c.id AND LOWER(i.invoice_id) LIKE $${p}))`);
  }
  if (status && status !== 'all') {
    params.push(status);
    clauses.push(`c.status=$${params.length}`);
  }
  if (attemptAgent) {
    params.push(attemptAgent);
    attemptAgentParamIndex = params.length;
    clauses.push(`EXISTS (
      SELECT 1 FROM ops_collection_attempts owner_attempt
      WHERE owner_attempt.case_id=c.id AND LOWER(owner_attempt.agent_email)=LOWER($${attemptAgentParamIndex})
        AND ${eligibleAttempt('owner_attempt')}
    )`);
  }
  if (attempt !== null && Number.isInteger(attempt) && attempt > 0) {
    params.push(attempt);
    clauses.push(`EXISTS (
      SELECT 1 FROM ops_collection_attempts filtered_attempt
      WHERE filtered_attempt.case_id=c.id AND filtered_attempt.attempt_number=$${params.length}
        ${attemptAgentParamIndex ? `AND LOWER(filtered_attempt.agent_email)=LOWER($${attemptAgentParamIndex})` : ''}
        AND ${eligibleAttempt('filtered_attempt')}
    )`);
  }
  if (Number.isFinite(minAmount) && minAmount > 0) {
    params.push(Math.round(minAmount * 100));
    clauses.push(`(SELECT COALESCE(SUM(i.amount_paid),0) FROM ops_collection_invoices i
      WHERE ${paidInvoiceExists('i')}) >= $${params.length}`);
  }
  if (Number.isFinite(maxAmount) && maxAmount > 0) {
    params.push(Math.round(maxAmount * 100));
    clauses.push(`(SELECT COALESCE(SUM(i.amount_paid),0) FROM ops_collection_invoices i
      WHERE ${paidInvoiceExists('i')}) <= $${params.length}`);
  }
  if (from) {
    params.push(from);
    clauses.push(`EXISTS (SELECT 1 FROM ops_collection_invoices i
      WHERE ${paidInvoiceExists('i')} AND i.paid_at >= $${params.length}::date)`);
  }
  if (to) {
    params.push(to);
    clauses.push(`EXISTS (SELECT 1 FROM ops_collection_invoices i
      WHERE ${paidInvoiceExists('i')} AND i.paid_at < $${params.length}::date + INTERVAL '1 day')`);
  }
  if (['verified', 'not_verified', 'needs_explanation'].includes(successVerification)) {
    const stateClause = successVerification === 'verified'
      ? `v.state='verified'`
      : `v.state IN (${NON_VERIFIED_STATES.map(state => `'${state}'`).join(',')})`;
    const explanationClause = successVerification === 'needs_explanation'
      ? `AND NOT EXISTS (SELECT 1 FROM ops_call_verification_explanations x WHERE x.verification_id=v.id)`
      : '';
    clauses.push(`EXISTS (
      SELECT 1 FROM ops_collection_attempts verification_attempt
      JOIN ops_call_verifications v ON v.collection_attempt_id=verification_attempt.id
      WHERE verification_attempt.case_id=c.id
        ${attemptAgentParamIndex ? `AND LOWER(verification_attempt.agent_email)=LOWER($${attemptAgentParamIndex})` : ''}
        AND ${eligibleAttempt('verification_attempt')}
        AND ${stateClause} ${explanationClause}
    )`);
  }
  return { where: clauses.join(' AND '), attemptAgent };
}

async function collectedQueue(request: NextRequest, session: any, pageCandidate: number, sort: 'oldest'|'newest') {
  const requestedScope = request.nextUrl.searchParams.get('successScope') === 'all' ? 'all' : 'mine';
  const successScope: 'mine'|'all' = requestedScope === 'all' && session.role === 'admin' ? 'all' : 'mine';
  const params: unknown[] = [];
  const { where, attemptAgent } = collectedFilters(request, params, session, successScope);
  const total = await queryOpsDb(
    `SELECT COUNT(*)::int AS total FROM ops_collection_cases c WHERE ${where}`,
    params
  );
  const totalRecords = Number(total.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const page = Math.min(pageCandidate, totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const recordsParams = [...params, session.email, attemptAgent, PAGE_SIZE, offset];
  const viewerEmailParam = params.length + 1;
  const attemptAgentParam = params.length + 2;
  const limitParam = params.length + 3;
  const offsetParam = params.length + 4;
  const records = await queryOpsDb(
    `WITH paid_invoices AS (
       SELECT i.*,COALESCE(i.failure_date,i.created_at) AS failure_at
       FROM ops_collection_invoices i
       WHERE i.paid_at IS NOT NULL AND i.amount_due=0 AND i.amount_paid>0
     ),
     participants AS (
       SELECT DISTINCT p.id AS invoice_row_id,p.case_id,p.amount_paid,p.currency_code,p.paid_at,a.agent_email
       FROM paid_invoices p
       JOIN ops_collection_attempts a ON a.case_id=p.case_id
        AND a.created_at>=p.failure_at AND a.created_at<=p.paid_at
     ),
     participant_counts AS (
       SELECT invoice_row_id,COUNT(*)::numeric AS agent_count FROM participants GROUP BY invoice_row_id
     ),
     credits AS (
       SELECT p.*,(p.amount_paid::numeric/pc.agent_count) AS credited_amount
       FROM participants p JOIN participant_counts pc ON pc.invoice_row_id=p.invoice_row_id
     )
     SELECT c.*,false AS due_now,0::bigint AS age_seconds,false AS sla_breached,NULL::timestamptz AS sla_anchor_at,
       (SELECT COALESCE(SUM(p.amount_paid),0)::bigint FROM paid_invoices p WHERE p.case_id=c.id) AS total_collected_amount,
       (SELECT COALESCE(ROUND(SUM(cr.credited_amount)),0)::bigint FROM credits cr
         WHERE cr.case_id=c.id AND LOWER(cr.agent_email)=LOWER($${viewerEmailParam})) AS viewer_credit_amount,
       (SELECT MAX(p.paid_at) FROM paid_invoices p WHERE p.case_id=c.id) AS latest_paid_at,
       COALESCE((SELECT json_agg(p ORDER BY p.paid_at DESC) FROM paid_invoices p WHERE p.case_id=c.id),'[]'::json) AS invoices,
       COALESCE((
         SELECT json_agg(agent_credit ORDER BY agent_credit.credited_amount DESC)
         FROM (
           SELECT cr.agent_email,ROUND(SUM(cr.credited_amount))::bigint AS credited_amount,
             COUNT(DISTINCT cr.invoice_row_id)::int AS paid_invoices
           FROM credits cr WHERE cr.case_id=c.id GROUP BY cr.agent_email
         ) agent_credit
       ),'[]'::json) AS agent_credits,
       COALESCE((
         SELECT json_agg(attempt_row ORDER BY attempt_row.created_at DESC)
         FROM (
           SELECT a.*,(
             SELECT row_to_json(verification_row)
             FROM (
               SELECT v.*,COALESCE((
                 SELECT json_agg(x ORDER BY x.created_at DESC)
                 FROM ops_call_verification_explanations x WHERE x.verification_id=v.id
               ),'[]'::json) AS explanations
               FROM ops_call_verifications v WHERE v.collection_attempt_id=a.id LIMIT 1
             ) verification_row
           ) AS verification
           FROM ops_collection_attempts a
           WHERE a.case_id=c.id
             AND ($${attemptAgentParam}::text IS NULL OR LOWER(a.agent_email)=LOWER($${attemptAgentParam}))
             AND EXISTS (
               SELECT 1 FROM paid_invoices p WHERE p.case_id=c.id
                AND a.created_at>=p.failure_at AND a.created_at<=p.paid_at
             )
         ) attempt_row
       ),'[]'::json) AS attempts,
       NULL::json AS verification,
       COALESCE((SELECT json_agg(e ORDER BY e.created_at DESC) FROM ops_collection_events e WHERE e.case_id=c.id),'[]'::json) AS events
     FROM ops_collection_cases c
     WHERE ${where}
     ORDER BY latest_paid_at ${sort === 'newest' ? 'DESC' : 'ASC'},c.id ${sort === 'newest' ? 'DESC' : 'ASC'}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    recordsParams
  );
  return {
    rows: records.rows,
    pagination: { page, pageSize: PAGE_SIZE, totalRecords, totalPages },
    successScope,
  };
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
    if (view === 'collected') {
      const collected = await collectedQueue(request, session, pageCandidate, sort);
      const [counts, owners, users] = await Promise.all([
        queryOpsDb(`SELECT
          COUNT(*) FILTER(WHERE status='unassigned') unassigned,
          COUNT(*) FILTER(WHERE assigned_to=$1 AND status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused')) mine,
          COUNT(*) FILTER(WHERE assigned_to=$1 AND status IN ('assigned','follow_up_pending','awaiting_payment_confirmation') AND next_attempt_at<=NOW()) due,
          COUNT(*) FILTER(WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused')) active,
          (SELECT COUNT(DISTINCT i.case_id) FROM ops_collection_invoices i
            JOIN ops_collection_attempts a ON a.case_id=i.case_id
              AND a.created_at>=COALESCE(i.failure_date,i.created_at) AND a.created_at<=i.paid_at
            WHERE i.paid_at IS NOT NULL AND i.amount_due=0 AND i.amount_paid>0 AND LOWER(a.agent_email)=LOWER($1)) collected,
          (SELECT COUNT(DISTINCT i.case_id) FROM ops_collection_invoices i
            WHERE i.paid_at IS NOT NULL AND i.amount_due=0 AND i.amount_paid>0) collected_all
          FROM ops_collection_cases`, [session.email]),
        queryOpsDb(`SELECT DISTINCT agent_email AS assigned_to FROM ops_collection_attempts ORDER BY agent_email`),
        session.role === 'admin'
          ? queryOpsDb('SELECT id,email,role FROM ops_users ORDER BY email ASC')
          : Promise.resolve({ rows: [] }),
      ]);
      const freeScout = new FreeScoutService();
      const decoratedRecords = collected.rows.map(row => ({
        ...row,
        chargebeeUrl: chargebeeProfileUrl(row.subscription_id, row.customer_id),
        freeScoutUrl: freeScout.conversationUrl(row.latest_freescout_conversation_id),
        attempts: (row.attempts || []).map((attempt: any) => ({
          ...attempt,
          freeScoutUrl: freeScout.conversationUrl(attempt.freescout_conversation_id),
        })),
      }));
      return NextResponse.json({
        success: true,
        agentEmail: session.email,
        viewerRole: session.role,
        users: users.rows,
        callVerificationEnabled,
        records: decoratedRecords,
        pagination: collected.pagination,
        sort,
        successScope: collected.successScope,
        counts: counts.rows[0],
        owners: owners.rows.map(row => row.assigned_to),
      });
    }
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
        (SELECT COUNT(DISTINCT i.case_id) FROM ops_collection_invoices i
          JOIN ops_collection_attempts a ON a.case_id=i.case_id
            AND a.created_at>=COALESCE(i.failure_date,i.created_at) AND a.created_at<=i.paid_at
          WHERE i.paid_at IS NOT NULL AND i.amount_due=0 AND i.amount_paid>0 AND LOWER(a.agent_email)=LOWER($1)) collected,
        (SELECT COUNT(DISTINCT i.case_id) FROM ops_collection_invoices i
          WHERE i.paid_at IS NOT NULL AND i.amount_due=0 AND i.amount_paid>0) collected_all
        FROM ops_collection_cases`, [session.email]),
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
       ORDER BY (NOW() > ${SLA_ANCHOR} + INTERVAL '48 hours') DESC,
         ${SLA_ANCHOR} ${sort === 'newest' ? 'DESC' : 'ASC'},
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
