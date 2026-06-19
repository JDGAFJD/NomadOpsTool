import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureCollectionsTables();
    const result = await queryOpsDb(
      `SELECT j.id,j.case_id,j.attempt_id,j.status,j.retry_count,j.max_retries,j.next_retry_at,
              j.last_error,j.created_at,j.updated_at,c.customer_name,c.customer_email,a.outcome,a.attempt_number
       FROM ops_collection_email_jobs j
       JOIN ops_collection_cases c ON c.id=j.case_id
       JOIN ops_collection_attempts a ON a.id=j.attempt_id
       WHERE j.agent_email=$1
         AND j.dismissed_at IS NULL
         AND j.status IN ('queued','sending','failed')
       ORDER BY
         CASE j.status WHEN 'failed' THEN 0 WHEN 'sending' THEN 1 ELSE 2 END,
         j.created_at DESC
       LIMIT 50`,
      [session.email]
    );
    return NextResponse.json({ jobs: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load background email tasks.' }, { status: 500 });
  }
}
