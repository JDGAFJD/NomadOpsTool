import { NextResponse } from 'next/server';
import { processDueCollectionEmailJobs } from '@/lib/collectionEmailJobs';
import { sendDueCollectionReminders } from '@/lib/collections';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const expected = process.env.COLLECTIONS_SCHEDULER_SECRET;
  const received = request.headers.get('authorization');
  if (!expected || received !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [reminders, emailJobs] = await Promise.all([
      sendDueCollectionReminders(),
      processDueCollectionEmailJobs(),
    ]);
    return NextResponse.json({ success: true, ...reminders, ...emailJobs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Scheduler failed.' }, { status: 500 });
  }
}
