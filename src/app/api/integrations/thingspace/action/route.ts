import { NextRequest, NextResponse } from 'next/server';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';

export async function POST(req: NextRequest) {
  try {
    const { iccid, action } = await req.json();

    if (!iccid || !action || !['suspend', 'restore'].includes(action)) {
      return NextResponse.json({ error: 'Valid ICCID and Action (suspend/restore) are required' }, { status: 400 });
    }

    const service = new ThingSpaceService();
    const result = await service.performAction(iccid, action);
    
    if (!result.success) {
       return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, requestId: result.requestId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
