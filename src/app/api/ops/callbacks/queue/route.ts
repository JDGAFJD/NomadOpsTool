import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCallbackTables } from '@/lib/callbacks';
import { ensureCallVerificationTable } from '@/lib/callVerification';
import { queryOpsDb } from '@/lib/opsDb';

function buildCallbackFilters(searchParams: URLSearchParams, params: any[] = []) {
  const clauses: string[] = [];
  const department = searchParams.get('department');
  const preferredTime = searchParams.get('preferredTime');
  const overdue = searchParams.get('overdue');
  const search = searchParams.get('search')?.trim();
  const verification = searchParams.get('verification');

  if (department && department !== 'all') {
    params.push(department);
    clauses.push(`c.department = $${params.length}`);
  }
  if (preferredTime && preferredTime !== 'all') {
    params.push(preferredTime);
    clauses.push(`c.preferred_time = $${params.length}`);
  }
  if (overdue === 'true') {
    clauses.push('NOW() > c.due_at');
  }
  if (verification && verification !== 'all') {
    if (verification === 'needs_review') {
      clauses.push(`EXISTS (SELECT 1 FROM ops_call_verifications v WHERE v.callback_id=c.id AND v.state IN ('unverified','outcome_mismatch'))`);
    } else if (verification === 'not_tracked') {
      clauses.push(`NOT EXISTS (SELECT 1 FROM ops_call_verifications v WHERE v.callback_id=c.id)`);
    } else {
      params.push(verification);
      clauses.push(`EXISTS (SELECT 1 FROM ops_call_verifications v WHERE v.callback_id=c.id AND v.state=$${params.length})`);
    }
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const index = params.length;
    clauses.push(`(
      LOWER(c.customer_email) LIKE $${index}
      OR LOWER(COALESCE(c.customer_name, '')) LIKE $${index}
      OR LOWER(COALESCE(c.primary_phone, '')) LIKE $${index}
      OR LOWER(COALESCE(c.secondary_phone, '')) LIKE $${index}
      OR LOWER(c.reason) LIKE $${index}
      OR LOWER(c.requested_by) LIKE $${index}
      OR LOWER(COALESCE(c.assigned_to, '')) LIKE $${index}
      OR CAST(c.id AS TEXT) LIKE $${index}
    )`);
  }

  return { clause: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

export async function GET(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureCallbackTables();
    await ensureCallVerificationTable();

    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get('verification') === 'needs_review' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Administrator access is required for Needs Review.' }, { status: 403 });
    }
    const scope = searchParams.get('scope') || 'mine';
    const unassignedFilters = buildCallbackFilters(searchParams);
    const assignedParams = scope === 'all' ? [] : [session.email];
    const assignedScopeClause = scope === 'all' ? '' : `AND c.assigned_to = $1`;
    const assignedFilters = buildCallbackFilters(searchParams, assignedParams);
    const historyFilters = buildCallbackFilters(searchParams);
    const countsFilters = buildCallbackFilters(searchParams);

    const [unassigned, assigned, history, counts, users] = await Promise.all([
    queryOpsDb(`
      SELECT c.*, NOW() > c.due_at AS overdue,
        (SELECT row_to_json(v) FROM ops_call_verifications v WHERE v.callback_id=c.id LIMIT 1) AS verification,
        COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM ops_callback_events e WHERE e.callback_id = c.id), '[]'::json) AS events
      FROM ops_callbacks c
      WHERE c.status = 'unassigned' ${unassignedFilters.clause}
      ORDER BY (NOW() > c.due_at) DESC, c.created_at ASC
      LIMIT 200
    `, unassignedFilters.params),
    queryOpsDb(`
      SELECT c.*, NOW() > c.due_at AS overdue,
        (SELECT row_to_json(v) FROM ops_call_verifications v WHERE v.callback_id=c.id LIMIT 1) AS verification,
        COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM ops_callback_events e WHERE e.callback_id = c.id), '[]'::json) AS events
      FROM ops_callbacks c
      WHERE c.status = 'assigned' ${assignedScopeClause} ${assignedFilters.clause}
      ORDER BY (NOW() > c.due_at) DESC, c.created_at ASC
      LIMIT 200
    `, assignedFilters.params),
    queryOpsDb(`
      SELECT c.*,
        (SELECT row_to_json(v) FROM ops_call_verifications v WHERE v.callback_id=c.id LIMIT 1) AS verification,
        COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM ops_callback_events e WHERE e.callback_id = c.id), '[]'::json) AS events
      FROM ops_callbacks c
      WHERE c.status IN ('completed', 'left_voicemail', 'no_answer', 'closed_by_admin') ${historyFilters.clause}
      ORDER BY c.completed_at DESC NULLS LAST
      LIMIT 200
    `, historyFilters.params),
    queryOpsDb(`
      SELECT
        COUNT(*) FILTER (WHERE c.status = 'unassigned') AS unassigned,
        COUNT(*) FILTER (WHERE c.status = 'assigned') AS assigned,
        COUNT(*) FILTER (WHERE c.status IN ('unassigned','assigned') AND NOW() > c.due_at) AS overdue
      FROM ops_callbacks c
      WHERE 1 = 1 ${countsFilters.clause}
    `, countsFilters.params),
    session.role === 'admin'
      ? queryOpsDb('SELECT id, email, role FROM ops_users ORDER BY email ASC')
      : Promise.resolve({ rows: [] }),
    ]);

    return NextResponse.json({
      success: true,
      agentEmail: session.email,
      viewerRole: session.role,
      users: users.rows,
      unassigned: unassigned.rows,
      assigned: assigned.rows,
      history: history.rows,
      counts: counts.rows[0],
    });
  } catch (error: any) {
    console.error('Callback queue error:', error);
    return NextResponse.json({ error: error.message || 'Callback database is unavailable.' }, { status: 500 });
  }
}
