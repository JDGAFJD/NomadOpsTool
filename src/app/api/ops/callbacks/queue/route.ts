import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCallbackTables } from '@/lib/callbacks';
import { queryOpsDb } from '@/lib/opsDb';

export async function GET(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureCallbackTables();

    const scope = new URL(request.url).searchParams.get('scope') || 'mine';
    const assignedClause = scope === 'all' ? '' : 'AND assigned_to = $1';
    const params = scope === 'all' ? [] : [session.email];

    const [unassigned, assigned, history, counts] = await Promise.all([
    queryOpsDb(`
      SELECT c.*, NOW() > c.due_at AS overdue,
        COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM ops_callback_events e WHERE e.callback_id = c.id), '[]'::json) AS events
      FROM ops_callbacks c
      WHERE status = 'unassigned'
      ORDER BY (NOW() > c.due_at) DESC, c.created_at ASC
      LIMIT 200
    `),
    queryOpsDb(`
      SELECT c.*, NOW() > c.due_at AS overdue,
        COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM ops_callback_events e WHERE e.callback_id = c.id), '[]'::json) AS events
      FROM ops_callbacks c
      WHERE status = 'assigned' ${assignedClause}
      ORDER BY (NOW() > c.due_at) DESC, c.created_at ASC
      LIMIT 200
    `, params),
    queryOpsDb(`
      SELECT c.*,
        COALESCE((SELECT json_agg(e ORDER BY e.created_at) FROM ops_callback_events e WHERE e.callback_id = c.id), '[]'::json) AS events
      FROM ops_callbacks c
      WHERE status IN ('completed', 'left_voicemail', 'no_answer')
      ORDER BY c.completed_at DESC NULLS LAST
      LIMIT 200
    `),
    queryOpsDb(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'unassigned') AS unassigned,
        COUNT(*) FILTER (WHERE status = 'assigned') AS assigned,
        COUNT(*) FILTER (WHERE status IN ('unassigned','assigned') AND NOW() > due_at) AS overdue
      FROM ops_callbacks
    `),
    ]);

    return NextResponse.json({
      success: true,
      agentEmail: session.email,
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
