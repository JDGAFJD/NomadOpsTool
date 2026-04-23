import { NextResponse } from 'next/server';
import { FreeScoutService } from '@/lib/services/FreeScoutService';

export async function GET() {
  try {
    const service = new FreeScoutService();
    const mailboxes = await service.getMailboxes();
    return NextResponse.json({ mailboxes });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
