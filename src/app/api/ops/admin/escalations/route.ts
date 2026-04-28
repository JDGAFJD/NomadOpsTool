import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb } from '@/lib/opsDb';

export async function GET() {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Ensure table exists
    await queryOpsDb(`
      CREATE TABLE IF NOT EXISTS ops_escalations (
        id            SERIAL PRIMARY KEY,
        agent_email   TEXT NOT NULL,
        escalation_type TEXT NOT NULL,
        customer_email TEXT,
        customer_id   TEXT,
        subscription_id TEXT,
        plan_id       TEXT,
        iccid         TEXT,
        network_state TEXT,
        agent_note    TEXT,
        known_issue   TEXT,
        slack_ts      TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Recent 200 escalations
    const { rows } = await queryOpsDb(`
      SELECT * FROM ops_escalations
      ORDER BY created_at DESC
      LIMIT 200
    `);

    // Stats: by type
    const byType = await queryOpsDb(`
      SELECT escalation_type, COUNT(*) AS count
      FROM ops_escalations
      GROUP BY escalation_type
      ORDER BY count DESC
    `);

    // Stats: by agent
    const byAgent = await queryOpsDb(`
      SELECT agent_email, COUNT(*) AS count
      FROM ops_escalations
      GROUP BY agent_email
      ORDER BY count DESC
      LIMIT 20
    `);

    // Stats: by day (last 30 days)
    const byDay = await queryOpsDb(`
      SELECT DATE(created_at AT TIME ZONE 'America/Chicago') AS day,
             escalation_type,
             COUNT(*) AS count
      FROM ops_escalations
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day, escalation_type
      ORDER BY day DESC
    `);

    // Common reasons (first 6 words of agent_note)
    const topNotes = await queryOpsDb(`
      SELECT agent_note, escalation_type, COUNT(*) AS count
      FROM ops_escalations
      WHERE agent_note IS NOT NULL AND agent_note <> ''
      GROUP BY agent_note, escalation_type
      ORDER BY count DESC
      LIMIT 20
    `);

    return NextResponse.json({
      escalations: rows,
      stats: {
        byType: byType.rows,
        byAgent: byAgent.rows,
        byDay: byDay.rows,
        topNotes: topNotes.rows,
        total: rows.length > 0 ? (await queryOpsDb('SELECT COUNT(*) FROM ops_escalations')).rows[0].count : 0,
      },
    });
  } catch (err: any) {
    console.error('Escalations fetch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
