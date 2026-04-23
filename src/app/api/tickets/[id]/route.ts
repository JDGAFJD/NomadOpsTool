import { NextRequest, NextResponse } from 'next/server';
import { FreeScoutService } from '@/lib/services/FreeScoutService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const idStr = (await params).id;
  const ticketId = parseInt(idStr, 10);
  
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'invalid ticket id' }, { status: 400 });
  }

  try {
    const service = new FreeScoutService();
    
    // According to FreeScout API docs, GET /api/conversations/[id] gets the ticket details
    // But since the service currently lacks this exact method, let's implement the generic version 
    // or just fetch it here.
    const data = await service['fetchApi'](`conversations/${ticketId}`);
    const ticket = data;
    
    // We already have a method for threads
    const threads = await service.getTicketThreads(ticketId);

    return NextResponse.json({ ticket, threads });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
