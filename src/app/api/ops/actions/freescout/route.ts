import { NextResponse } from 'next/server';
import { FreeScoutService } from '@/lib/services/FreeScoutService';
import { verifyAuth } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized NOC Access' }, { status: 401 });
    }

    const { action, ticketId } = await request.json();

    if (!action || !ticketId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const freescout = new FreeScoutService();

    switch (action) {
      case 'get_threads':
        const threads = await freescout.getTicketThreads(Number(ticketId));
        return NextResponse.json({ success: true, threads });
      
      default:
        return NextResponse.json({ error: 'Unknown Action Type' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('FreeScout Action Pipeline Error:', err.message);
    return NextResponse.json({ error: 'NOC FreeScout Protocol Error', detail: err.message }, { status: 500 });
  }
}
