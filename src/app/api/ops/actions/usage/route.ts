import { NextResponse } from 'next/server';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';

export async function POST(req: Request) {
  try {
    const { iccid, earliest, latest } = await req.json();

    if (!iccid || !earliest || !latest) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tsService = new ThingSpaceService();
    const data = await tsService.getDeviceUsageData(iccid, earliest, latest);

    if (!data) {
       return NextResponse.json({ success: false, error: 'Failed to retrieve usage data from ThingSpace' }, { status: 500 });
    }

    // Attempt to format the data
    const hasMoreData = data.hasMoreData;
    const usageHistory = data.usageHistory || [];

    return NextResponse.json({
      success: true,
      hasMoreData,
      usageHistory
    });
  } catch (error: any) {
    console.error('Usage API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
