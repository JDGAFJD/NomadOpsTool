import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { sanitizeCollectionSavedViewConfig } from '@/lib/collectionSavedViews';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureCollectionsTables();
  const result = await queryOpsDb(
    `SELECT id,name,config,created_at,updated_at
     FROM ops_collection_saved_views WHERE LOWER(owner_email)=LOWER($1)
     ORDER BY updated_at DESC,name`,
    [session.email]
  );
  return NextResponse.json({ success: true, views: result.rows });
}

export async function POST(request: Request) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureCollectionsTables();
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: 'View name must be between 2 and 60 characters.' }, { status: 400 });
    }
    const count = await queryOpsDb(
      'SELECT COUNT(*)::int AS total FROM ops_collection_saved_views WHERE LOWER(owner_email)=LOWER($1)',
      [session.email]
    );
    if (Number(count.rows[0]?.total || 0) >= 25) {
      return NextResponse.json({ error: 'You can save up to 25 Collections views.' }, { status: 409 });
    }
    const config = sanitizeCollectionSavedViewConfig(body.config);
    if (config.successScope === 'all' && session.role !== 'admin') config.successScope = 'mine';
    const result = await queryOpsDb(
      `INSERT INTO ops_collection_saved_views (owner_email,name,config)
       VALUES ($1,$2,$3::jsonb) RETURNING id,name,config,created_at,updated_at`,
      [session.email, name, JSON.stringify(config)]
    );
    await logActivity(session.email, 'save_collection_view', String(result.rows[0].id), request);
    return NextResponse.json({ success: true, view: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    const duplicate = error?.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'A saved view with this name already exists.' : error.message || 'The view could not be saved.' },
      { status: duplicate ? 409 : 500 }
    );
  }
}
