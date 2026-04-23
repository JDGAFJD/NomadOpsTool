import { NextResponse } from 'next/server';
import { queryOpsDb } from '@/lib/opsDb';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
    }

    // Fetch the raw log history for the last 30 days
    const res = await queryOpsDb(`
      SELECT id, agent_email, action_type, target, timestamp 
      FROM ops_activity_logs 
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      ORDER BY timestamp DESC
    `);
    
    const logs = res.rows;
    
    // Aggregate: Group by Day -> Agent -> Action Types
    const analytics: Record<string, Record<string, { searches: number; restores: string[]; suspends: string[]; signins: number }>> = {};

    logs.forEach(log => {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      const agent = log.agent_email;
      
      if (!analytics[date]) analytics[date] = {};
      if (!analytics[date][agent]) {
        analytics[date][agent] = { searches: 0, restores: [], suspends: [], signins: 0 };
      }

      const entry = analytics[date][agent];
      if (log.action_type === 'search_unique_customer') entry.searches += 1;
      if (log.action_type === 'restore_customer' && log.target) entry.restores.push(log.target);
      if (log.action_type === 'suspend_customer' && log.target) entry.suspends.push(log.target);
      if (log.action_type === 'signin') entry.signins += 1;
    });

    return NextResponse.json({ success: true, analytics, rawLogs: logs });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch analytics', message: err.message }, { status: 500 });
  }
}
