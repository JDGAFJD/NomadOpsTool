import { NextRequest, NextResponse } from 'next/server';
import { FreeScoutService } from '@/lib/services/FreeScoutService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const idStr = (await params).id;
  const ticketId = parseInt(idStr, 10);
  
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'invalid ticket id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { action, text, targetStatus } = body;

    const service = new FreeScoutService();

    if (action === 'reply') {
      await service.addReply(ticketId, text, targetStatus || 'active');
    } else if (action === 'note') {
      await service.addNote(ticketId, text);
      if (targetStatus) {
        await service.updateTicketStatus(ticketId, targetStatus);
      }
    } else if (action === 'status_update') {
      if (targetStatus) {
        await service.updateTicketStatus(ticketId, targetStatus);
      }
    } else {
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
