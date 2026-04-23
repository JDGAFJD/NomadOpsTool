import { NextRequest, NextResponse } from 'next/server';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const iccid = url.searchParams.get('iccid');

  if (!iccid) {
    return NextResponse.json({ error: 'ICCID is required' }, { status: 400 });
  }

  try {
    const service = new ThingSpaceService();
    const device = await service.getDeviceDetails(iccid);
    
    if (!device) {
       return NextResponse.json({ found: false });
    }
    
    return NextResponse.json({ found: true, device });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
