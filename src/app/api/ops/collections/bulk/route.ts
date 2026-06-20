import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { parseAdminQueueAction, performAdminQueueAction } from '@/lib/adminQueueActions';
import { logActivity, withOpsDbTransaction } from '@/lib/opsDb';

function parseClaimIds(body: any) {
  return Array.from(new Set<number>(
    (Array.isArray(body?.ids) ? body.ids : [])
      .map(Number)
      .filter((id: number) => Number.isInteger(id) && id > 0)
  )).slice(0, 50);
}

export async function PATCH(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    if (body?.action === 'claim_self') {
      const ids = parseClaimIds(body);
      if (!ids.length) return NextResponse.json({ error: 'Select at least one unassigned case.' }, { status: 400 });
      await ensureCollectionsTables();
      const results = await withOpsDbTransaction(async client => {
        const output: Array<{ id: number; status: 'updated' | 'skipped'; reason?: string }> = [];
        for (const id of ids) {
          const claimed = await client.query(
            `UPDATE ops_collection_cases SET
               status='assigned',assigned_to=$1,assigned_at=NOW(),next_attempt_at=NOW(),updated_at=NOW()
             WHERE id=$2 AND status='unassigned'
             RETURNING id`,
            [session.email, id]
          );
          if (!claimed.rows[0]) {
            output.push({ id, status: 'skipped', reason: 'Case is no longer unassigned.' });
            continue;
          }
          await client.query(
            `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
             VALUES ($1,$2,'claimed',$3::jsonb)`,
            [id, session.email, JSON.stringify({ source: 'bulk_self_claim', attemptDue: new Date().toISOString() })]
          );
          output.push({ id, status: 'updated' });
        }
        return output;
      });
      const updated = results.filter(result => result.status === 'updated');
      await logActivity(session.email, 'bulk_claim_collection_cases', updated.map(result => result.id).join(','), request);
      return NextResponse.json({
        success: true,
        updated: updated.length,
        skipped: results.length - updated.length,
        results,
      });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }
    const parsed = parseAdminQueueAction(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await ensureCollectionsTables();
    const results = await performAdminQueueAction({ kind: 'collection', actor: session.email, ...parsed });
    const updated = results.filter(result => result.status === 'updated');
    await logActivity(session.email, `admin_collection_${parsed.action}`, updated.map(result => result.id).join(','), request);
    return NextResponse.json({
      success: true,
      updated: updated.length,
      skipped: results.length - updated.length,
      results,
    });
  } catch (error: any) {
    const message = error.message || 'Collection administrative action failed.';
    return NextResponse.json({ error: message }, { status: message.includes('assignee') ? 400 : 500 });
  }
}
