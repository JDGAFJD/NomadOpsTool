import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { checkCollectionCasePayment } from '@/lib/collections';
import { logActivity } from '@/lib/opsDb';

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid case ID.' }, { status: 400 });
  }

  try {
    const result = await checkCollectionCasePayment(id, session.email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await logActivity(session.email, 'check_collection_payment', String(id), request);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Manual collection payment check failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Chargebee payment check failed.' },
      { status: 500 }
    );
  }
}
