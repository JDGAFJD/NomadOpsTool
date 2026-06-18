import { NextResponse } from 'next/server';
import { sendDueCollectionReminders } from '@/lib/collections';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expected = process.env.COLLECTIONS_SCHEDULER_SECRET;
  const received = request.headers.get('authorization');
  if (!expected || received !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await sendDueCollectionReminders()) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Scheduler failed.' }, { status: 500 });
  }
}
