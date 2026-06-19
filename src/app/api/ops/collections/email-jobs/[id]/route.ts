import { after, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { processCollectionEmailJob } from '@/lib/collectionEmailJobs';
import { addCollectionEvent, ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureCollectionsTables();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid job ID.' }, { status: 400 });
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'retry') {
      const result = await queryOpsDb(
        `UPDATE ops_collection_email_jobs
         SET status='queued',retry_count=0,next_retry_at=NOW(),last_error=NULL,updated_at=NOW()
         WHERE id=$1 AND agent_email=$2 AND status='failed' AND dismissed_at IS NULL
         RETURNING id,case_id,status`,
        [id, session.email]
      );
      if (!result.rows[0]) {
        return NextResponse.json({ error: 'This failed task is no longer available to retry.' }, { status: 409 });
      }
      await queryOpsDb(
        `UPDATE ops_collection_attempts SET email_delivery_status='queued',email_delivery_error=NULL
         WHERE id=(SELECT attempt_id FROM ops_collection_email_jobs WHERE id=$1)`,
        [id]
      );
      await addCollectionEvent(Number(result.rows[0].case_id), session.email, 'collection_email_manual_retry', { jobId: id });
      after(() => processCollectionEmailJob(id));
      return NextResponse.json({ success: true, job: result.rows[0] }, { status: 202 });
    }

    if (action === 'dismiss') {
      const result = await queryOpsDb(
        `UPDATE ops_collection_email_jobs
         SET dismissed_at=NOW(),updated_at=NOW()
         WHERE id=$1 AND agent_email=$2 AND status='failed' AND dismissed_at IS NULL
         RETURNING id,case_id`,
        [id, session.email]
      );
      if (!result.rows[0]) {
        return NextResponse.json({ error: 'This failed task is no longer available to dismiss.' }, { status: 409 });
      }
      await addCollectionEvent(Number(result.rows[0].case_id), session.email, 'collection_email_dismissed', { jobId: id });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'The background task could not be updated.' }, { status: 500 });
  }
}
