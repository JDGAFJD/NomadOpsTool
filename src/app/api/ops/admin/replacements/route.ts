import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb } from '@/lib/opsDb';

async function ensureReplacementTable() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_replacement_requests (
      id SERIAL PRIMARY KEY,
      agent_email TEXT NOT NULL,
      customer_email TEXT,
      customer_id TEXT,
      customer_name TEXT,
      subscription_id TEXT,
      subscription_status TEXT,
      plan_id TEXT,
      iccid TEXT,
      imei TEXT,
      issue_branch TEXT NOT NULL,
      branch_decision TEXT NOT NULL,
      troubleshooting_steps TEXT,
      checklist JSONB,
      replacement_type TEXT NOT NULL,
      custom_replacement_item TEXT,
      replacement_reason TEXT NOT NULL,
      interaction_id TEXT,
      slack_ts TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET() {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await ensureReplacementTable();

    const replacements = await queryOpsDb(`
      SELECT *
      FROM ops_replacement_requests
      ORDER BY created_at DESC
      LIMIT 200
    `);
    const byAgent = await queryOpsDb(`
      SELECT agent_email, COUNT(*) AS count
      FROM ops_replacement_requests
      GROUP BY agent_email
      ORDER BY count DESC
      LIMIT 20
    `);
    const byType = await queryOpsDb(`
      SELECT COALESCE(custom_replacement_item, replacement_type) AS replacement_type, COUNT(*) AS count
      FROM ops_replacement_requests
      GROUP BY COALESCE(custom_replacement_item, replacement_type)
      ORDER BY count DESC
      LIMIT 20
    `);
    const byIssue = await queryOpsDb(`
      SELECT issue_branch, COUNT(*) AS count
      FROM ops_replacement_requests
      GROUP BY issue_branch
      ORDER BY count DESC
    `);
    const total = await queryOpsDb('SELECT COUNT(*) AS count FROM ops_replacement_requests');

    return NextResponse.json({
      success: true,
      replacements: replacements.rows,
      stats: {
        total: total.rows[0]?.count || '0',
        byAgent: byAgent.rows,
        byType: byType.rows,
        byIssue: byIssue.rows,
      },
    });
  } catch (err: any) {
    console.error('Replacement admin fetch error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch replacements' }, { status: 500 });
  }
}
