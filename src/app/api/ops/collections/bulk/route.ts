import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { parseAdminQueueAction, performAdminQueueAction } from '@/lib/adminQueueActions';
import { logActivity } from '@/lib/opsDb';

export async function PATCH(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    const parsed = parseAdminQueueAction(await request.json());
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
