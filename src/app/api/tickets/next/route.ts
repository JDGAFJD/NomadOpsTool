import { NextRequest, NextResponse } from 'next/server';
import { FreeScoutService } from '@/lib/services/FreeScoutService';

export async function GET(req: NextRequest) {
  const mailboxIdStr = req.nextUrl.searchParams.get('mailboxId');
  if (!mailboxIdStr) {
    return NextResponse.json({ error: 'mailboxId is required' }, { status: 400 });
  }

  const mailboxId = parseInt(mailboxIdStr, 10);
  if (isNaN(mailboxId)) {
    return NextResponse.json({ error: 'invalid mailboxId' }, { status: 400 });
  }

  try {
    const service = new FreeScoutService();
    const ticket = await service.getNextOpenTicket(mailboxId);
    
    if (!ticket) {
      return NextResponse.json({ ticket: null });
    }

    // Also fetch the thread for this ticket immediately so the focus view is ready
    const threads = await service.getTicketThreads(ticket.id);

    return NextResponse.json({ ticket, threads });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
