import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureCollectionsTables();
    const id = Number((await context.params).id);
    const name = String((await request.json()).name || '').trim();
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid saved view ID.' }, { status: 400 });
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: 'View name must be between 2 and 60 characters.' }, { status: 400 });
    }
    const result = await queryOpsDb(
      `UPDATE ops_collection_saved_views SET name=$1,updated_at=NOW()
       WHERE id=$2 AND LOWER(owner_email)=LOWER($3)
       RETURNING id,name,config,created_at,updated_at`,
      [name, id, session.email]
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'Saved view not found.' }, { status: 404 });
    await logActivity(session.email, 'rename_collection_view', String(id), request);
    return NextResponse.json({ success: true, view: result.rows[0] });
  } catch (error: any) {
    const duplicate = error?.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'A saved view with this name already exists.' : error.message || 'The view could not be renamed.' },
      { status: duplicate ? 409 : 500 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureCollectionsTables();
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid saved view ID.' }, { status: 400 });
  const result = await queryOpsDb(
    `DELETE FROM ops_collection_saved_views
     WHERE id=$1 AND LOWER(owner_email)=LOWER($2) RETURNING id`,
    [id, session.email]
  );
  if (!result.rows[0]) return NextResponse.json({ error: 'Saved view not found.' }, { status: 404 });
  await logActivity(session.email, 'delete_collection_view', String(id), request);
  return NextResponse.json({ success: true });
}
